import { compareAvailabilitySlotKeys } from '../availability/availability';
import { compareJapaneseText } from '../sort';

export type DistributionTeamSortInput = {
  teamId?: unknown;
  teamCode?: unknown;
  teamName?: unknown;
  timeSlot?: unknown;
};

export function compareTeamsByDistributionSlot(
  a: DistributionTeamSortInput,
  b: DistributionTeamSortInput,
): number {
  const slotCompare = compareAvailabilitySlotKeys(
    String(a.timeSlot || ''),
    String(b.timeSlot || ''),
  );
  if (slotCompare !== 0) return slotCompare;

  const nameCompare = compareJapaneseText(a.teamName, b.teamName);
  if (nameCompare !== 0) return nameCompare;

  const codeCompare = compareJapaneseText(a.teamCode, b.teamCode);
  if (codeCompare !== 0) return codeCompare;

  return compareJapaneseText(a.teamId, b.teamId);
}
