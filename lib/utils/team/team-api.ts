import { Team } from '../../../types';
import { normalizeAdjacentAreas } from '../area/area';
import { normalizeTeamTimeSlot } from './team';

export interface TeamAreaSelection {
  areaId: string;
  assignedArea: string;
  adjacentAreas: string[];
}

export interface TeamAreaLike {
  areaId?: unknown;
  areaCode?: unknown;
  adjacentAreas?: unknown;
}

export function normalizeTeamYear(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (/^\d{4}$/.test(normalized)) {
      return Number(normalized);
    }
  }
  return undefined;
}

export function resolveTeamAreaSelection(input: {
  areaId: unknown;
  assignedArea: unknown;
  area: TeamAreaLike | null;
}): TeamAreaSelection | null {
  if (!input.area) {
    return null;
  }

  const areaId =
    typeof input.area.areaId === 'string' && input.area.areaId
      ? input.area.areaId
      : typeof input.areaId === 'string'
        ? input.areaId.trim()
        : '';
  const assignedArea =
    typeof input.area.areaCode === 'string' && input.area.areaCode
      ? input.area.areaCode.trim()
      : typeof input.assignedArea === 'string'
        ? input.assignedArea.trim()
        : '';

  if (!areaId && !assignedArea) {
    return null;
  }

  return {
    areaId,
    assignedArea,
    adjacentAreas: normalizeAdjacentAreas(input.area.adjacentAreas),
  };
}

export function buildTeamCreateData(input: {
  teamCode: unknown;
  teamName: unknown;
  timeSlot: unknown;
  eventId: unknown;
  year: unknown;
  area: TeamAreaSelection;
  createdAt?: Date;
  updatedAt?: Date;
}): Omit<Team, 'teamId'> {
  const normalizedTimeSlot = normalizeTeamTimeSlot(input.timeSlot);
  if (!normalizedTimeSlot) {
    throw new Error('timeSlot is invalid');
  }

  return {
    teamCode: String(input.teamCode || '').trim(),
    teamName: String(input.teamName || '').trim(),
    timeSlot: normalizedTimeSlot,
    areaId: input.area.areaId,
    assignedArea: input.area.assignedArea,
    adjacentAreas: normalizeAdjacentAreas(input.area.adjacentAreas),
    eventId: String(input.eventId || ''),
    year: normalizeTeamYear(input.year),
    isActive: true,
    createdAt: input.createdAt || new Date(),
    updatedAt: input.updatedAt || new Date(),
  };
}

export function buildTeamUpdateData(input: {
  teamName?: unknown;
  teamCode?: unknown;
  year?: unknown;
  timeSlot?: unknown;
  isActive?: unknown;
  area?: TeamAreaSelection | null;
  updatedAt?: Date;
}): Record<string, unknown> {
  const update: Record<string, unknown> = {
    updatedAt: input.updatedAt || new Date(),
  };

  if (typeof input.teamName === 'string') update.teamName = input.teamName;
  if (typeof input.teamCode === 'string') update.teamCode = input.teamCode;

  const normalizedYear = normalizeTeamYear(input.year);
  if (typeof normalizedYear === 'number') update.year = normalizedYear;

  if (input.timeSlot !== undefined) {
    const normalizedTimeSlot = normalizeTeamTimeSlot(input.timeSlot);
    if (!normalizedTimeSlot) {
      throw new Error('timeSlot is invalid');
    }
    update.timeSlot = normalizedTimeSlot;
  }

  if (typeof input.isActive === 'boolean') update.isActive = input.isActive;

  if (input.area) {
    update.areaId = input.area.areaId;
    update.assignedArea = input.area.assignedArea;
    update.adjacentAreas = normalizeAdjacentAreas(input.area.adjacentAreas);
  }

  return update;
}

export function buildDeletedTeamLogData(input: {
  teamId: string;
  teamCode?: unknown;
  teamName?: unknown;
  year?: unknown;
  deletedBy: string;
  deletedAt?: Date;
}): Record<string, unknown> {
  return {
    teamId: input.teamId,
    teamCode: input.teamCode,
    teamName: input.teamName,
    year: normalizeTeamYear(input.year),
    deletedAt: input.deletedAt || new Date(),
    deletedBy: input.deletedBy,
  };
}

export function shouldBlockTeamDeletion(params: { distributionStoresExist: boolean }): boolean {
  return params.distributionStoresExist;
}
