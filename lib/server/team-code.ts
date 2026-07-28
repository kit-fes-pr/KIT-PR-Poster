import { adminDb } from '@/lib/firebase-admin';
import { buildNextTeamCode } from '@/lib/utils/team/team-code';

export async function generateNextTeamCode(input: {
  timeSlot: unknown;
  eventId: unknown;
  year?: unknown;
  excludeTeamId?: string;
}): Promise<string | null> {
  const eventId = typeof input.eventId === 'string' ? input.eventId.trim() : '';
  const year =
    typeof input.year === 'number' && Number.isFinite(input.year) ? input.year : undefined;
  const codesByTeamId = new Map<string, string>();

  if (eventId) {
    const byEvent = await adminDb
      .collection('teams')
      .where('eventId', '==', eventId)
      .select('teamCode')
      .get();
    byEvent.docs.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>;
      if (typeof data.teamCode === 'string') codesByTeamId.set(doc.id, data.teamCode);
    });
  }

  if (year) {
    const byYear = await adminDb
      .collection('teams')
      .where('year', '==', year)
      .select('teamCode')
      .get();
    byYear.docs.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>;
      if (typeof data.teamCode === 'string') codesByTeamId.set(doc.id, data.teamCode);
    });
  }

  if (input.excludeTeamId) {
    codesByTeamId.delete(input.excludeTeamId);
  }

  return buildNextTeamCode({
    timeSlot: input.timeSlot,
    existingCodes: Array.from(codesByTeamId.values()),
  });
}
