import { compareAvailabilitySlotKeys } from '../availability/availability';
import { compareJapaneseText } from '../sort';

function getSortValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined;
  return (value as Record<string, unknown>)[key];
}

export function compareTeamsByDistributionSlot(a: unknown, b: unknown): number {
  const slotCompare = compareAvailabilitySlotKeys(
    String(getSortValue(a, 'timeSlot') || ''),
    String(getSortValue(b, 'timeSlot') || ''),
  );
  if (slotCompare !== 0) return slotCompare;

  const nameCompare = compareJapaneseText(getSortValue(a, 'teamName'), getSortValue(b, 'teamName'));
  if (nameCompare !== 0) return nameCompare;

  const codeCompare = compareJapaneseText(getSortValue(a, 'teamCode'), getSortValue(b, 'teamCode'));
  if (codeCompare !== 0) return codeCompare;

  return compareJapaneseText(getSortValue(a, 'teamId'), getSortValue(b, 'teamId'));
}
