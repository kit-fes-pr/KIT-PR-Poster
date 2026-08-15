export type TeamManualRow = {
  teamId: string;
  teamName: string;
  teamCode: string;
  timeSlot?: string;
};

export const TEAM_MANUAL_BASE_URL = 'https://kitfes-poster.vercel.app';

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function buildTeamManualLoginUrl(teamCode: string): string {
  const url = new URL(TEAM_MANUAL_BASE_URL);
  url.searchParams.set('teamCode', teamCode.trim());
  return url.toString();
}

export function normalizeTeamManualRows(value: unknown): TeamManualRow[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((row) => {
      const source = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
      const timeSlot = normalizeString(source.timeSlot);
      return {
        teamId: normalizeString(source.teamId || source.id),
        teamName: normalizeString(source.teamName),
        teamCode: normalizeString(source.teamCode),
        ...(timeSlot ? { timeSlot } : {}),
      };
    })
    .filter((row) => row.teamName && row.teamCode);
}
