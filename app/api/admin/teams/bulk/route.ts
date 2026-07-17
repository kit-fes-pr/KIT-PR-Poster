import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { hasAdminPrivileges } from '@/lib/utils/admin/auth';
import {
  buildAvailabilitySlotChoices,
  normalizeAvailabilitySlots,
} from '@/lib/utils/availability/availability';
import {
  buildTeamRouteUpdatePayload,
  normalizeTeamRouteAuthHeader,
} from '@/lib/utils/team/team-route';
import { FirestoreCache } from '@/lib/utils/server-cache';

type TeamBulkUpdate = {
  teamId?: unknown;
  timeSlot?: unknown;
  eventId?: unknown;
  year?: unknown;
};

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

async function loadEventAvailabilitySlotsForTeamUpdate(
  update: TeamBulkUpdate,
  currentTeam: Record<string, unknown>,
): Promise<string[]> {
  if (typeof update.eventId === 'string' && update.eventId) {
    return loadEventAvailabilitySlots(update.eventId);
  }

  const requestedYear =
    typeof update.year === 'number'
      ? update.year
      : typeof update.year === 'string' && /^\d{4}$/.test(update.year)
        ? Number(update.year)
        : null;
  if (requestedYear) {
    const snap = await adminDb
      .collection('distributionEvents')
      .where('year', '==', requestedYear)
      .limit(1)
      .get();
    if (!snap.empty) {
      return loadEventAvailabilitySlots(snap.docs[0].id);
    }
  }

  return typeof currentTeam.eventId === 'string'
    ? loadEventAvailabilitySlots(currentTeam.eventId)
    : [];
}

export async function PATCH(request: NextRequest) {
  try {
    const idToken = normalizeTeamRouteAuthHeader(request.headers.get('authorization'));
    if (!idToken) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifyIdToken(idToken);
    if (!hasAdminPrivileges(decodedToken as { role?: unknown; isAdmin?: unknown })) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const body = (await request.json()) as { updates?: unknown };
    if (!Array.isArray(body.updates) || body.updates.length === 0) {
      return NextResponse.json({ error: 'updates は1件以上必要です' }, { status: 400 });
    }
    if (body.updates.length > 450) {
      return NextResponse.json(
        { error: '一度に更新できるチーム数は450件までです' },
        { status: 400 },
      );
    }

    const requestedUpdates = body.updates as TeamBulkUpdate[];
    const teamIds = requestedUpdates.map((update) =>
      typeof update.teamId === 'string' ? update.teamId.trim() : '',
    );
    if (teamIds.some((teamId) => !teamId)) {
      return NextResponse.json({ error: 'teamId は必須です' }, { status: 400 });
    }

    const refs = teamIds.map((teamId) => adminDb.collection('teams').doc(teamId));
    const docs = await adminDb.getAll(...refs);
    const batchUpdates: Array<{
      ref: FirebaseFirestore.DocumentReference;
      update: Record<string, unknown>;
      team: Record<string, unknown>;
      year?: number;
    }> = [];

    for (let i = 0; i < requestedUpdates.length; i++) {
      const requestedUpdate = requestedUpdates[i];
      const teamId = teamIds[i];

      const doc = docs[i];
      if (!doc.exists) {
        return NextResponse.json({ error: `チームが見つかりません: ${teamId}` }, { status: 404 });
      }

      const currentTeam = doc.data() as Record<string, unknown>;
      const updateResult = buildTeamRouteUpdatePayload({
        timeSlot: requestedUpdate.timeSlot,
        year: requestedUpdate.year,
        eventAvailabilitySlots: await loadEventAvailabilitySlotsForTeamUpdate(
          requestedUpdate,
          currentTeam,
        ),
        updatedAt: new Date(),
      });
      if ('error' in updateResult) {
        return NextResponse.json(
          { error: `${currentTeam.teamCode || teamId}: ${updateResult.error}` },
          { status: 400 },
        );
      }

      const update = updateResult.update;
      if (typeof requestedUpdate.eventId === 'string' && requestedUpdate.eventId) {
        update.eventId = requestedUpdate.eventId;
      }

      batchUpdates.push({
        ref: doc.ref,
        update,
        team: { teamId: doc.id, ...currentTeam, ...update },
        year:
          typeof update.year === 'number'
            ? update.year
            : typeof currentTeam.year === 'number'
              ? currentTeam.year
              : undefined,
      });
    }

    const batch = adminDb.batch();
    for (const item of batchUpdates) {
      batch.update(item.ref, item.update);
    }
    await batch.commit();

    const years = new Set(batchUpdates.map((item) => item.year).filter((year) => !!year));
    years.forEach((year) => FirestoreCache.invalidateYear(Number(year)));

    return NextResponse.json({
      success: true,
      teams: batchUpdates.map((item) => item.team),
      updatedCount: batchUpdates.length,
    });
  } catch (error) {
    console.error('Bulk update teams error:', error);
    return NextResponse.json({ error: 'チームの一括更新に失敗しました' }, { status: 500 });
  }
}
