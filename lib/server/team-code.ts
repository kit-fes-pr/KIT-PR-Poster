import { adminDb } from '@/lib/firebase-admin';
import { buildNextTeamCode } from '@/lib/utils/team/team-code';

type GenerateNextTeamCodeInput = {
  timeSlot: unknown;
  eventId: unknown;
  year?: unknown;
  excludeTeamId?: string;
};

type TeamCodeReader = (query: FirebaseFirestore.Query) => Promise<FirebaseFirestore.QuerySnapshot>;

async function generateNextTeamCodeWithReader(
  input: GenerateNextTeamCodeInput,
  readQuery: TeamCodeReader,
): Promise<string | null> {
  const eventId = typeof input.eventId === 'string' ? input.eventId.trim() : '';
  const year =
    typeof input.year === 'number' && Number.isFinite(input.year) ? input.year : undefined;
  const codesByTeamId = new Map<string, string>();

  if (eventId) {
    const byEvent = await readQuery(
      adminDb.collection('teams').where('eventId', '==', eventId).select('teamCode'),
    );
    byEvent.docs.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>;
      if (typeof data.teamCode === 'string') codesByTeamId.set(doc.id, data.teamCode);
    });
  }

  if (year) {
    const byYear = await readQuery(
      adminDb.collection('teams').where('year', '==', year).select('teamCode'),
    );
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

export async function generateNextTeamCode(
  input: GenerateNextTeamCodeInput,
): Promise<string | null> {
  return generateNextTeamCodeWithReader(input, (query) => query.get());
}

export async function generateNextTeamCodeInTransaction(
  transaction: FirebaseFirestore.Transaction,
  input: GenerateNextTeamCodeInput,
): Promise<string | null> {
  return generateNextTeamCodeWithReader(input, (query) => transaction.get(query));
}
