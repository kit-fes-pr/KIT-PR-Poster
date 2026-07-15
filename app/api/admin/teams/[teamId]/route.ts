import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { hasAdminPrivileges } from '@/lib/utils/admin/auth';
import {
  buildAvailabilitySlotChoices,
  normalizeAvailabilitySlots,
} from '@/lib/utils/availability/availability';
import { buildDeletedTeamLogData, shouldBlockTeamDeletion } from '@/lib/utils/team/team-api';
import {
  buildTeamRouteUpdatePayload,
  normalizeTeamRouteAuthHeader,
} from '@/lib/utils/team/team-route';
import { FirestoreCache } from '@/lib/utils/server-cache';

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

export async function GET(request: NextRequest, context: { params: Promise<{ teamId: string }> }) {
  try {
    const { teamId } = await context.params;
    const idToken = normalizeTeamRouteAuthHeader(request.headers.get('authorization'));
    if (!idToken) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }
    const decodedToken = await adminAuth.verifyIdToken(idToken);

    if (!hasAdminPrivileges(decodedToken as { role?: unknown; isAdmin?: unknown })) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const ref = adminDb.collection('teams').doc(String(teamId));
    const doc = await ref.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'チームが見つかりません' }, { status: 404 });
    }

    const team = { teamId: doc.id, ...doc.data() };
    return NextResponse.json({ team });
  } catch (error) {
    console.error('チーム取得エラー:', error);
    return NextResponse.json({ error: 'チームの取得に失敗しました' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await context.params;
    const idToken = normalizeTeamRouteAuthHeader(request.headers.get('authorization'));
    if (!idToken) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }
    const decodedToken = await adminAuth.verifyIdToken(idToken);

    if (!hasAdminPrivileges(decodedToken as { role?: unknown; isAdmin?: unknown })) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const body = await request.json();
    const ref = adminDb.collection('teams').doc(String(teamId));
    const doc = await ref.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'チームが見つかりません' }, { status: 404 });
    }

    const area =
      typeof body.assignedArea === 'string' || typeof body.areaId === 'string'
        ? await loadAreaForTeam(body.areaId, body.assignedArea)
        : null;
    const updateResult = buildTeamRouteUpdatePayload({
      teamName: body.teamName,
      teamCode: body.teamCode,
      timeSlot: body.timeSlot,
      isActive: body.isActive,
      areaId: body.areaId,
      assignedArea: body.assignedArea,
      area,
      eventAvailabilitySlots:
        typeof (doc.data() as Record<string, unknown>).eventId === 'string'
          ? await loadEventAvailabilitySlots(
              (doc.data() as Record<string, unknown>).eventId as string,
            )
          : [],
      updatedAt: new Date(),
    });
    if ('error' in updateResult) {
      return NextResponse.json({ error: updateResult.error }, { status: 400 });
    }
    const update: Record<string, unknown> = updateResult.update;

    await ref.update(update);
    const updated = await ref.get();

    const teamYear = doc.data()?.year;
    if (typeof teamYear === 'number') {
      FirestoreCache.invalidateYear(teamYear);
    }

    return NextResponse.json({ success: true, team: { teamId: updated.id, ...updated.data() } });
  } catch (error) {
    console.error('チーム更新エラー:', error);
    return NextResponse.json({ error: 'チームの更新に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await context.params;
    const authHeader = request.headers.get('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);

    if (!hasAdminPrivileges(decodedToken as { role?: unknown; isAdmin?: unknown })) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const ref = adminDb.collection('teams').doc(String(teamId));
    const doc = await ref.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'チームが見つかりません' }, { status: 404 });
    }

    const teamData = doc.data();
    const teamCode = typeof teamData?.teamCode === 'string' ? teamData.teamCode : '';
    const eventId = typeof teamData?.eventId === 'string' ? teamData.eventId : '';

    if (teamCode) {
      const storesSnap = eventId
        ? await adminDb
            .collection('stores')
            .where('eventId', '==', eventId)
            .where('distributedBy', '==', teamCode)
            .limit(1)
            .get()
        : await adminDb.collection('stores').where('distributedBy', '==', teamCode).limit(1).get();

      if (shouldBlockTeamDeletion({ distributionStoresExist: !storesSnap.empty })) {
        return NextResponse.json(
          { error: '配布記録が存在するため、このチームは削除できません' },
          { status: 409 },
        );
      }
    }

    // バッチ処理で削除ログとチーム削除を実行
    const batch = adminDb.batch();

    // 削除ログを保存
    const deletedLogRef = adminDb.collection('deletedTeams').doc();
    batch.set(
      deletedLogRef,
      buildDeletedTeamLogData({
        teamId,
        teamCode: teamData?.teamCode,
        teamName: teamData?.teamName,
        year: teamData?.year,
        deletedAt: new Date(),
        deletedBy: decodedToken.uid,
      }),
    );

    // チームを削除
    batch.delete(ref);

    await batch.commit();

    const teamYear = teamData?.year;
    if (typeof teamYear === 'number') {
      FirestoreCache.invalidateYear(teamYear);
    }

    return NextResponse.json({ success: true, message: 'チームを削除しました' });
  } catch (error) {
    console.error('チーム削除エラー:', error);
    return NextResponse.json({ error: 'チームの削除に失敗しました' }, { status: 500 });
  }
}
