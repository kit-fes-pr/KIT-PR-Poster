import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { generateKana } from '@/lib/kanaUtils';
import { Store } from '@/types';
import { hasAdminPrivileges } from '@/lib/utils/admin/auth';
import {
  getDashboardEventIdForYear,
  parseDashboardYear,
  teamBelongsToDashboardYear,
} from '@/lib/server/dashboard-year';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const isAdmin = hasAdminPrivileges(decodedToken as { role?: unknown; isAdmin?: unknown });
    const isTeam = decodedToken.role === 'team' && !!decodedToken.teamId && !!decodedToken.teamCode;
    if (!isAdmin && !isTeam) {
      return NextResponse.json({ error: '閲覧権限がありません' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const area = searchParams.get('area');
    const status = searchParams.get('status');
    const q = searchParams.get('q');
    const scope = (searchParams.get('scope') || '').toLowerCase();
    const requestedTeamId = searchParams.get('teamId');
    const yearParam = searchParams.get('year');
    const targetYear = yearParam ? parseDashboardYear(yearParam) : null;
    if (yearParam && !targetYear) {
      return NextResponse.json({ error: 'year は4桁の年度で指定してください' }, { status: 400 });
    }

    let targetEventId: string | null = targetYear
      ? await getDashboardEventIdForYear(targetYear)
      : 'kodai2025';
    let filterTeamCode: string | null = null;

    if (requestedTeamId) {
      const teamDoc = await adminDb.collection('teams').doc(requestedTeamId).get();
      if (!teamDoc.exists) {
        return NextResponse.json({ error: '班が見つかりません' }, { status: 404 });
      }
      const teamData = teamDoc.data() as Record<string, unknown> | undefined;
      if (
        targetYear &&
        (!teamData || !teamBelongsToDashboardYear(teamData, targetYear, targetEventId))
      ) {
        return NextResponse.json({ error: '班が見つかりません' }, { status: 404 });
      }
      filterTeamCode = typeof teamData?.teamCode === 'string' ? teamData.teamCode : null;
      if (!targetEventId && typeof teamData?.eventId === 'string') {
        targetEventId = teamData.eventId;
      }
    } else if (decodedToken.role === 'team' && scope !== 'all') {
      // チームログイン時の既定表示は自班の担当区域＋周辺区域に限定
      const teamDoc = await adminDb.collection('teams').doc(String(decodedToken.teamId)).get();
      const teamData = teamDoc.data() as Record<string, unknown> | undefined;
      if (
        targetYear &&
        (!teamData || !teamBelongsToDashboardYear(teamData, targetYear, targetEventId))
      ) {
        return NextResponse.json({ error: '班が見つかりません' }, { status: 404 });
      }
      filterTeamCode = typeof decodedToken.teamCode === 'string' ? decodedToken.teamCode : null;
      if (!targetEventId && typeof teamData?.eventId === 'string') {
        targetEventId = teamData.eventId;
      }
      if (teamData?.assignedArea) {
        const adjacent = Array.isArray(teamData.adjacentAreas) ? teamData.adjacentAreas : [];
        const allowedAreas = [teamData.assignedArea, ...adjacent].filter(Boolean);
        // Firestore 'in' フィルタは最大10要素。超える場合は全件取得して後段で絞り込み。
        if (allowedAreas.length > 0 && allowedAreas.length <= 10) {
          if (!targetEventId) return NextResponse.json({ stores: [] });
          let query = adminDb.collection('stores').where('eventId', '==', targetEventId);
          query = query.where('areaCode', 'in', allowedAreas);
          if (status) {
            query = query.where('distributionStatus', '==', status);
          }
          const snapshot = await query.get();
          let stores = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as unknown as Store[];
          if (q) {
            const searchTerm = q.toLowerCase();
            stores = stores.filter(
              (store) =>
                store.storeName.toLowerCase().includes(searchTerm) ||
                store.address.toLowerCase().includes(searchTerm),
            );
          }
          const selfCode = filterTeamCode;
          stores = stores.filter(
            (s: Store) => s.createdByTeamCode === selfCode || s.distributedBy === selfCode,
          );
          stores.sort((a, b) => {
            const nameCompare = a.storeNameKana.localeCompare(b.storeNameKana, 'ja');
            if (nameCompare !== 0) return nameCompare;
            return a.addressKana.localeCompare(b.addressKana, 'ja');
          });
          return NextResponse.json({ stores });
        }
      }
    }

    if (!targetEventId) {
      return NextResponse.json({ stores: [] });
    }

    let query = adminDb.collection('stores').where('eventId', '==', targetEventId);
    if (area) {
      query = query.where('areaCode', '==', area);
    }
    if (status) {
      query = query.where('distributionStatus', '==', status);
    }

    const snapshot = await query.get();
    let stores = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as unknown as Store[];

    if (q) {
      const searchTerm = q.toLowerCase();
      stores = stores.filter(
        (store) =>
          store.storeName.toLowerCase().includes(searchTerm) ||
          store.address.toLowerCase().includes(searchTerm),
      );
    }

    // もし 'in' 条件を使えず全件読み出した場合、自班スコープであればここで絞り込み
    if (decodedToken.role === 'team' && scope !== 'all' && !requestedTeamId) {
      try {
        const teamDoc = await adminDb.collection('teams').doc(String(decodedToken.teamId)).get();
        const teamData = teamDoc.data() as Record<string, unknown> | undefined;
        if (teamData?.assignedArea) {
          const adjacent = Array.isArray(teamData.adjacentAreas) ? teamData.adjacentAreas : [];
          const allowedAreas = [teamData.assignedArea, ...adjacent].filter(Boolean);
          if (allowedAreas.length > 10) {
            stores = stores.filter((s: Store) => allowedAreas.includes(s.areaCode));
          }
        }
      } catch (error) {
        console.error('エラー内容:', error);
      }
      // ログインコード（班）単位で管理: 自分が作成 or 自分が配布した店舗のみ表示
      const selfCode = filterTeamCode;
      stores = stores.filter(
        (s: Store) => s.createdByTeamCode === selfCode || s.distributedBy === selfCode,
      );
    }

    if (filterTeamCode && requestedTeamId) {
      stores = stores.filter(
        (s: Store) => s.createdByTeamCode === filterTeamCode || s.distributedBy === filterTeamCode,
      );
    }

    stores.sort((a, b) => {
      const nameCompare = a.storeNameKana.localeCompare(b.storeNameKana, 'ja');
      if (nameCompare !== 0) return nameCompare;
      return a.addressKana.localeCompare(b.addressKana, 'ja');
    });

    return NextResponse.json({ stores });
  } catch (error) {
    console.error('Get stores error:', error);
    return NextResponse.json({ error: '店舗情報の取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    if (decodedToken.role !== 'team' || !decodedToken.teamId || !decodedToken.teamCode) {
      return NextResponse.json({ error: '班ログインが必要です' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');
    const targetYear = yearParam ? parseDashboardYear(yearParam) : null;
    if (yearParam && !targetYear) {
      return NextResponse.json({ error: 'year は4桁の年度で指定してください' }, { status: 400 });
    }
    const targetEventId = targetYear ? await getDashboardEventIdForYear(targetYear) : null;

    const {
      storeName,
      address,
      distributionStatus,
      failureReason,
      distributedCount,
      areaCode,
      notes,
    } = await request.json();

    if (!storeName || !address) {
      return NextResponse.json({ error: '店名と住所は必須です' }, { status: 400 });
    }

    // チームの担当区域を解決（areaCode が指定されない場合の既定値に使用）
    let teamAssignedArea: string | undefined;
    let teamEventId: string | undefined;
    if (decodedToken.role === 'team' && decodedToken.teamId) {
      try {
        const teamDoc = await adminDb.collection('teams').doc(decodedToken.teamId).get();
        const teamData = teamDoc.data() as Record<string, unknown> | undefined;
        if (
          targetYear &&
          (!teamData || !teamBelongsToDashboardYear(teamData, targetYear, targetEventId))
        ) {
          return NextResponse.json({ error: '班が見つかりません' }, { status: 404 });
        }
        teamAssignedArea = teamData?.assignedArea as string;
        teamEventId = typeof teamData?.eventId === 'string' ? teamData.eventId : undefined;
      } catch (error) {
        console.error('エラー内容:', error);
      }
    }

    const storeRef = adminDb.collection('stores').doc();
    const storeData: Omit<Store, 'storeId'> = {
      storeName,
      storeNameKana: generateKana(storeName),
      address,
      addressKana: generateKana(address),
      // areaCode が未指定ならチームの担当区域を使用（なければ teamCode 先頭要素→最後に unknown）
      areaCode: areaCode || teamAssignedArea || decodedToken.teamCode?.split('-')[0] || 'unknown',
      distributionStatus: distributionStatus || 'pending',
      ...(failureReason && { failureReason }),
      distributedCount: distributedCount || 0,
      distributedBy: decodedToken.teamCode || '',
      createdByTeamCode: decodedToken.teamCode || '',
      ...(distributionStatus === 'completed' && { distributedAt: new Date() }),
      ...(notes && { notes }),
      registrationMethod: 'manual',
      eventId: teamEventId || targetEventId || 'kodai2025',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await storeRef.set({
      storeId: storeRef.id,
      ...storeData,
    });

    return NextResponse.json({
      success: true,
      store: {
        id: storeRef.id,
        storeId: storeRef.id,
        ...storeData,
      },
    });
  } catch (error) {
    console.error('Create store error:', error);
    return NextResponse.json({ error: '店舗の登録に失敗しました' }, { status: 500 });
  }
}
