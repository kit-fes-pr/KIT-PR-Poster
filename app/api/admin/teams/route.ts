import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { hasAdminPrivileges } from '@/lib/utils/admin/auth';
import { Team } from '@/types';
import {
  buildAvailabilitySlotChoices,
  normalizeAvailabilitySlots,
} from '@/lib/utils/availability/availability';
import {
  buildTeamCreateData,
  normalizeTeamYear,
  resolveTeamAreaSelection,
} from '@/lib/utils/team/team-api';
import {
  buildMissingTeamAccessWindowPatch,
  buildTeamAccessWindowFromTimeSlot,
} from '@/lib/utils/team/team-access';
import { normalizeTeamTimeSlot } from '@/lib/utils/team/team';
import { FirestoreCache } from '@/lib/utils/server-cache';
import { backfillMissingTeamAccessWindows } from '@/lib/server/team-access-backfill';

async function loadEventAvailabilitySlots(eventId: string): Promise<string[]> {
  const snap = await adminDb.collection('distributionEvents').doc(eventId).get();
  if (!snap.exists) return [];
  const data = snap.data() as Record<string, unknown>;
  const stored = normalizeAvailabilitySlots(data.distributionAvailabilitySlots);
  if (stored.length > 0) return stored;
  return buildAvailabilitySlotChoices(data.distributionStartDate, data.distributionEndDate).map(
    (choice) => choice.key,
  );
}

