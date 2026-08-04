import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { generateKana } from '@/lib/kanaUtils';
import { searchGeocodePlaces } from '@/lib/server/geocoding';
import { hasAdminPrivileges } from '@/lib/utils/admin/auth';
import { loadAreaMap } from '@/lib/server/team-area';
import {
  buildAvailabilitySlotChoices,
  normalizeAvailabilitySlots,
} from '@/lib/utils/availability/availability';
import {
  buildDistributionEventCreateDefaults,
  normalizeDistributionYear,
} from '@/lib/utils/events/events';
import { buildTeamCreateData, resolveTeamAreaSelection } from '@/lib/utils/team/team-api';
import { normalizeTeamTimeSlot } from '@/lib/utils/team/team';
import { generateAndReserveNextTeamCodeInTransaction } from '@/lib/server/team-code';
import {
  MAX_DISTRIBUTED_COUNT,
  parseStoreImportCsv,
  type ParsedStoreImportRow,
} from '@/lib/utils/stores/store-import';

type AddressSelection = {
  address?: unknown;
  latitude?: unknown;
  longitude?: unknown;
};

type AddressCandidate = {
  label: string;
  address: string;
  latitude?: number;
  longitude?: number;
  source: 'saved' | 'geocoding' | 'csv';
};

type SavedStoreInfo = {
  addressCandidates: AddressCandidate[];
  areaCodes: string[];
};

type StoreImportRowOverride = {
  storeName?: unknown;
  status?: unknown;
  distributedCount?: unknown;
  notes?: unknown;
};

type TeamAssignment = {
  teamId?: unknown;
  create?: unknown;
  timeSlot?: unknown;
};

