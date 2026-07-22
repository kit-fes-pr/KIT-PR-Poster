import { adminDb } from '@/lib/firebase-admin';

export function parseDashboardYear(value: string): number | null {
  if (!/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return Number.isInteger(year) ? year : null;
}

export function getTeamYearValue(data: Record<string, unknown>): number | null {
  if (typeof data.year === 'number' && Number.isFinite(data.year)) return data.year;
  if (typeof data.year === 'string' && /^\d{4}$/.test(data.year)) return Number(data.year);
  return null;
}

export async function getDashboardEventIdForYear(year: number): Promise<string | null> {
  const snap = await adminDb
    .collection('distributionEvents')
    .where('year', '==', year)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].id;
}

export function teamBelongsToDashboardYear(
  data: Record<string, unknown>,
  year: number,
  eventId: string | null,
) {
  if (data.isActive === false) return false;
  const teamYear = getTeamYearValue(data);
  return teamYear === year || (typeof data.eventId === 'string' && data.eventId === eventId);
}

export async function dashboardYearExists(year: number): Promise<boolean> {
  const eventId = await getDashboardEventIdForYear(year);
  if (eventId) return true;

  const teamSnap = await adminDb.collection('teams').where('year', '==', year).limit(1).get();
  return !teamSnap.empty;
}

export async function getDashboardTeamForYear(teamId: string, year: number) {
  const eventId = await getDashboardEventIdForYear(year);
  const doc = await adminDb.collection('teams').doc(teamId).get();
  if (!doc.exists) return null;

  const data = doc.data() as Record<string, unknown>;
  if (!teamBelongsToDashboardYear(data, year, eventId)) return null;

  return { id: doc.id, data, eventId };
}
