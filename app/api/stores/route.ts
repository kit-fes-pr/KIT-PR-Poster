import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { generateKana } from '@/lib/kanaUtils';
import { Store } from '@/types';
import { hasAdminPrivileges } from '@/lib/utils/admin/auth';
import {
  getDashboardEventIdForYear,
  getDashboardEventIdsBeforeYear,
  parseDashboardYear,
  teamBelongsToDashboardYear,
} from '@/lib/server/dashboard-year';
import { geocodeAddress } from '@/lib/server/geocoding';
import { validateTeamForStoreCreate } from '@/lib/utils/stores/store-route';

function parseOptionalCoordinate(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeTeamCode(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

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
    const includeOld = searchParams.get('includeOld') === 'true';
    const requestedTeamId = searchParams.get('teamId');
    const yearParam = searchParams.get('year');
    const targetYear = yearParam ? parseDashboardYear(yearParam) : null;
    if (yearParam && !targetYear) {
      return NextResponse.json({ error: 'year は4桁の年度で指定してください' }, { status: 400 });
    }

    if (includeOld && !targetYear) {
      return NextResponse.json(
        { error: '過去年度表示には year の指定が必要です' },
        { status: 400 },
      );
    }

    let targetEventId: string | null = targetYear
      ? await getDashboardEventIdForYear(targetYear)
      : 'kodai2025';
    let filterTeamCode: string | null = null;
    let filterTeamName: string | null = null;
    let filterAssignedArea: string | null = null;
    let allowedAreas: string[] = [];
    let hasAllowedAreas = false;

    if (requestedTeamId) {
      const teamDoc = await adminDb.collection('teams').doc(requestedTeamId).get();
      if (!teamDoc.exists) {
        return NextResponse.json({ error: '班が見つかりません' }, { status: 404 });
      }
      const teamData = teamDoc.data() as Record<string, unknown> | undefined;
      if (typeof teamData?.eventId === 'string' && teamData.eventId.trim()) {
        targetEventId = teamData.eventId;
      }
      if (
        targetYear &&
        (!teamData || !teamBelongsToDashboardYear(teamData, targetYear, targetEventId))
      ) {
        return NextResponse.json({ error: '班が見つかりません' }, { status: 404 });
      }
      filterTeamCode = typeof teamData?.teamCode === 'string' ? teamData.teamCode : null;
      filterTeamName = typeof teamData?.teamName === 'string' ? teamData.teamName : null;
      filterAssignedArea =
        typeof teamData?.assignedArea === 'string' ? teamData.assignedArea : null;
    } else if (decodedToken.role === 'team' && scope !== 'all') {
      // チームログイン時の既定表示は自班の担当区域＋周辺区域に限定
      const teamDoc = await adminDb.collection('teams').doc(String(decodedToken.teamId)).get();
      const teamData = teamDoc.data() as Record<string, unknown> | undefined;
      if (typeof teamData?.eventId === 'string' && teamData.eventId.trim()) {
        targetEventId = teamData.eventId;
      }
      if (
        targetYear &&
        (!teamData || !teamBelongsToDashboardYear(teamData, targetYear, targetEventId))
      ) {
        return NextResponse.json({ error: '班が見つかりません' }, { status: 404 });
      }
      filterTeamCode = typeof decodedToken.teamCode === 'string' ? decodedToken.teamCode : null;
      filterTeamName = typeof teamData?.teamName === 'string' ? teamData.teamName : null;
      filterAssignedArea =
        typeof teamData?.assignedArea === 'string' ? teamData.assignedArea : null;
      if (typeof teamData?.assignedArea === 'string' && teamData.assignedArea) {
        const adjacent = Array.isArray(teamData.adjacentAreas)
          ? teamData.adjacentAreas.filter(
              (adjacentArea): adjacentArea is string =>
                typeof adjacentArea === 'string' && !!adjacentArea,
            )
          : [];
        allowedAreas = [teamData.assignedArea, ...adjacent];
        hasAllowedAreas = allowedAreas.length > 0;
        // 自班の店舗履歴は担当区域ではなく班コードで絞り込む。
        // CSV取込などで areaCode が現在の担当区域と異なっていても表示できるようにする。
      }
    }

    if (!targetEventId) {
      if (!includeOld) return NextResponse.json({ stores: [] });
    }

    const oldEventIds = includeOld
      ? await getDashboardEventIdsBeforeYear(targetYear as number)
      : [];
    const eventIds = includeOld ? oldEventIds : targetEventId ? [targetEventId] : [];
    if (eventIds.length === 0) return NextResponse.json({ stores: [] });

    const eventYears = new Map<string, number>();
    if (includeOld) {
      const eventDocs = await Promise.all(
        eventIds.map((eventId) => adminDb.collection('distributionEvents').doc(eventId).get()),
      );
      eventDocs.forEach((eventDoc) => {
        const eventYear = eventDoc.data()?.year;
        const normalizedYear =
          typeof eventYear === 'number'
            ? eventYear
            : typeof eventYear === 'string' && /^\d{4}$/.test(eventYear)
              ? Number(eventYear)
              : null;
        if (normalizedYear !== null && Number.isInteger(normalizedYear)) {
          eventYears.set(eventDoc.id, normalizedYear);
        }
      });
    }

    const loadStoreSnapshots = async () => {
      if (eventIds.length <= 10) {
        let query = adminDb.collection('stores').where('eventId', 'in', eventIds);
        if (area) query = query.where('areaCode', '==', area);
        if (status) query = query.where('distributionStatus', '==', status);
        return [await query.get()];
      }

      return Promise.all(
        eventIds.map(async (eventId) => {
          let query = adminDb.collection('stores').where('eventId', '==', eventId);
          if (area) query = query.where('areaCode', '==', area);
          if (status) query = query.where('distributionStatus', '==', status);
          return query.get();
        }),
      );
    };

    const snapshots = await loadStoreSnapshots();
    const filterTeamCodes = new Set(
      filterTeamCode && filterTeamCode.trim() ? [filterTeamCode.trim()] : [],
    );
    if (includeOld && requestedTeamId && filterTeamName) {
      // 班コードは年度ごとに発行されるため、選択中の班と同名・同区域の
      // 過去年度班コードも集めて、過去の店舗履歴を漏れなく取得する。
      const allTeamsSnapshot = await adminDb.collection('teams').get();
      allTeamsSnapshot.docs.forEach((teamDoc) => {
        const teamData = teamDoc.data() as Record<string, unknown>;
        const teamEventId = typeof teamData.eventId === 'string' ? teamData.eventId : '';
        const sameName = teamData.teamName === filterTeamName;
        const sameArea = !filterAssignedArea || teamData.assignedArea === filterAssignedArea;
        const historicalCode =
          typeof teamData.teamCode === 'string' ? teamData.teamCode.trim() : '';
        if (eventIds.includes(teamEventId) && sameName && sameArea && historicalCode) {
          filterTeamCodes.add(historicalCode);
        }
      });
    }
    const historicalTeamSnapshots =
      includeOld && filterTeamCodes.size > 0
        ? await Promise.all(
            Array.from(filterTeamCodes).flatMap((teamCode) => [
              adminDb.collection('stores').where('createdByTeamCode', '==', teamCode).get(),
              adminDb.collection('stores').where('distributedBy', '==', teamCode).get(),
            ]),
          )
        : [];
    let stores = [...snapshots, ...historicalTeamSnapshots].flatMap((snapshot) =>
      snapshot.docs.map((doc) => {
        const data = doc.data();
        const eventId = typeof data.eventId === 'string' ? data.eventId : '';
        return {
          id: doc.id,
          ...data,
          ...(includeOld && eventYears.has(eventId)
            ? { distributionYear: eventYears.get(eventId) }
            : {}),
        };
      }),
    ) as unknown as Store[];

    stores = Array.from(new Map(stores.map((store) => [store.storeId, store])).values());
    if (includeOld && area) {
      stores = stores.filter((store) => store.areaCode === area);
    }
    if (includeOld && status) {
      stores = stores.filter((store) => store.distributionStatus === status);
    }

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
      if (hasAllowedAreas && allowedAreas.length > 10) {
        stores = stores.filter((s: Store) => allowedAreas.includes(s.areaCode));
      }
      // ログインコード（班）単位で管理: 自分が作成 or 自分が配布した店舗のみ表示
      const selfCode = filterTeamCode;
      stores = stores.filter(
        (s: Store) =>
          normalizeTeamCode(s.createdByTeamCode) === normalizeTeamCode(selfCode) ||
          normalizeTeamCode(s.distributedBy) === normalizeTeamCode(selfCode),
      );
    }

    if (requestedTeamId && filterTeamCodes.size > 0) {
      stores = stores.filter(
        (s: Store) =>
          filterTeamCodes.has(normalizeTeamCode(s.createdByTeamCode)) ||
          filterTeamCodes.has(normalizeTeamCode(s.distributedBy)),
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
      latitude,
      longitude,
      distributionStatus,
      failureReason,
      distributedCount,
      requiresPosterPickup,
      areaCode,
      notes,
    } = await request.json();
    let parsedLatitude = parseOptionalCoordinate(latitude);
    let parsedLongitude = parseOptionalCoordinate(longitude);
    if (parsedLatitude !== undefined && (parsedLatitude < -90 || parsedLatitude > 90))
      parsedLatitude = undefined;
    if (parsedLongitude !== undefined && (parsedLongitude < -180 || parsedLongitude > 180))
      parsedLongitude = undefined;

    if (!storeName || !address) {
      return NextResponse.json({ error: '店名と住所は必須です' }, { status: 400 });
    }

    if (parsedLatitude === undefined || parsedLongitude === undefined) {
      const geocodedLocation = await geocodeAddress(String(address));
      if (geocodedLocation) {
        parsedLatitude = geocodedLocation.lat;
        parsedLongitude = geocodedLocation.lng;
      }
    }

    // チームの担当区域を解決（areaCode が指定されない場合の既定値に使用）
    let teamDoc;
    try {
      teamDoc = await adminDb.collection('teams').doc(String(decodedToken.teamId)).get();
    } catch (error) {
      console.error('Team lookup for store creation failed:', error);
      return NextResponse.json({ error: '班情報の取得に失敗しました' }, { status: 500 });
    }

    const teamValidation = validateTeamForStoreCreate({
      exists: teamDoc.exists,
      data: teamDoc.data() as Record<string, unknown> | undefined,
      targetYear,
      targetEventId,
    });
    if (!teamValidation.ok) {
      return NextResponse.json({ error: teamValidation.error }, { status: teamValidation.status });
    }

    const storeRef = adminDb.collection('stores').doc();
    const storeData: Omit<Store, 'storeId'> = {
      storeName,
      storeNameKana: generateKana(storeName),
      address,
      addressKana: generateKana(address),
      ...(parsedLatitude !== undefined && { latitude: parsedLatitude }),
      ...(parsedLongitude !== undefined && { longitude: parsedLongitude }),
      // areaCode が未指定ならチームの担当区域を使用（なければ teamCode 先頭要素→最後に unknown）
      areaCode:
        areaCode ||
        teamValidation.assignedArea ||
        decodedToken.teamCode?.split('-')[0] ||
        'unknown',
      distributionStatus: distributionStatus || 'pending',
      ...(failureReason && { failureReason }),
      distributedCount: distributedCount || 0,
      distributedBy: decodedToken.teamCode || '',
      createdByTeamCode: decodedToken.teamCode || '',
      ...(distributionStatus === 'completed' && { distributedAt: new Date() }),
      requiresPosterPickup: distributionStatus === 'completed' && requiresPosterPickup === true,
      ...(notes && { notes }),
      registrationMethod: 'manual',
      eventId: teamValidation.eventId || targetEventId || 'kodai2025',
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
