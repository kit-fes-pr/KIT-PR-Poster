export type AvailabilitySummary = 'morning' | 'afternoon' | 'both' | 'other';

export const UNAVAILABLE_SLOT_KEY = 'unavailable' as const;
export const ALL_AVAILABLE_SLOT_KEY = 'all_available' as const;
export type AvailabilitySlotKey =
  `${string}_${'am' | 'pm'}` | typeof UNAVAILABLE_SLOT_KEY | typeof ALL_AVAILABLE_SLOT_KEY;

export interface AvailabilitySlotChoice {
  key: AvailabilitySlotKey;
  label: string;
  date?: string;
  period?: 'am' | 'pm' | 'special';
}

export const SPECIAL_AVAILABILITY_SLOT_CHOICES: AvailabilitySlotChoice[] = [
  { key: ALL_AVAILABLE_SLOT_KEY, label: '全て可能', period: 'special' },
  { key: UNAVAILABLE_SLOT_KEY, label: '参加不可', period: 'special' },
];

export function getAvailabilitySummaryLabel(
  value: AvailabilitySummary | string | null | undefined,
): string {
  if (!value) return '-';
  if (value === 'morning') return '午前';
  if (value === 'afternoon') return '午後';
  if (value === 'both') return '両方';
  if (value === 'other') return '参加不可';
  return value;
}

function parseDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toSafeDate(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate?: () => Date }).toDate === 'function'
  ) {
    const date = (value as { toDate: () => Date }).toDate();
    return isNaN(date.getTime()) ? null : date;
  }

  return null;
}

export function buildAvailabilitySlotChoices(
  startDate: unknown,
  endDate: unknown,
): AvailabilitySlotChoice[] {
  const start = toSafeDate(startDate);
  const end = toSafeDate(endDate) || start;

  if (!start || !end) {
    return [];
  }

  const choices: AvailabilitySlotChoice[] = [];
  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
  );
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));

  while (cursor.getTime() <= last.getTime()) {
    const dateKey = parseDateKey(cursor);
    const displayLabel = cursor.toLocaleDateString('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      timeZone: 'UTC',
    });

    choices.push({
      key: `${dateKey}_am`,
      label: `${displayLabel} 午前`,
      date: dateKey,
      period: 'am',
    });
    choices.push({
      key: `${dateKey}_pm`,
      label: `${displayLabel} 午後`,
      date: dateKey,
      period: 'pm',
    });

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return choices;
}

export function buildAvailabilitySlotKeysForDateRange(
  startDate: unknown,
  endDate: unknown,
  timeSlot: 'morning' | 'afternoon' | 'both' | 'other' = 'both',
): string[] {
  const start = toSafeDate(startDate) || toSafeDate(endDate);
  const end = toSafeDate(endDate) || start;
  const choices = buildAvailabilitySlotChoices(start, end);
  if (choices.length === 0) return [];

  if (timeSlot === 'morning') {
    return choices.filter((choice) => choice.period === 'am').map((choice) => choice.key);
  }

  if (timeSlot === 'afternoon') {
    return choices.filter((choice) => choice.period === 'pm').map((choice) => choice.key);
  }

  return choices.map((choice) => choice.key);
}

export function formatAvailabilitySlotLabel(key: string): string {
  if (key === 'morning') return '午前';
  if (key === 'afternoon') return '午後';
  if (key === 'both') return '両方';
  if (key === 'other') return '参加不可';
  if (key === UNAVAILABLE_SLOT_KEY) return '参加不可';
  if (key === ALL_AVAILABLE_SLOT_KEY) return '全て可能';

  const match = key.match(/^(\d{4}-\d{2}-\d{2})_(am|pm)$/);
  if (!match) return key;

  const [, datePart, period] = match;
  const date = new Date(`${datePart}T00:00:00Z`);
  if (isNaN(date.getTime())) return key;

  const dateLabel = date.toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    timeZone: 'UTC',
  });

  return `${dateLabel} ${period === 'am' ? '午前' : '午後'}`;
}

