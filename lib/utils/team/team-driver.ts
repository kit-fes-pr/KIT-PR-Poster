export interface TeamDriverCandidate {
  responseId: string;
  name?: string;
  grade: number;
  canDrive: boolean;
  assignedBy?: 'auto' | 'manual';
}

export function selectTeamDriverResponseId(members: TeamDriverCandidate[]): string | undefined {
  return [...members]
    .filter(
      (member) =>
        member.canDrive &&
        typeof member.responseId === 'string' &&
        member.responseId.trim().length > 0,
    )
    .sort((a, b) => {
      const aIsAuto = a.assignedBy === 'auto' ? 1 : 0;
      const bIsAuto = b.assignedBy === 'auto' ? 1 : 0;
      if (aIsAuto !== bIsAuto) return bIsAuto - aIsAuto;
      if (b.grade !== a.grade) return b.grade - a.grade;
      const nameCompare = (a.name || '').localeCompare(b.name || '', 'ja');
      if (nameCompare !== 0) return nameCompare;
      return a.responseId.localeCompare(b.responseId);
    })[0]?.responseId;
}
