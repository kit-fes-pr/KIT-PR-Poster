import { adminDb } from '@/lib/firebase-admin';
import { buildNextTeamCode } from '@/lib/utils/team/team-code';

type GenerateNextTeamCodeInput = {
  timeSlot: unknown;
  eventId: unknown;
  year?: unknown;
  excludeTeamId?: string;
};

type GenerateAndReserveNextTeamCodeInput = GenerateNextTeamCodeInput & {
  teamId: string;
};

type TeamCodeReader = (query: FirebaseFirestore.Query) => Promise<FirebaseFirestore.QuerySnapshot>;

const TEAM_CODE_RESERVATIONS_COLLECTION = 'teamCodeReservations';

export function getTeamCodeReservationRef(teamCode: string) {
  return adminDb.collection(TEAM_CODE_RESERVATIONS_COLLECTION).doc(teamCode);
}

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

export async function generateAndReserveNextTeamCodeInTransaction(
  transaction: FirebaseFirestore.Transaction,
  input: GenerateAndReserveNextTeamCodeInput,
): Promise<string | null> {
  const eventId = typeof input.eventId === 'string' ? input.eventId.trim() : '';
  const year =
    typeof input.year === 'number' && Number.isFinite(input.year) ? input.year : undefined;
  const codesByTeamId = new Map<string, string>();

  if (eventId) {
    const byEvent = await transaction.get(
      adminDb.collection('teams').where('eventId', '==', eventId).select('teamCode'),
    );
    byEvent.docs.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>;
      if (typeof data.teamCode === 'string') codesByTeamId.set(doc.id, data.teamCode);
    });
  }

  if (year) {
    const byYear = await transaction.get(
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

  const existingCodes = Array.from(codesByTeamId.values());
  for (let attempts = 0; attempts <= existingCodes.length + 100; attempts++) {
    const candidate = buildNextTeamCode({
      timeSlot: input.timeSlot,
      existingCodes,
    });
    if (!candidate) return null;

    const reservationRef = getTeamCodeReservationRef(candidate);
    const reservationDoc = await transaction.get(reservationRef);
    const reservedTeamId = reservationDoc.data()?.teamId;
    if (reservationDoc.exists && reservedTeamId !== input.teamId) {
      existingCodes.push(candidate);
      continue;
    }

    const existingTeamCodeSnap = await transaction.get(
      adminDb.collection('teams').where('teamCode', '==', candidate).select('teamCode').limit(1),
    );
    const existingTeamCodeDoc = existingTeamCodeSnap.docs.find((doc) => doc.id !== input.teamId);
    if (existingTeamCodeDoc) {
      existingCodes.push(candidate);
      continue;
    }

    const reservationData = {
      teamId: input.teamId,
      teamCode: candidate,
      eventId: eventId || null,
      year: year || null,
      updatedAt: new Date(),
    };
    if (reservationDoc.exists) {
      transaction.set(reservationRef, reservationData, { merge: true });
    } else {
      transaction.create(reservationRef, {
        ...reservationData,
        createdAt: new Date(),
      });
    }
    return candidate;
  }

  return null;
}
