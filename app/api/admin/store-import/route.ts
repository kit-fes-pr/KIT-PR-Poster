import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { generateKana } from '@/lib/kanaUtils';
import { searchGeocodePlaces } from '@/lib/server/geocoding';
import { hasAdminPrivileges } from '@/lib/utils/admin/auth';
import { loadAreaMap } from '@/lib/server/team-area';
import {
  buildDistributionEventCreateDefaults,
  normalizeDistributionYear,
} from '@/lib/utils/events/events';
import { parseStoreImportCsv, type ParsedStoreImportRow } from '@/lib/utils/stores/store-import';

type AddressSelection = {
  address?: unknown;
  latitude?: unknown;
  longitude?: unknown;
};

type ImportRequest = {
  action?: unknown;
  csv?: unknown;
  targetYear?: unknown;
  areaAssignments?: Record<string, unknown>;
  addressSelections?: Record<string, AddressSelection>;
  eventDates?: Record<string, { startDate?: unknown; endDate?: unknown }>;
};

async function verifyAdmin(request: NextRequest) {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const token = await adminAuth.verifyIdToken(header.split('Bearer ')[1]);
    return hasAdminPrivileges(token as { role?: unknown; isAdmin?: unknown }) ? token : null;
  } catch {
    return null;
  }
}

function parseTargetYear(value: unknown) {
  return value === undefined || value === null || value === ''
    ? null
    : normalizeDistributionYear(value);
}

function parseCoordinate(value: unknown, min: number, max: number) {
  const number =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) && number >= min && number <= max ? number : undefined;
}

async function buildPreview(rows: ParsedStoreImportRow[], targetYear: number | null) {
  const areaMap = await loadAreaMap();
  const areaValues = areaMap.areas.map((area) => {
    const rawArea = area as Record<string, unknown>;
    return {
      areaId: String(rawArea.areaId || ''),
      areaCode: String(rawArea.areaCode || ''),
      areaName: String(rawArea.areaName || ''),
    };
  });
  const addressResults = new Map<string, Awaited<ReturnType<typeof searchGeocodePlaces>>>();

  for (const row of rows) {
    if (!addressResults.has(row.storeName)) {
      addressResults.set(row.storeName, await searchGeocodePlaces(row.storeName));
    }
  }

  const eventYears = [...new Set(rows.map((row) => row.year))].sort();
  const events = await Promise.all(
    eventYears.map(async (year) => {
      const snapshot = await adminDb
        .collection('distributionEvents')
        .where('year', '==', year)
        .limit(1)
        .get();
      const data = snapshot.empty ? null : snapshot.docs[0].data();
      return {
        year,
        exists: Boolean(data),
        eventName: data ? String(data.eventName || `工大祭${year}`) : `工大祭${year}`,
        distributionStartDate: data?.distributionStartDate || null,
        distributionEndDate: data?.distributionEndDate || null,
      };
    }),
  );

  const previewRows = rows.map((row) => {
    const matchingAreas = areaValues.filter(
      (area) => area.areaCode === row.csvArea || area.areaName === row.csvArea,
    );
    const candidates = (addressResults.get(row.storeName) || []).map((result) => ({
      label: result.display_name,
      address: result.display_name,
      latitude: Number(result.lat),
      longitude: Number(result.lon),
    }));

    return {
      ...row,
      targetYearValid: targetYear === null || targetYear === row.year,
      matchedAreaCode: matchingAreas.length === 1 ? matchingAreas[0].areaCode : null,
      areaMatches: matchingAreas,
      areaCandidates: areaValues,
      addressCandidates: candidates.filter(
        (candidate) => Number.isFinite(candidate.latitude) && Number.isFinite(candidate.longitude),
      ),
    };
  });

  return { rows: previewRows, areas: areaValues, events };
}

async function parseRequest(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as ImportRequest | null;
  const csv = typeof body?.csv === 'string' ? body.csv : '';
  const parsed = parseStoreImportCsv(csv);
  const targetYear = parseTargetYear(body?.targetYear);
  return { body, parsed, targetYear };
}