export function compareAvailabilitySlotKeys(a: string, b: string): number {
  const parse = (value: string) => {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})_(am|pm)$/);
    if (!match) {
      if (value === ALL_AVAILABLE_SLOT_KEY) return { rank: -2, key: value };
      if (value === UNAVAILABLE_SLOT_KEY) return { rank: -1, key: value };
      return { rank: 9999, key: value };
    }

    const [, datePart, period] = match;
    const periodRank = period === 'am' ? 0 : 1;
    return {
      rank: 0,
      key: `${datePart}_${periodRank}`,
    };
  };

  const pa = parse(a);
  const pb = parse(b);
  if (pa.rank !== pb.rank) return pa.rank - pb.rank;
  return pa.key.localeCompare(pb.key, 'ja');
}

export function sortAvailabilitySlotKeys(values: string[]): string[] {
  return [...values].sort(compareAvailabilitySlotKeys);
}

export function getAvailabilityDateSlotKeys(choices: Array<{ key: string }>): string[] {
  return choices
    .map((choice) => choice.key)
    .filter((key) => key !== UNAVAILABLE_SLOT_KEY && key !== ALL_AVAILABLE_SLOT_KEY);
}

export function toggleAvailabilitySelection(
  currentValues: string[],
  clickedValue: string,
  allDateSlotKeys: string[],
): string[] {
  const current = Array.from(new Set(currentValues.filter(Boolean)));

  if (clickedValue === UNAVAILABLE_SLOT_KEY) {
    if (current.includes(UNAVAILABLE_SLOT_KEY)) {
      return current.filter((value) => value !== UNAVAILABLE_SLOT_KEY);
    }
    return [UNAVAILABLE_SLOT_KEY];
  }

  if (clickedValue === ALL_AVAILABLE_SLOT_KEY) {
    if (current.includes(ALL_AVAILABLE_SLOT_KEY)) {
      return [];
    }
    return Array.from(new Set([...allDateSlotKeys, ALL_AVAILABLE_SLOT_KEY]));
  }

  const nextValues = current.includes(clickedValue)
    ? current.filter((value) => value !== clickedValue && value !== ALL_AVAILABLE_SLOT_KEY)
    : [
        ...current.filter(
          (value) => value !== ALL_AVAILABLE_SLOT_KEY && value !== UNAVAILABLE_SLOT_KEY,
        ),
        clickedValue,
      ];

  return nextValues;
}

export function validateAvailabilitySelection(values: unknown): string | null {
  const selected = normalizeAvailabilitySlots(values);
  if (selected.includes(UNAVAILABLE_SLOT_KEY) && selected.includes(ALL_AVAILABLE_SLOT_KEY)) {
    return '参加不可と全て可能は同時に選択できません';
  }
  return null;
}

export function normalizeAvailabilitySlots(input: unknown): string[] {
  if (Array.isArray(input)) {
    return Array.from(
      new Set(
        input
          .map((value) => normalizeAvailabilitySlotValue(value))
          .filter((value): value is string => Boolean(value)),
      ),
    );
  }

  const normalized = normalizeAvailabilitySlotValue(input);
  return normalized ? [normalized] : [];
}

export function normalizeAvailabilitySlotValue(input: unknown): string | null {
  if (typeof input !== 'string') return null;

  const value = input.trim();
  if (!value) return null;

  if (value === UNAVAILABLE_SLOT_KEY || value === ALL_AVAILABLE_SLOT_KEY) {
    return value;
  }

  if (/^\d{4}-\d{2}-\d{2}_(am|pm)$/.test(value)) {
    return value;
  }

  return value;
}

export function summarizeAvailabilitySlots(slots: string[]): AvailabilitySummary {
  const normalized = normalizeAvailabilitySlots(slots);
  if (normalized.length === 0) return 'other';
  if (normalized.includes(UNAVAILABLE_SLOT_KEY)) return 'other';
  if (normalized.includes(ALL_AVAILABLE_SLOT_KEY)) return 'both';

  const hasAm = normalized.some((slot) => slot.endsWith('_am'));
  const hasPm = normalized.some((slot) => slot.endsWith('_pm'));

  if (hasAm && hasPm) return 'both';
  if (hasAm) return 'morning';
  if (hasPm) return 'afternoon';
  return 'other';
}

export function isAvailableForAnySlot(slots: unknown): boolean {
  const normalized = normalizeAvailabilitySlots(slots);
  return normalized.length > 0 && !normalized.includes(UNAVAILABLE_SLOT_KEY);
}
