export type StoreCreateTeamValidationInput = {
  exists: boolean;
  data?: Record<string, unknown>;
  targetYear: number | null;
  targetEventId: string | null;
};

export type StoreCreateTeamValidationResult =
  | {
      ok: true;
      assignedArea?: string;
      eventId?: string;
    }
  | {
      ok: false;
      status: 403 | 404;
      error: string;
    };

function getTeamYearValue(data: Record<string, unknown>): number | null {
  if (typeof data.year === 'number' && Number.isFinite(data.year)) return data.year;
  if (typeof data.year === 'string' && /^\d{4}$/.test(data.year)) return Number(data.year);
  return null;
}

function teamBelongsToTargetYear(
  data: Record<string, unknown>,
  year: number,
  eventId: string | null,
): boolean {
  const teamYear = getTeamYearValue(data);
  return teamYear === year || (typeof data.eventId === 'string' && data.eventId === eventId);
}

export function validateTeamForStoreCreate(
  input: StoreCreateTeamValidationInput,
): StoreCreateTeamValidationResult {
  if (!input.exists || !input.data) {
    return { ok: false, status: 404, error: '班が見つかりません' };
  }

  if (input.data.isActive === false) {
    return { ok: false, status: 403, error: '無効な班では店舗を登録できません' };
  }

  if (
    input.targetYear &&
    !teamBelongsToTargetYear(input.data, input.targetYear, input.targetEventId)
  ) {
    return { ok: false, status: 404, error: '班が見つかりません' };
  }

  return {
    ok: true,
    assignedArea: typeof input.data.assignedArea === 'string' ? input.data.assignedArea : undefined,
    eventId: typeof input.data.eventId === 'string' ? input.data.eventId : undefined,
  };
}
