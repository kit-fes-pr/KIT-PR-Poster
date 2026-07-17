import { normalizeTeamTimeSlot } from './team';

export const TEAM_ACCESS_START_HOUR = 8;
export const TEAM_ACCESS_END_HOUR = 21;
export const TEAM_ACCESS_TIME_ZONE = 'Asia/Tokyo';
export const TEAM_ACCESS_WINDOW_VERSION = 1;

function padHour(hour: number) {
  return String(hour).padStart(2, '0');
}

export function buildTeamAccessWindowFromTimeSlot(timeSlot: unknown): {
  validStartDate: string;
  validEndDate: string;
  accessWindowVersion: number;
} | null {
  const normalizedTimeSlot = normalizeTeamTimeSlot(timeSlot);
  if (!normalizedTimeSlot) return null;

  const dateKey = normalizedTimeSlot.slice(0, 10);
  return {
    validStartDate: `${dateKey}T${padHour(TEAM_ACCESS_START_HOUR)}:00:00+09:00`,
    validEndDate: `${dateKey}T${padHour(TEAM_ACCESS_END_HOUR)}:00:00+09:00`,
    accessWindowVersion: TEAM_ACCESS_WINDOW_VERSION,
  };
}

export function buildMissingTeamAccessWindowPatch(team: {
  timeSlot?: unknown;
  validStartDate?: unknown;
  validEndDate?: unknown;
}) {
  if (
    team.validStartDate &&
    team.validEndDate &&
    !isDateOnlyString(team.validStartDate) &&
    !isDateOnlyString(team.validEndDate)
  ) {
    return null;
  }
  return buildTeamAccessWindowFromTimeSlot(team.timeSlot);
}

function parseDateLike(value: unknown): Date | null {
  const obj = value as
    { _seconds?: number; toDate?: () => Date } | string | Date | number | undefined | null;
  if (!obj) return null;
  if (typeof obj === 'string' || typeof obj === 'number') {
    const date = new Date(obj);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (obj instanceof Date) {
    return Number.isNaN(obj.getTime()) ? null : obj;
  }
  if (typeof obj === 'object') {
    if (typeof obj._seconds === 'number') return new Date(obj._seconds * 1000);
    if (typeof obj.toDate === 'function') {
      const date = obj.toDate();
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }
  return null;
}

function isDateOnlyString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function chooseDateTimeValue(...values: unknown[]) {
  return values.find((value) => value && !isDateOnlyString(value));
}

export function formatTeamAccessPeriod(input: {
  timeSlot?: unknown;
  validStartDate?: unknown;
  validEndDate?: unknown;
  validDate?: unknown;
}): string {
  const fallbackWindow = buildMissingTeamAccessWindowPatch(input);
  const start = parseDateLike(
    chooseDateTimeValue(input.validStartDate, input.validDate, fallbackWindow?.validStartDate),
  );
  const end = parseDateLike(
    chooseDateTimeValue(input.validEndDate, input.validDate, fallbackWindow?.validEndDate),
  );
  if (!start && !end) return '-';

  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: TEAM_ACCESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });
  const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: TEAM_ACCESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const timeFormatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: TEAM_ACCESS_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });

  if (start && end) {
    const startDate = dateFormatter.format(start);
    const endDate = dateFormatter.format(end);
    if (startDate === endDate) {
      return `${startDate} ${timeFormatter.format(start)}〜${timeFormatter.format(end)}`;
    }
    return `${formatter.format(start)}〜${formatter.format(end)}`;
  }

  return formatter.format(start || end!);
}

export function isWithinTeamAccessWindow(input: {
  now: Date;
  validStartDate?: unknown;
  validEndDate?: unknown;
  validDate?: unknown;
}): boolean | null {
  if (
    isDateOnlyString(input.validStartDate) ||
    isDateOnlyString(input.validEndDate) ||
    isDateOnlyString(input.validDate)
  ) {
    return null;
  }

  const start = parseDateLike(input.validStartDate || input.validDate);
  const end = parseDateLike(input.validEndDate || input.validDate);
  if (!start && !end) return null;

  const time = input.now.getTime();
  if (start && time < start.getTime()) return false;
  if (end && time > end.getTime()) return false;
  return true;
}
