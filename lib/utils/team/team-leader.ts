export interface TeamLeaderCandidate {
  responseId: string;
  name?: string;
  grade: number;
  section?: string;
}

/**
 * Selects a deterministic leader from the members currently assigned to a team.
 * PR third-years take priority; otherwise the highest grade is selected.
 */
export function selectTeamLeaderResponseId(members: TeamLeaderCandidate[]): string | undefined {
  const validMembers = members.filter(
    (member) => typeof member.responseId === 'string' && member.responseId.trim().length > 0,
  );
  if (validMembers.length === 0) return undefined;

  const prThirdYears = validMembers.filter(
    (member) => member.grade === 3 && member.section?.trim().toUpperCase() === 'PR',
  );
  const candidates = prThirdYears.length > 0 ? prThirdYears : validMembers;

  return [...candidates].sort((a, b) => {
    if (b.grade !== a.grade) return b.grade - a.grade;
    const nameCompare = (a.name || '').localeCompare(b.name || '', 'ja');
    if (nameCompare !== 0) return nameCompare;
    return a.responseId.localeCompare(b.responseId);
  })[0]?.responseId;
}
