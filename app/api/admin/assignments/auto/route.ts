import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { hasAdminPrivileges } from '@/lib/utils/admin/auth';
import { buildAvailabilitySlotChoices } from '@/lib/utils/availability/availability';
import {
  performAutoAssignment,
  type AutoAssignmentParticipant as Participant,
  type AutoAssignmentTeam as Team,
  type StoredAutoAssignmentRecord as StoredAssignment,
} from '@/lib/utils/assignment/auto-assignment';
import { resolveParticipantSlotKeys } from '@/lib/utils/assignment/assignment';
import { selectTeamLeaderResponseId } from '@/lib/utils/team/team-leader';
import { FirestoreCache } from '@/lib/utils/server-cache';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);

    if (!hasAdminPrivileges(decodedToken as { role?: unknown; isAdmin?: unknown })) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const { year, formId, participants, teams } = await request.json();

    if (!year || !formId || !participants || !teams) {
      return NextResponse.json({ error: '必要なデータが不足しています' }, { status: 400 });
    }

    const eventSlotChoices = await loadEventSlotChoices(year);
    if (eventSlotChoices.length === 0) {
      return NextResponse.json(
        { error: '配布枠が未設定です。先に配布設定で登録してください。' },
        { status: 400 },
      );
    }

    const existingAssignmentsSnapshot = await adminDb
      .collection('assignments')
      .where('year', '==', parseInt(year, 10))
      .where('formId', '==', formId)
      .get();

    const existingAssignments: StoredAssignment[] = existingAssignmentsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        responseId: typeof data.responseId === 'string' ? data.responseId : '',
        teamId: typeof data.teamId === 'string' ? data.teamId : '',
        assignedAt: data.assignedAt?.toDate ? data.assignedAt.toDate() : data.assignedAt,
        assignedBy: data.assignedBy === 'manual' ? 'manual' : 'auto',
        timeSlot: typeof data.timeSlot === 'string' ? data.timeSlot : '',
        year: typeof data.year === 'number' ? data.year : parseInt(year, 10),
        formId: typeof data.formId === 'string' ? data.formId : formId,
      };
    });

    const assignmentResult = performAutoAssignment(
      participants,
      teams,
      eventSlotChoices,
      existingAssignments,
    );

    // 既存の割り当ては自動・手動とも固定扱いにし、未割り当て分だけ追加する
    const batch = adminDb.batch();
    const assignmentCollection = adminDb.collection('assignments');

    assignmentResult.assignments.forEach((assignment) => {
      const docRef = assignmentCollection.doc();
      batch.set(docRef, {
        ...assignment,
        year: parseInt(year),
        formId,
      });
    });

    if (assignmentResult.assignments.length > 0) {
      await batch.commit();
    }

    const allAssignments = [...existingAssignments, ...assignmentResult.assignments];
    const participantById = new Map<string, Participant>(
      participants.map(
        (participant: Participant) => [participant.responseId, participant] as const,
      ),
    );
    const leaderBatch = adminDb.batch();
    let leaderUpdateCount = 0;

    teams.forEach((team: Team) => {
      const teamAssignments = allAssignments.filter(
        (assignment) => assignment.teamId === team.teamId,
      );
      const teamMembers = teamAssignments
        .map((assignment) => {
          const participant = participantById.get(assignment.responseId);
          if (!participant) return null;
          return {
            responseId: participant.responseId,
            name: participant.name,
            grade: Number(participant.grade) || 0,
            section: participant.section,
          };
        })
        .filter((member): member is NonNullable<typeof member> => member !== null);
      const currentLeaderResponseId =
        typeof team.leaderId === 'string' &&
        teamMembers.some((member) => member.responseId === team.leaderId)
          ? team.leaderId
          : undefined;
      const leaderId = currentLeaderResponseId || selectTeamLeaderResponseId(teamMembers) || null;

      if (leaderId !== team.leaderId) {
        leaderBatch.update(adminDb.collection('teams').doc(team.teamId), {
          leaderId,
          updatedAt: new Date(),
        });
        leaderUpdateCount++;
      }
    });

    if (leaderUpdateCount > 0) {
      await leaderBatch.commit();
    }

    if (year && (assignmentResult.assignments.length > 0 || leaderUpdateCount > 0)) {
      FirestoreCache.invalidateYear(parseInt(year, 10));
    }

    const participantIds = new Set(
      participants
        .map((participant: Participant) => participant.responseId)
        .filter((responseId: string) => typeof responseId === 'string' && responseId.length > 0),
    );
    const assignableParticipants = participants.filter((participant: Participant) => {
      const normalizedSlots = resolveParticipantSlotKeys(
        participant.availableSlots,
        eventSlotChoices,
      );
      return normalizedSlots.length > 0;
    });
    const existingAssignedParticipantIds = new Set(
      existingAssignments
        .map((assignment) => assignment.responseId)
        .filter((responseId) => participantIds.has(responseId)),
    );
    const autoAssignedParticipantIds = new Set(
      assignmentResult.assignments.map((assignment) => assignment.responseId),
    );
    const totalAssignedCount = new Set([
      ...existingAssignedParticipantIds,
      ...autoAssignedParticipantIds,
    ]).size;

    return NextResponse.json({
      message: '自動割り当てが完了しました',
      assignments: assignmentResult.assignments,
      stats: {
        total: participants.length,
        assigned: totalAssignedCount,
        unassigned: Math.max(assignableParticipants.length - totalAssignedCount, 0),
        skippedUnavailable: assignmentResult.skippedUnavailable,
        skippedNoMatchingTeam: assignmentResult.skippedNoMatchingTeam,
        skippedFull: assignmentResult.skippedFull,
        carRequiredTeamsWithoutDriver: assignmentResult.carRequiredTeamIdsWithoutDriver.length,
        carRequiredTeamIdsWithoutDriver: assignmentResult.carRequiredTeamIdsWithoutDriver,
      },
    });
  } catch (error) {
    console.error('自動割り当てエラー:', error);
    return NextResponse.json({ error: '自動割り当てに失敗しました' }, { status: 500 });
  }
}

async function loadEventSlotChoices(year: string) {
  const yearNum = parseInt(year, 10);
  if (Number.isNaN(yearNum)) return [];

  const eventSnap = await adminDb
    .collection('distributionEvents')
    .where('year', '==', yearNum)
    .limit(1)
    .get();

  if (eventSnap.empty) return [];

  const eventData = eventSnap.docs[0].data() as Record<string, unknown>;
  const storedSlots = Array.isArray(eventData.distributionAvailabilitySlots)
    ? (eventData.distributionAvailabilitySlots as unknown[]).filter(
        (slot): slot is string => typeof slot === 'string',
      )
    : [];

  if (storedSlots.length > 0) {
    return storedSlots;
  }

  return buildAvailabilitySlotChoices(
    eventData.distributionStartDate,
    eventData.distributionEndDate,
  ).map((choice) => choice.key);
}
