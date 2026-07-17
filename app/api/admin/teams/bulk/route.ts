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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeBulkUpdates(updates: unknown[]): TeamBulkUpdate[] | { error: string } {
  const updateByTeamId = new Map<string, TeamBulkUpdate>();

  for (const update of updates) {
    if (!isRecord(update)) {
      return { error: 'updates の各要素はオブジェクトである必要があります' };
    }

    const teamId = typeof update.teamId === 'string' ? update.teamId.trim() : '';
    if (!teamId) {
      return { error: 'teamId は必須です' };
    }

    updateByTeamId.set(teamId, {
      ...update,
      teamId,
    });
  }

  return Array.from(updateByTeamId.values());
}

type EventAvailabilitySlotCache = {
  byEventId: Map<string, Promise<string[]>>;
  eventIdByYear: Map<number, Promise<string | null>>;
};

async function loadEventAvailabilitySlots(
  eventId: string,
  cache: EventAvailabilitySlotCache,
): Promise<string[]> {
  const cached = cache.byEventId.get(eventId);
  if (cached) return cached;

  const promise = loadEventAvailabilitySlotsUncached(eventId);
  cache.byEventId.set(eventId, promise);
  return promise;
}

async function loadEventAvailabilitySlotsUncached(eventId: string): Promise<string[]> {
  const snap = await adminDb.collection('distributionEvents').doc(eventId).get();
  if (!snap.exists) return [];
  const data = snap.data() as Record<string, unknown>;
  const stored = normalizeAvailabilitySlots(data.distributionAvailabilitySlots);
  if (stored.length > 0) return stored;
  return buildAvailabilitySlotChoices(data.distributionStartDate, data.distributionEndDate).map(
    (choice) => choice.key,
  );
}

async function loadEventIdByYear(
  year: number,
  cache: EventAvailabilitySlotCache,
): Promise<string | null> {
  const cached = cache.eventIdByYear.get(year);
  if (cached) return cached;

  const promise = adminDb
    .collection('distributionEvents')
    .where('year', '==', year)
    .limit(1)
    .get()
    .then((snap) => (snap.empty ? null : snap.docs[0].id));
  cache.eventIdByYear.set(year, promise);
  return promise;
}

async function loadEventAvailabilitySlotsForTeamUpdate(
  update: TeamBulkUpdate,
  currentTeam: Record<string, unknown>,
  cache: EventAvailabilitySlotCache,
): Promise<string[]> {
  if (typeof update.eventId === 'string' && update.eventId) {
    return loadEventAvailabilitySlots(update.eventId, cache);
  }

  const requestedYear =
    typeof update.year === 'number'
      ? update.year
      : typeof update.year === 'string' && /^\d{4}$/.test(update.year)
        ? Number(update.year)
        : null;
  if (requestedYear) {
    const eventId = await loadEventIdByYear(requestedYear, cache);
    if (eventId) {
      return loadEventAvailabilitySlots(eventId, cache);
    }
  }

  return typeof currentTeam.eventId === 'string'
    ? loadEventAvailabilitySlots(currentTeam.eventId, cache)
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

    const normalizedUpdates = normalizeBulkUpdates(body.updates);
    if ('error' in normalizedUpdates) {
      return NextResponse.json({ error: normalizedUpdates.error }, { status: 400 });
    }

    const requestedUpdates = normalizedUpdates;
    const teamIds = requestedUpdates.map((update) =>
      typeof update.teamId === 'string' ? update.teamId.trim() : '',
    );

    const refs = teamIds.map((teamId) => adminDb.collection('teams').doc(teamId));
    const docs = await adminDb.getAll(...refs);
    const eventAvailabilitySlotCache: EventAvailabilitySlotCache = {
      byEventId: new Map(),
      eventIdByYear: new Map(),
    };
    const batchUpdates: Array<{
      ref: FirebaseFirestore.DocumentReference;
      update: Record<string, unknown>;
      team: Record<string, unknown>;
      previousYear?: number;
      nextYear?: number;
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
          eventAvailabilitySlotCache,
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
        previousYear: typeof currentTeam.year === 'number' ? currentTeam.year : undefined,
        nextYear: typeof update.year === 'number' ? update.year : undefined,
      });
    }

    const batch = adminDb.batch();
    for (const item of batchUpdates) {
      batch.update(item.ref, item.update);
    }
    await batch.commit();

    const years = new Set(
      batchUpdates.flatMap((item) => [item.previousYear, item.nextYear]).filter(isFiniteNumber),
    );
    years.forEach((year) => FirestoreCache.invalidateYear(year));

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
