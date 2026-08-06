import { normalizeTeamTimeSlot } from '../team/team';

export function normalizeAssignmentYear(value: unknown): number | undefined {
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

export function buildManualAssignmentRecord(input: {
  year: unknown;
  formId: unknown;
  responseId: unknown;
  teamId: unknown;
  timeSlot: unknown;
  assignedAt?: Date;
}): {
  year: number;
  formId: string;
  responseId: string;
  teamId: string;
  timeSlot: string;
  assignedAt: Date;
  assignedBy: 'manual';
} | null {
  const year = normalizeAssignmentYear(input.year);
  const formId = typeof input.formId === 'string' ? input.formId.trim() : '';
  const responseId = typeof input.responseId === 'string' ? input.responseId.trim() : '';
  const teamId = typeof input.teamId === 'string' ? input.teamId.trim() : '';
  const timeSlot = normalizeTeamTimeSlot(input.timeSlot);

  if (!year || !formId || !responseId || !teamId || !timeSlot) {
    return null;
  }

  return {
    year,
    formId,
    responseId,
    teamId,
    timeSlot,
    assignedAt: input.assignedAt || new Date(),
    assignedBy: 'manual',
  };
}

export function buildManualAssignmentRecords(input: {
  year: unknown;
  formId: unknown;
  responseId: unknown;
  targets: Array<{ teamId: unknown; timeSlot?: unknown }>;
  assignedAt?: Date;
}): Array<{
  year: number;
  formId: string;
  responseId: string;
  teamId: string;
  timeSlot: string;
  assignedAt: Date;
  assignedBy: 'manual';
}> | null {
  if (!Array.isArray(input.targets) || input.targets.length === 0) return null;

  const assignedAt = input.assignedAt || new Date();
  const seenTeamIds = new Set<string>();
  const records = input.targets
    .map((target) =>
      buildManualAssignmentRecord({
        year: input.year,
        formId: input.formId,
        responseId: input.responseId,
        teamId: target.teamId,
        timeSlot: target.timeSlot,
        assignedAt,
      }),
    )
    .filter((record): record is NonNullable<typeof record> => {
      if (!record || seenTeamIds.has(record.teamId)) return false;
      seenTeamIds.add(record.teamId);
      return true;
    });

  return records.length > 0 ? records : null;
}

type AssignmentRecordForLabelMerge = {
  year: number;
  formId: string;
  responseId: string;
  teamId: string;
  timeSlot: string;
  assignedAt: unknown;
  assignedBy: 'auto' | 'manual';
};

export function preserveExistingAssignmentLabels(
  nextAssignments: AssignmentRecordForLabelMerge[],
  existingAssignments: Array<{
    teamId?: unknown;
    assignedAt?: unknown;
    assignedBy?: unknown;
  }>,
): AssignmentRecordForLabelMerge[] {
  const existingByTeamId = new Map(
    existingAssignments
      .filter((assignment) => typeof assignment.teamId === 'string' && assignment.teamId.trim())
      .map((assignment) => [String(assignment.teamId).trim(), assignment] as const),
  );

  return nextAssignments.map((assignment) => {
    const existing = existingByTeamId.get(assignment.teamId);
    if (!existing) return assignment;

    return {
      ...assignment,
      assignedAt: existing.assignedAt || assignment.assignedAt,
      assignedBy: existing.assignedBy === 'auto' ? 'auto' : 'manual',
    };
  });
}