type ImportRequest = {
  action?: unknown;
  csv?: unknown;
  targetYear?: unknown;
  areaAssignments?: Record<string, unknown>;
  addressSelections?: Record<string, AddressSelection>;
  rowOverrides?: Record<string, StoreImportRowOverride>;
  teamAssignments?: Record<string, TeamAssignment>;
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

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  callback: (item: T) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await callback(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function findSavedStoreInfo(storeName: string): Promise<SavedStoreInfo> {
  const snapshot = await adminDb
    .collection('stores')
    .where('storeName', '==', storeName)
    .select('address', 'latitude', 'longitude', 'areaCode')
    .limit(10)
    .get();
  const seenAddresses = new Set<string>();
  const areaCodes = new Set<string>();

  const addressCandidates = snapshot.docs.flatMap((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const areaCode = typeof data.areaCode === 'string' ? data.areaCode.trim() : '';
    if (areaCode) areaCodes.add(areaCode);
    const address = typeof data.address === 'string' ? data.address.trim() : '';
    if (!address || seenAddresses.has(address)) return [];
    seenAddresses.add(address);
    return [
      {
        label: address,
        address,
        latitude: parseCoordinate(data.latitude, -90, 90),
        longitude: parseCoordinate(data.longitude, -180, 180),
        source: 'saved' as const,
      },
    ];
  });

  return { addressCandidates, areaCodes: [...areaCodes] };
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
  const addressResults = new Map<string, AddressCandidate[]>();
  const savedAreaCodes = new Map<string, string[]>();
  const firstRowByStoreName = new Map<string, ParsedStoreImportRow>();
  rows.forEach((row) => {
    if (!firstRowByStoreName.has(row.storeName)) firstRowByStoreName.set(row.storeName, row);
  });
  const storeNames = [...firstRowByStoreName.keys()];
  const addressLookups = await mapWithConcurrency(storeNames, 8, async (storeName) => {
    const row = firstRowByStoreName.get(storeName);
    if (!row) return null;
    const savedStoreInfo = await findSavedStoreInfo(storeName);
    let candidates: AddressCandidate[];
    if (row.address) {
      candidates = [{ label: row.address, address: row.address, source: 'csv' }];
    } else if (savedStoreInfo.addressCandidates.length > 0) {
      candidates = savedStoreInfo.addressCandidates;
    } else {
      const geocodedCandidates = await searchGeocodePlaces(storeName);
      candidates = geocodedCandidates
        .map((result) => ({
          label: result.display_name,
          address: result.display_name,
          latitude: Number(result.lat),
          longitude: Number(result.lon),
          source: 'geocoding' as const,
        }))
        .filter(
          (candidate) =>
            Number.isFinite(candidate.latitude) && Number.isFinite(candidate.longitude),
        );
    }
    return { storeName, areaCodes: savedStoreInfo.areaCodes, candidates };
  });
  addressLookups.forEach((lookup) => {
    if (!lookup) return;
    savedAreaCodes.set(lookup.storeName, lookup.areaCodes);
    addressResults.set(lookup.storeName, lookup.candidates);
  });

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
        eventId: snapshot.empty ? `kodai${year}` : snapshot.docs[0].id,
        exists: Boolean(data),
        eventName: data ? String(data.eventName || `工大祭${year}`) : `工大祭${year}`,
        distributionStartDate: data?.distributionStartDate || null,
        distributionEndDate: data?.distributionEndDate || null,
        availabilitySlots: data
          ? normalizeAvailabilitySlots(data.distributionAvailabilitySlots).length > 0
            ? normalizeAvailabilitySlots(data.distributionAvailabilitySlots)
            : buildAvailabilitySlotChoices(
                data.distributionStartDate,
                data.distributionEndDate,
              ).map((choice) => choice.key)
          : [],
      };
    }),
  );

  const previewRows = rows.map((row) => {
    const matchingAreas = areaValues.filter(
      (area) => area.areaCode === row.csvArea || area.areaName === row.csvArea,
    );
    const existingAreaCodes = (savedAreaCodes.get(row.storeName) || []).filter((areaCode) =>
      areaValues.some((area) => area.areaCode === areaCode),
    );
    const matchedAreaCode =
      matchingAreas.length === 1
        ? matchingAreas[0].areaCode
        : existingAreaCodes.length === 1
          ? existingAreaCodes[0]
          : null;
    const candidates = addressResults.get(row.storeName) || [];

    return {
      ...row,
      targetYearValid: targetYear === null || targetYear === row.year,
      matchedAreaCode,
      areaMatches: matchingAreas,
      areaCandidates: areaValues,
      addressCandidates: candidates,
    };
  });

  const teams = (
    await Promise.all(
      events.map(async (event) => {
        const snapshot = await adminDb
          .collection('teams')
          .where('eventId', '==', event.eventId)
          .get();
        return snapshot.docs.map((doc) => {
          const data = doc.data() as Record<string, unknown>;
          return {
            teamId: doc.id,
            teamCode: String(data.teamCode || ''),
            teamName: String(data.teamName || ''),
            assignedArea: String(data.assignedArea || ''),
            areaId: String(data.areaId || ''),
            eventId: event.eventId,
            year: Number(data.year || event.year),
            timeSlot: String(data.timeSlot || ''),
          };
        });
      }),
    )
  ).flat();

  return { rows: previewRows, areas: areaValues, events, teams };
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
    const rowOverrides = body?.rowOverrides || {};
    const teamAssignments = body?.teamAssignments || {};
    const eventDates = body?.eventDates || {};
    const areaMap = await loadAreaMap();
    const validAreas = new Map(
      areaMap.areas.map((area) => {
        const rawArea = area as Record<string, unknown>;
        return [String(rawArea.areaCode || ''), rawArea] as const;
      }),
    );

    const fallbackAddresses = new Map<number, AddressCandidate>();
    const addressFailureReasons = new Map<number, string>();
    const fallbackAreaCodes = new Map<string, string>();
    await Promise.all(
      parsed.rows.map(async (row) => {
        const selection =
          addressSelections[String(row.rowIndex)] || addressSelections[String(row.rowNumber)];
        if (!selection?.address && !row.address) {
          const savedStoreInfo = await findSavedStoreInfo(row.storeName);
          let candidates = savedStoreInfo.addressCandidates;
          const hasSavedAddress = candidates.length > 0;
          if (candidates.length === 0) {
            const geocodedCandidates = await searchGeocodePlaces(row.storeName);
            candidates = geocodedCandidates
              .map((result) => ({
                label: result.display_name,
                address: result.display_name,
                latitude: Number(result.lat),
                longitude: Number(result.lon),
                source: 'geocoding' as const,
              }))
              .filter(
                (candidate) =>
                  Number.isFinite(candidate.latitude) && Number.isFinite(candidate.longitude),
              );
          }
          if (candidates.length === 1) {
            fallbackAddresses.set(row.rowIndex, candidates[0]);
          } else if (candidates.length === 0) {
            addressFailureReasons.set(
              row.rowIndex,
              hasSavedAddress
                ? '保存済み住所を確認できませんでした'
                : 'CSV住所が空欄で、保存済み住所と店舗名検索の候補も見つかりませんでした',
            );
          } else {
            addressFailureReasons.set(
              row.rowIndex,
              hasSavedAddress
                ? '保存済み住所が複数あるため、住所候補を1件選択してください'
                : '店舗名検索の候補が複数あるため、住所候補を1件選択してください',
            );
          }
        } else if (!selection?.address && row.address) {
          addressFailureReasons.set(row.rowIndex, 'CSV住所が空文字として送信されました');
        }
        const selectedAreaCode = String(areaAssignments[row.csvArea.trim()] || '').trim();
        if (selectedAreaCode) return;
        const savedStoreInfo = await findSavedStoreInfo(row.storeName);
        const existingAreaCodes = savedStoreInfo.areaCodes.filter((areaCode) =>
          validAreas.has(areaCode),
        );
        if (existingAreaCodes.length === 1) {
          const current = fallbackAreaCodes.get(row.csvArea.trim());
          if (current === undefined) {
            fallbackAreaCodes.set(row.csvArea.trim(), existingAreaCodes[0]);
          } else if (current !== existingAreaCodes[0]) {
            fallbackAreaCodes.set(row.csvArea.trim(), '');
          }
        }
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
    const invalidAreas = new Set<string>();
    const storePayloads = parsed.rows.map((row) => {
      const override = rowOverrides[String(row.rowIndex)] || {};
      const storeName =
        typeof override.storeName === 'string' ? override.storeName.trim() : row.storeName;
      const notes = typeof override.notes === 'string' ? override.notes.trim() : row.notes;
      const status =
        override.status === 'failed' || override.status === 'completed'
          ? override.status
          : row.status;
      const rawDistributedCount =
        override.distributedCount === undefined
          ? row.distributedCount
          : typeof override.distributedCount === 'number' ||
              typeof override.distributedCount === 'string'
            ? Number(override.distributedCount)
            : NaN;
      const distributedCount =
        Number.isInteger(rawDistributedCount) && rawDistributedCount >= 0
          ? rawDistributedCount
          : -1;
      const areaCode = String(
        areaAssignments[row.csvArea.trim()] || fallbackAreaCodes.get(row.csvArea.trim()) || '',
      ).trim();
      const area = validAreas.get(areaCode);
      const addressSelection =
        addressSelections[String(row.rowIndex)] || addressSelections[String(row.rowNumber)] || {};
      const address =
        typeof addressSelection.address === 'string' && addressSelection.address.trim()
          ? addressSelection.address.trim()
          : row.address || fallbackAddresses.get(row.rowIndex)?.address || '';
      const latitude = parseCoordinate(
        addressSelection.latitude ?? fallbackAddresses.get(row.rowIndex)?.latitude,
        -90,
        90,
      );
      const longitude = parseCoordinate(
        addressSelection.longitude ?? fallbackAddresses.get(row.rowIndex)?.longitude,
        -180,
        180,
      );
      if (!area && !invalidAreas.has(row.csvArea)) {
        invalidAreas.add(row.csvArea);
        invalidRows.push(`${row.csvArea}: システム配布区域を選択してください`);
      }
      if (!storeName) invalidRows.push(`${row.rowNumber}行目: 店舗名を入力してください`);
      if (
        distributedCount < 0 ||
        distributedCount > MAX_DISTRIBUTED_COUNT ||
        !Number.isInteger(distributedCount)
      ) {
        invalidRows.push(
          `${row.rowNumber}行目: 配布枚数は0以上${MAX_DISTRIBUTED_COUNT}以下の整数で指定してください`,
        );
      }
      if (!address) {
        invalidRows.push(
          `${row.rowNumber}行目: 店舗の住所候補を選択してください（${addressFailureReasons.get(row.rowIndex) || 'インポート時の送信データに住所がありません'}）`,
        );
      }
      if (!eventSnapshots.has(row.year) && !eventDefaultsByYear.has(row.year))
        invalidRows.push(`${row.rowNumber}行目: 年度イベントがありません`);

      return {
        row,
        storeName,
        notes,
        status,
        distributedCount,
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
      await adminDb.runTransaction(async (transaction) => {
        const existingEvent = await transaction.get(eventRef);
        if (existingEvent.exists) return;
        transaction.create(eventRef, {
          ...defaults,
          year,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });
      const eventSnapshot = await eventRef.get();
      eventSnapshots.set(year, eventSnapshot);
    }

    const now = new Date();
    const teamCodesByGroup = new Map<string, string>();
    const storeGroups = new Map<string, (typeof storePayloads)[number][]>();
    storePayloads.forEach((payload) => {
      const groupKey = `${payload.row.year}:${payload.areaCode}`;
      const group = storeGroups.get(groupKey);
      if (group) group.push(payload);
      else storeGroups.set(groupKey, [payload]);
    });

    for (const [groupKey, groupPayloads] of storeGroups) {
      const firstPayload = groupPayloads[0];
      const assignment = teamAssignments[groupKey] || {};
      const requestedTeamId = typeof assignment.teamId === 'string' ? assignment.teamId.trim() : '';
      if (requestedTeamId) {
        const teamSnapshot = await adminDb.collection('teams').doc(requestedTeamId).get();
        const teamData = teamSnapshot.data() as Record<string, unknown> | undefined;
        if (
          !teamSnapshot.exists ||
          String(teamData?.eventId || '') !== firstPayload.eventId ||
          String(teamData?.assignedArea || '') !== firstPayload.areaCode
        ) {
          return NextResponse.json(
            { error: `${groupKey}: 選択されたチームが年度または配布区域と一致しません` },
            { status: 400 },
          );
        }
        const teamCode = String(teamData?.teamCode || '').trim();
        if (!teamCode) {
          return NextResponse.json(
            { error: `${groupKey}: チームコードがありません` },
            { status: 400 },
          );
        }
        teamCodesByGroup.set(groupKey, teamCode);
        continue;
      }

      if (assignment.create === false) {
        return NextResponse.json(
          { error: `${groupKey}: 割り当てるチームを選択してください` },
          { status: 400 },
        );
      }

      const eventSnapshot = eventSnapshots.get(firstPayload.row.year);
      const eventData = eventSnapshot?.data() as Record<string, unknown> | undefined;
      const availabilitySlots = eventData
        ? normalizeAvailabilitySlots(eventData.distributionAvailabilitySlots).length > 0
          ? normalizeAvailabilitySlots(eventData.distributionAvailabilitySlots)
          : buildAvailabilitySlotChoices(
              eventData.distributionStartDate,
              eventData.distributionEndDate,
            ).map((choice) => choice.key)
        : [];
      const timeSlot = normalizeTeamTimeSlot(assignment.timeSlot || availabilitySlots[0]);
      if (!timeSlot || !availabilitySlots.includes(timeSlot)) {
        return NextResponse.json(
          { error: `${groupKey}: 自動作成するチームの配布枠を選択してください` },
          { status: 400 },
        );
      }
      const area = validAreas.get(firstPayload.areaCode);
      const areaSelection = resolveTeamAreaSelection({
        areaId: area?.areaId,
        assignedArea: firstPayload.areaCode,
        area: area || null,
      });
      if (!areaSelection) {
        return NextResponse.json(
          { error: `${groupKey}: 配布区域を解決できません` },
          { status: 400 },
        );
      }
      const teamRef = adminDb.collection('teams').doc();
      const teamData = await adminDb.runTransaction(async (transaction) => {
        const teamCode = await generateAndReserveNextTeamCodeInTransaction(transaction, {
          timeSlot,
          eventId: firstPayload.eventId,
          year: firstPayload.row.year,
          teamId: teamRef.id,
        });
        if (!teamCode) return null;
        const data = buildTeamCreateData({
          teamCode,
          teamName: `${String(area?.areaName || firstPayload.areaCode)}配布班`,
          timeSlot,
          area: areaSelection,
          eventId: firstPayload.eventId,
          year: firstPayload.row.year,
          createdAt: now,
          updatedAt: now,
        });
        transaction.set(teamRef, { teamId: teamRef.id, ...data });
        return { teamCode };
      });
      if (!teamData) {
        return NextResponse.json(
          { error: `${groupKey}: チームの自動作成に失敗しました` },
          { status: 400 },
        );
      }
      teamCodesByGroup.set(groupKey, teamData.teamCode);
    }

    for (let start = 0; start < storePayloads.length; start += 400) {
      const chunk = storePayloads.slice(start, start + 400);
      const batch = adminDb.batch();
      chunk.forEach((payload) => {
        const storeRef = adminDb.collection('stores').doc();
        const storeData = {
          storeId: storeRef.id,
          storeName: payload.storeName,
          storeNameKana: generateKana(payload.storeName),
          address: payload.address,
          addressKana: generateKana(payload.address),
          ...(payload.latitude !== undefined && { latitude: payload.latitude }),
          ...(payload.longitude !== undefined && { longitude: payload.longitude }),
          areaCode: payload.areaCode,
          distributedBy: teamCodesByGroup.get(`${payload.row.year}:${payload.areaCode}`) || '',
          distributionStatus: payload.status,
          ...(payload.status === 'failed' && { failureReason: 'other' as const }),
          distributedCount: payload.status === 'completed' ? payload.distributedCount : 0,
          ...(payload.status === 'completed' && { distributedAt: now }),
          createdByTeamCode: teamCodesByGroup.get(`${payload.row.year}:${payload.areaCode}`) || '',
          notes: payload.notes || '',
          registrationMethod: 'manual' as const,
          eventId: payload.eventId,
          createdAt: now,
          updatedAt: now,
        };
        batch.create(storeRef, storeData);
      });
      await batch.commit();
    }

    return NextResponse.json({ success: true, imported: storePayloads.length });
  } catch (error) {
    console.error('Store CSV import error:', error);
    return NextResponse.json({ error: '店舗CSVの処理に失敗しました' }, { status: 500 });
  }
}