async function loadAreaForTeam(areaId: unknown, assignedArea: unknown) {
  if (typeof areaId === 'string' && areaId) {
    const doc = await adminDb.collection('areas').doc(areaId).get();
    if (doc.exists) return { areaId: doc.id, ...(doc.data() as Record<string, unknown>) };
  }
  if (typeof assignedArea === 'string' && assignedArea) {
    const snap = await adminDb
      .collection('areas')
      .where('areaCode', '==', assignedArea)
      .limit(1)
      .get();
    if (!snap.empty) {
      const doc = snap.docs[0];
      return { areaId: doc.id, ...(doc.data() as Record<string, unknown>) };
    }
  }
  return null;
}

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

    const { teamCode, teamName, timeSlot, areaId, assignedArea, eventId, year } =
      await request.json();

    if (!teamCode || !teamName || !eventId) {
      return NextResponse.json({ error: '必須フィールドが不足しています' }, { status: 400 });
    }

    // Check if team code already exists
    const existingTeam = await adminDb
      .collection('teams')
      .where('teamCode', '==', teamCode)
      .where('eventId', '==', eventId)
      .limit(1)
      .get();

    if (!existingTeam.empty) {
      return NextResponse.json(
        { error: 'このチームコードは既に使用されています' },
        { status: 400 },
      );
    }

    const eventAvailabilitySlots = await loadEventAvailabilitySlots(String(eventId));
    if (eventAvailabilitySlots.length === 0) {
      return NextResponse.json({ error: '配布枠が未設定です' }, { status: 400 });
    }
    const normalizedTimeSlot = normalizeTeamTimeSlot(timeSlot);
    if (!normalizedTimeSlot) {
      return NextResponse.json(
        { error: 'timeSlot は YYYY-MM-DD_am または YYYY-MM-DD_pm 形式で指定してください' },
        { status: 400 },
      );
    }
    if (!eventAvailabilitySlots.includes(normalizedTimeSlot)) {
      return NextResponse.json(
        { error: 'timeSlot は配布枠キーから選択してください' },
        { status: 400 },
      );
    }

    const area = await loadAreaForTeam(areaId, assignedArea);
    if (!area) {
      return NextResponse.json({ error: '配布区域が見つかりません' }, { status: 400 });
    }

    const teamRef = adminDb.collection('teams').doc();
    const areaSelection = resolveTeamAreaSelection({
      areaId,
      assignedArea,
      area,
    });
    if (!areaSelection) {
      return NextResponse.json({ error: '配布区域が見つかりません' }, { status: 400 });
    }
    const teamData: Omit<Team, 'teamId'> = buildTeamCreateData({
      teamCode,
      teamName,
      timeSlot: normalizedTimeSlot,
      area: areaSelection,
      eventId,
      year: normalizeTeamYear(year),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await teamRef.set({
      teamId: teamRef.id,
      ...teamData,
    });

    if (teamData.year) {
      FirestoreCache.invalidateYear(Number(teamData.year));
    }

    return NextResponse.json({
      success: true,
      team: {
        id: teamRef.id,
        teamId: teamRef.id,
        ...teamData,
      },
    });
  } catch (error) {
    console.error('Create team error:', error);
    return NextResponse.json({ error: 'チームの作成に失敗しました' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const eventIdParam = searchParams.get('eventId');
    const yearParam = searchParams.get('year');
    const scope = searchParams.get('scope');

    if (scope === 'all') {
      const teamsSnapshot = await adminDb.collection('teams').get();
      await backfillMissingTeamAccessWindows(teamsSnapshot.docs, {
        batchFactory: () => adminDb.batch(),
      });
      const teams = teamsSnapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...(doc.data() as Record<string, unknown>),
          ...(buildMissingTeamAccessWindowPatch(doc.data()) || {}),
        }))
        .filter((team) => (team as Record<string, unknown>).isActive !== false);

      return NextResponse.json({ teams });
    }

    let targetEventId = eventIdParam || 'kodai2025';
    let targetYear = Number.NaN;
    if (!eventIdParam && yearParam) {
      const y = parseInt(yearParam);
      targetYear = y;
      const evSnap = await adminDb
        .collection('distributionEvents')
        .where('year', '==', y)
        .limit(1)
        .get();
      if (!evSnap.empty) targetEventId = evSnap.docs[0].id;
    }

    const snapshotMap = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    const byEventId = await adminDb.collection('teams').where('eventId', '==', targetEventId).get();
    byEventId.docs.forEach((doc) => snapshotMap.set(doc.id, doc));

    if (Number.isFinite(targetYear)) {
      const byYear = await adminDb.collection('teams').where('year', '==', targetYear).get();
      byYear.docs.forEach((doc) => snapshotMap.set(doc.id, doc));
    }

    const teamDocs = Array.from(snapshotMap.values());
    await backfillMissingTeamAccessWindows(teamDocs, {
      batchFactory: () => adminDb.batch(),
    });

    const teams = teamDocs
      .map((doc) => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
        ...(buildMissingTeamAccessWindowPatch(doc.data()) || {}),
      }))
      .filter((team) => (team as Record<string, unknown>).isActive !== false);

    return NextResponse.json({ teams });
  } catch (error) {
    console.error('Get teams error:', error);
    return NextResponse.json({ error: 'チーム情報の取得に失敗しました' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
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

    const body = await request.json();
    const { teamId } = body;
    if (!teamId) {
      return NextResponse.json({ error: 'teamId は必須です' }, { status: 400 });
    }

    const ref = adminDb.collection('teams').doc(String(teamId));
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: 'チームが見つかりません' }, { status: 404 });

    const update: Record<string, unknown> = { updatedAt: new Date() };
    const currentTeam = doc.data() as Record<string, unknown>;
    if (typeof body.year === 'number' && Number.isFinite(body.year)) {
      update.year = body.year;
    }
    if (typeof body.timeSlot === 'string') {
      const normalizedTimeSlot = normalizeTeamTimeSlot(body.timeSlot);
      if (!normalizedTimeSlot) {
        return NextResponse.json(
          { error: 'timeSlot は YYYY-MM-DD_am または YYYY-MM-DD_pm 形式で指定してください' },
          { status: 400 },
        );
      }
      const eventId = currentTeam.eventId;
      const eventAvailabilitySlots =
        typeof eventId === 'string' ? await loadEventAvailabilitySlots(eventId) : [];
      if (
        eventAvailabilitySlots.length > 0 &&
        !eventAvailabilitySlots.includes(normalizedTimeSlot)
      ) {
        return NextResponse.json(
          { error: 'timeSlot は配布枠キーから選択してください' },
          { status: 400 },
        );
      }
      update.timeSlot = normalizedTimeSlot;
      Object.assign(update, buildTeamAccessWindowFromTimeSlot(normalizedTimeSlot) || {});
    }
    if (typeof body.teamName === 'string') update.teamName = body.teamName;
    if (typeof body.teamCode === 'string') update.teamCode = body.teamCode;
    if (typeof body.assignedArea === 'string' || typeof body.areaId === 'string') {
      const area = await loadAreaForTeam(body.areaId, body.assignedArea);
      if (!area) {
        return NextResponse.json({ error: '配布区域が見つかりません' }, { status: 400 });
      }
      const areaSelection = resolveTeamAreaSelection({
        areaId: body.areaId,
        assignedArea: body.assignedArea,
        area,
      });
      if (!areaSelection) {
        return NextResponse.json({ error: '配布区域が見つかりません' }, { status: 400 });
      }
      update.areaId = areaSelection.areaId;
      update.assignedArea = areaSelection.assignedArea;
      update.adjacentAreas = areaSelection.adjacentAreas;
    }

    await ref.update(update);
    const updated = await ref.get();
    return NextResponse.json({
      success: true,
      team: { id: updated.id, ...(updated.data() as Record<string, unknown>) },
    });
  } catch (error) {
    console.error('Update team error:', error);
    return NextResponse.json({ error: 'チームの更新に失敗しました' }, { status: 500 });
  }
}
