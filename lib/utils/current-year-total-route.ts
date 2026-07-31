export function normalizeCurrentYearTotalAuthHeader(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.split('Bearer ')[1]?.trim();
  return token || null;
}

export function resolveCurrentYearTotalTargetEventId(input: {
  eventIdBody?: unknown;
  yearBody?: unknown;
  eventIdQuery?: unknown;
  fallbackEventId?: string;
  yearFromEvent?: unknown;
}) {
  const fallbackEventId = input.fallbackEventId || 'kodai2025';
  const eventIdBody = typeof input.eventIdBody === 'string' ? input.eventIdBody.trim() : '';
  const eventIdQuery = typeof input.eventIdQuery === 'string' ? input.eventIdQuery.trim() : '';
  const yearBody =
    typeof input.yearBody === 'number'
      ? input.yearBody
      : typeof input.yearBody === 'string' && input.yearBody.trim()
        ? Number(input.yearBody)
        : NaN;
  const yearFromEvent =
    typeof input.yearFromEvent === 'number'
      ? input.yearFromEvent
      : typeof input.yearFromEvent === 'string' && input.yearFromEvent.trim()
        ? Number(input.yearFromEvent)
        : NaN;

  const targetEventId = eventIdBody || eventIdQuery || fallbackEventId;
  const targetYear = Number.isFinite(yearBody)
    ? yearBody
    : Number.isFinite(yearFromEvent)
      ? yearFromEvent
      : NaN;

  return {
    targetEventId,
    targetYear,
  };
}

export function buildCurrentYearTotalPayload(input: {
  eventId: string;
  year: number | string;
  stores: Array<Record<string, unknown>>;
  updatedAt?: Date;
}) {
  const stores = input.stores;
  return {
    eventId: input.eventId,
    year: input.year,
    totalStores: stores.length,
    completedStores: stores.filter(
      (s) => s.distributionStatus === 'completed' || s.distributionStatus === 'revisit',
    ).length,
    failedStores: stores.filter((s) => s.distributionStatus === 'failed').length,
    revisitStores: stores.filter(
      (s) => s.requiresPosterPickup === true || s.distributionStatus === 'revisit',
    ).length,
    pendingStores: stores.filter((s) => s.distributionStatus === 'pending').length,
    totalDistributedCount: stores.reduce((sum, s) => sum + (Number(s.distributedCount) || 0), 0),
    updatedAt: input.updatedAt || new Date(),
  };
}

export function buildCurrentYearTotalStoreView(input: {
  stores: Array<Record<string, unknown>>;
  teamsByCode: Record<string, string>;
  teamsByArea: Record<string, Array<{ code: string; name: string }>>;
}) {
  return input.stores.map((s: Record<string, unknown>) => {
    const distributedByName = s.distributedBy
      ? input.teamsByCode[s.distributedBy as string] || null
      : null;
    const assignedTeams =
      s.areaCode && input.teamsByArea[s.areaCode as string]
        ? input.teamsByArea[s.areaCode as string].map((t) => `${t.name}（${t.code}）`)
        : [];
    return {
      ...s,
      distributedByName,
      assignedTeams,
    };
  });
}
