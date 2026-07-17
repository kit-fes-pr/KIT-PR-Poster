import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { hasAdminPrivileges } from '@/lib/utils/admin/auth';
import { loadAreaMap } from '@/lib/server/team-area';
import { buildMissingTeamAccessWindowPatch } from '@/lib/utils/team/team-access';

/**
 * 段階的データ読み込みAPI - チャンク単位でデータを追加取得
 */
function serializeDateTimeValue(value: unknown): string | unknown {
  if (!value) return value;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate?: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return value;
}

export async function GET(request: NextRequest, context: { params: Promise<{ year: string }> }) {
  const startTime = Date.now();

  try {
    const { year } = await context.params;
    const authHeader = request.headers.get('authorization');
    const { searchParams } = new URL(request.url);

    const offset = parseInt(searchParams.get('offset') || '0');
    const limit = parseInt(searchParams.get('limit') || '10');
    const includeMembers = searchParams.get('includeMembers') === 'true';

    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (error) {
      console.error('Auth token verification failed:', error);
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    if (!hasAdminPrivileges(decodedToken as { role?: unknown; isAdmin?: unknown })) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const yearNum = parseInt(year);

    console.log(`📦 段階的データ取得: offset=${offset}, limit=${limit}`);

    const eventSnap = await adminDb
      .collection('distributionEvents')
      .where('year', '==', yearNum)
      .limit(1)
      .get();
    const eventId = !eventSnap.empty ? eventSnap.docs[0].id : null;

    const [byYearSnapshot, byEventDocs] = await Promise.all([
      adminDb.collection('teams').where('year', '==', yearNum).get(),
      eventId
        ? adminDb
            .collection('teams')
            .where('eventId', '==', eventId)
            .get()
            .then((snapshot) => snapshot.docs)
        : Promise.resolve([] as FirebaseFirestore.QueryDocumentSnapshot[]),
    ]);

    const mergedTeamsMap = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    byYearSnapshot.docs.forEach((doc) => mergedTeamsMap.set(doc.id, doc));
    byEventDocs.forEach((doc) => mergedTeamsMap.set(doc.id, doc));

    const orderedTeams = Array.from(mergedTeamsMap.values())
      .map((doc) => ({
        doc,
        createdAtMs: doc.data().createdAt?.toMillis?.() || 0,
        updatedAtMs: doc.data().updatedAt?.toMillis?.() || 0,
      }))
      .sort((a, b) => (b.updatedAtMs || b.createdAtMs) - (a.updatedAtMs || a.createdAtMs));

    const pagedDocs = orderedTeams.slice(offset, offset + limit).map((item) => item.doc);
    const areaMap = await loadAreaMap();
    const teams = await Promise.all(
      pagedDocs.map(async (doc) => {
        const raw = doc.data();
        const areaId = String(raw.areaId || '');
        const assignedArea = String(raw.assignedArea || '');
        const area =
          areaMap.byId.get(areaId) ||
          areaMap.byId.get(assignedArea) ||
          areaMap.byCode.get(assignedArea);
        const teamData = {
          teamId: doc.id,
          ...raw,
          ...(buildMissingTeamAccessWindowPatch(raw) || {}),
          assignedAreaName: area?.areaName || '',
          createdAt: serializeDateTimeValue(raw.createdAt),
          updatedAt: serializeDateTimeValue(raw.updatedAt),
          validStartDate: serializeDateTimeValue(raw.validStartDate),
          validEndDate: serializeDateTimeValue(raw.validEndDate),
          validDate: serializeDateTimeValue(raw.validDate),
          memberCount: 0, // デフォルト
        };

        if (includeMembers) {
          try {
            const memberCountSnapshot = await adminDb
              .collection('assignments')
              .where('year', '==', yearNum)
              .where('teamId', '==', doc.id)
              .count()
              .get();
            teamData.memberCount = memberCountSnapshot.data().count;
          } catch (error) {
            console.warn(`メンバー数取得エラー (team: ${doc.id}):`, error);
          }
        }

        return teamData;
      }),
    );

    // エリア統計の更新
    const areaStats = teams.reduce(
      (acc, team) => {
        const area = String((team as Record<string, unknown>).assignedAreaName || '未設定');
        if (!acc[area]) {
          acc[area] = { teamCount: 0, memberCount: 0 };
        }
        acc[area].teamCount++;
        acc[area].memberCount += team.memberCount || 0;
        return acc;
      },
      {} as Record<string, { teamCount: number; memberCount: number }>,
    );

    // 次のチャンクがあるかチェック
    const hasMore = offset + limit < orderedTeams.length;
    const nextOffset = hasMore ? offset + limit : null;

    const responseTime = Date.now() - startTime;

    return NextResponse.json(
      {
        teams,
        pagination: {
          offset,
          limit,
          hasMore,
          nextOffset,
          returned: teams.length,
        },
        areaStats,
        performance: {
          responseTime,
          chunkTime: responseTime,
        },
      },
      {
        headers: {
          'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
          'X-Chunk-Info': `${offset}-${offset + teams.length - 1}/${limit}`,
        },
      },
    );
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error('段階的取得エラー:', error);
    return NextResponse.json(
      {
        error: '段階的データ取得に失敗しました',
        performance: { responseTime },
      },
      { status: 500 },
    );
  }
}
