import { normalizeAvailabilitySlots } from '../availability/availability';
import { normalizeTeamTimeSlot } from './team';
import {
  buildTeamCreateData,
  buildTeamUpdateData,
  normalizeTeamYear,
  resolveTeamAreaSelection,
} from './team-api';
import { buildTeamAccessWindowFromTimeSlot } from './team-access';

export function normalizeTeamRouteAuthHeader(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.split('Bearer ')[1]?.trim();
  return token || null;
}

export function buildTeamRouteCreatePayload(input: {
  teamCode: unknown;
  teamName: unknown;
  timeSlot: unknown;
  areaId: unknown;
  assignedArea: unknown;
  eventId: unknown;
  year: unknown;
  area: { areaId?: unknown; areaCode?: unknown; adjacentAreas?: unknown } | null | undefined;
  eventAvailabilitySlots: unknown;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  const normalizedTimeSlot = normalizeTeamTimeSlot(input.timeSlot);
  if (!normalizedTimeSlot) {
    return { error: 'timeSlot は YYYY-MM-DD_am または YYYY-MM-DD_pm 形式で指定してください' };
  }

  const eventAvailabilitySlots = normalizeAvailabilitySlots(input.eventAvailabilitySlots);
  if (eventAvailabilitySlots.length === 0) {
    return { error: '配布枠が未設定です' };
  }
  if (!eventAvailabilitySlots.includes(normalizedTimeSlot)) {
    return { error: 'timeSlot は配布枠キーから選択してください' };
  }

  const areaSelection = resolveTeamAreaSelection({
    areaId: input.areaId,
    assignedArea: input.assignedArea,
    area: input.area ?? null,
  });
  if (!areaSelection) {
    return { error: '配布区域が見つかりません' };
  }

  const data = buildTeamCreateData({
    teamCode: input.teamCode,
    teamName: input.teamName,
    timeSlot: normalizedTimeSlot,
    eventId: input.eventId,
    year: input.year,
    area: areaSelection,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });

  return {
    data,
    areaSelection,
    normalizedTimeSlot,
    eventAvailabilitySlots,
  };
}

export function buildTeamRouteListQuery(input: {
  eventIdParam: unknown;
  yearParam: unknown;
  scope?: unknown;
  fallbackEventId?: string;
}) {
  const eventIdParam = typeof input.eventIdParam === 'string' ? input.eventIdParam : '';
  const yearParam = typeof input.yearParam === 'string' ? input.yearParam : '';
  const scope = typeof input.scope === 'string' ? input.scope : '';
  const fallbackEventId = input.fallbackEventId || 'kodai2025';

  const targetYear = yearParam ? Number(yearParam) : Number.NaN;
  const normalizedYear = normalizeTeamYear(yearParam);

  return {
    scope,
    targetEventId: eventIdParam || fallbackEventId,
    targetYear: Number.isFinite(targetYear) ? targetYear : Number.NaN,
    normalizedYear,
  };
}

export function buildTeamRouteUpdatePayload(input: {
  teamName?: unknown;
  teamCode?: unknown;
  timeSlot?: unknown;
  isActive?: unknown;
  areaId?: unknown;
  assignedArea?: unknown;
  area?: { areaId?: unknown; areaCode?: unknown; adjacentAreas?: unknown } | null | undefined;
  currentEventId?: unknown;
  currentArea?: { areaId?: unknown; areaCode?: unknown; adjacentAreas?: unknown } | null;
  year?: unknown;
  updatedAt?: Date;
  eventAvailabilitySlots?: unknown;
}) {
  const update = buildTeamUpdateData({
    teamName: input.teamName,
    teamCode: input.teamCode,
    year: input.year,
    isActive: input.isActive,
    updatedAt: input.updatedAt,
  });

  if (input.areaId !== undefined || input.assignedArea !== undefined) {
    const areaSelection = resolveTeamAreaSelection({
      areaId: input.areaId,
      assignedArea: input.assignedArea,
      area: input.area ?? null,
    });
    if (!areaSelection) {
      return { error: '配布区域が見つかりません' };
    }
    update.areaId = areaSelection.areaId;
    update.assignedArea = areaSelection.assignedArea;
    update.adjacentAreas = areaSelection.adjacentAreas;
  }

  if (input.timeSlot !== undefined) {
    const normalizedTimeSlot = normalizeTeamTimeSlot(input.timeSlot);
    if (!normalizedTimeSlot) {
      return { error: 'timeSlot は YYYY-MM-DD_am または YYYY-MM-DD_pm 形式で指定してください' };
    }
    const eventAvailabilitySlots = normalizeAvailabilitySlots(input.eventAvailabilitySlots);
    if (eventAvailabilitySlots.length > 0 && !eventAvailabilitySlots.includes(normalizedTimeSlot)) {
      return { error: 'timeSlot は配布枠キーから選択してください' };
    }
    update.timeSlot = normalizedTimeSlot;
    Object.assign(update, buildTeamAccessWindowFromTimeSlot(normalizedTimeSlot) || {});
  }

  return { update };
}
