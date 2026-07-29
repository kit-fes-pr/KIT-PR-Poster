import { normalizeTeamTimeSlot } from './team';

export function buildTeamCodePrefix(timeSlot: unknown): string | null {
  const normalized = normalizeTeamTimeSlot(timeSlot);
  if (!normalized) return null;

  const [datePart, period] = normalized.split('_');
  return `${datePart.replaceAll('-', '')}${period.toUpperCase()}`;
}

export function buildNextTeamCode(input: {
  timeSlot: unknown;
  existingCodes: unknown[];
  minSequence?: number;
}): string | null {
  const prefix = buildTeamCodePrefix(input.timeSlot);
  if (!prefix) return null;

  const minSequence = input.minSequence ?? 1;
  if (!Number.isInteger(minSequence) || minSequence < 1) return null;

  const usedSequences = new Set(
    input.existingCodes
      .filter((code): code is string => typeof code === 'string')
      .map((code) => {
        const match = code.trim().match(new RegExp(`^${prefix}(\\d+)$`));
        return match ? Number(match[1]) : Number.NaN;
      })
      .filter((sequence) => Number.isInteger(sequence) && sequence > 0),
  );

  let nextSequence = minSequence;
  while (usedSequences.has(nextSequence)) {
    nextSequence++;
  }

  return `${prefix}${String(nextSequence).padStart(2, '0')}`;
}