export async function POST(request: NextRequest) {
  const decodedToken = await verifyAdmin(request);
  if (!decodedToken) {
    return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
  }

  try {
    const { body, parsed, targetYear } = await parseRequest(request);
    if (body?.targetYear !== undefined && body.targetYear !== '' && targetYear === null) {
      return NextResponse.json({ error: '対象年度の形式が不正です' }, { status: 400 });
    }
    if (parsed.errors.length > 0 && parsed.rows.length === 0) {
      return NextResponse.json({ errors: parsed.errors }, { status: 400 });
    }
    if (parsed.rows.length > 1000) {
      return NextResponse.json({ error: '一度に取り込める店舗は1000件までです' }, { status: 400 });
    }
    if (targetYear !== null && parsed.rows.some((row) => row.year !== targetYear)) {
      return NextResponse.json(
        { error: `${targetYear}年度以外の行が含まれています` },
        { status: 400 },
      );
    }

    if (body?.action !== 'import') {
      const preview = await buildPreview(parsed.rows, targetYear);
      return NextResponse.json({ ...preview, errors: parsed.errors });
    }

    if (parsed.errors.length > 0) {
      return NextResponse.json({ errors: parsed.errors }, { status: 400 });
    }

    const areaAssignments = body?.areaAssignments || {};
    const addressSelections = body?.addressSelections || {};
    const eventDates = body?.eventDates || {};
    const areaMap = await loadAreaMap();
    const validAreas = new Map(
      areaMap.areas.map((area) => {
        const rawArea = area as Record<string, unknown>;
        return [String(rawArea.areaCode || ''), rawArea] as const;
      }),
    );

    const eventSnapshots = new Map<number, FirebaseFirestore.DocumentSnapshot>();
    const eventYears = [...new Set(parsed.rows.map((row) => row.year))];
    await Promise.all(
      eventYears.map(async (year) => {
        const snapshot = await adminDb
          .collection('distributionEvents')
          .where('year', '==', year)
          .limit(1)
          .get();
        if (!snapshot.empty) eventSnapshots.set(year, snapshot.docs[0]);
      }),
    );

    const missingYears = eventYears.filter((year) => !eventSnapshots.has(year));
    const eventDefaultsByYear = new Map<
      number,
      Exclude<ReturnType<typeof buildDistributionEventCreateDefaults>, { error: string }>
    >();
    for (const year of missingYears) {
      const date = eventDates[String(year)];
      const defaults = buildDistributionEventCreateDefaults({
        year,
        distributionStartDate: date?.startDate,
        distributionEndDate: date?.endDate,
      });
      if ('error' in defaults) {
        return NextResponse.json(
          { error: `${year}年度の配布日を指定してください（${defaults.error}）` },
          { status: 400 },
        );
      }
      eventDefaultsByYear.set(year, defaults);
    }

    const invalidRows: string[] = [];
    const storePayloads = parsed.rows.map((row) => {
      const areaCode = String(areaAssignments[String(row.rowIndex)] || '').trim();
      const area = validAreas.get(areaCode);
      const addressSelection = addressSelections[String(row.rowIndex)] || {};
      const address =
        typeof addressSelection.address === 'string' ? addressSelection.address.trim() : '';
      const latitude = parseCoordinate(addressSelection.latitude, -90, 90);
      const longitude = parseCoordinate(addressSelection.longitude, -180, 180);
      if (!area) invalidRows.push(`${row.rowNumber}行目: 配布地域を選択してください`);
      if (!address) invalidRows.push(`${row.rowNumber}行目: 店舗の住所候補を選択してください`);
      if (!eventSnapshots.has(row.year) && !eventDefaultsByYear.has(row.year))
        invalidRows.push(`${row.rowNumber}行目: 年度イベントがありません`);

      return {
        row,
        areaCode,
        address,
        latitude,
        longitude,
        eventId: eventSnapshots.get(row.year)?.id || `kodai${row.year}`,
      };
    });

    if (invalidRows.length > 0) {
      return NextResponse.json({ errors: invalidRows }, { status: 400 });
    }

    for (const year of missingYears) {
      const defaults = eventDefaultsByYear.get(year);
      if (!defaults) continue;
      const eventRef = adminDb.collection('distributionEvents').doc(defaults.eventId);
      await eventRef.set(
        {
          ...defaults,
          year,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        { merge: false },
      );
      const eventSnapshot = await eventRef.get();
      eventSnapshots.set(year, eventSnapshot);
    }

    const now = new Date();
    for (let start = 0; start < storePayloads.length; start += 400) {
      const batch = adminDb.batch();
      storePayloads.slice(start, start + 400).forEach((payload) => {
        const storeRef = adminDb.collection('stores').doc();
        const storeData = {
          storeId: storeRef.id,
          storeName: payload.row.storeName,
          storeNameKana: generateKana(payload.row.storeName),
          address: payload.address,
          addressKana: generateKana(payload.address),
          ...(payload.latitude !== undefined && { latitude: payload.latitude }),
          ...(payload.longitude !== undefined && { longitude: payload.longitude }),
          areaCode: payload.areaCode,
          distributionStatus: payload.row.status,
          ...(payload.row.status === 'failed' && { failureReason: 'other' as const }),
          distributedCount: 0,
          distributedBy: '',
          createdByTeamCode: '',
          notes: payload.row.notes || undefined,
          registrationMethod: 'manual' as const,
          eventId: payload.eventId,
          createdAt: now,
          updatedAt: now,
        };
        batch.set(storeRef, storeData);
      });
      await batch.commit();
    }

    return NextResponse.json({ success: true, imported: storePayloads.length });
  } catch (error) {
    console.error('Store CSV import error:', error);
    return NextResponse.json({ error: '店舗CSVの処理に失敗しました' }, { status: 500 });
  }
}
