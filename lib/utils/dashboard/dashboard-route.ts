import { serializeDateTimeValue } from '../dateUtils';

export type DashboardMemberRecord = {
  name: string;
  studentId: string;
  grade: string;
  department: string;
};

export type DashboardMemberStats = {
  totalMembers: number;
  byTeam: Record<
    string,
    {
      count: number;
      members: DashboardMemberRecord[];
    }
  >;
};

export type DashboardTeamStatsInput = {
  teams: Array<Record<string, unknown> & { teamId: string }>;
  memberStatsByTeam: DashboardMemberStats['byTeam'];
};

export function buildDashboardEventData(input: {
  id: string;
  createdAt?: unknown;
  distributionStartDate?: unknown;
  distributionEndDate?: unknown;
  [key: string]: unknown;
}) {
  return {
    ...input,
    createdAt: serializeDateTimeValue(input.createdAt),
    distributionStartDate: serializeDateTimeValue(input.distributionStartDate),
    distributionEndDate: serializeDateTimeValue(input.distributionEndDate),
  };
}

export function buildDashboardMemberStats(
  members: Array<Record<string, unknown>>,
): DashboardMemberStats {
  const byTeam = members.reduce<DashboardMemberStats['byTeam']>(
    (acc, member) => {
      const teamId = String(member.teamId ?? '');
      if (!acc[teamId]) {
        acc[teamId] = { count: 0, members: [] };
      }
      const teamStats = acc[teamId] as {
        count: number;
        members: DashboardMemberRecord[];
      };
      teamStats.count++;
      teamStats.members.push({
        name: String(member.name || member.displayName || ''),
        studentId: String(member.studentId || ''),
        grade: String(member.grade || ''),
        department: String(member.department || ''),
      });
      return acc;
    },
    {} as Record<
      string,
      {
        count: number;
        members: DashboardMemberRecord[];
      }
    >,
  );

  return {
    totalMembers: members.length,
    byTeam,
  };
}

export function buildDashboardTeamStats(input: DashboardTeamStatsInput): Array<
  Record<string, unknown> & {
    teamId: string;
    memberCount: number;
    members: DashboardMemberRecord[];
  }
> {
  return input.teams.map((team) => {
    const teamMembers = input.memberStatsByTeam[team.teamId] || { count: 0, members: [] };
    return {
      ...team,
      createdAt: serializeDateTimeValue(team.createdAt),
      updatedAt: serializeDateTimeValue(team.updatedAt),
      validStartDate: serializeDateTimeValue(team.validStartDate),
      validEndDate: serializeDateTimeValue(team.validEndDate),
      validDate: serializeDateTimeValue(team.validDate),
      memberCount: teamMembers.count,
      members: teamMembers.members,
    };
  });
}

export function buildDashboardAreaStats(input: {
  teams: Array<Record<string, unknown> & { teamId: string }>;
  memberStatsByTeam: Record<string, { count: number }>;
}): Record<string, { teamCount: number; memberCount: number; teams: string[] }> {
  return input.teams.reduce(
    (acc, team) => {
      const area = String(team.assignedAreaName || '未設定');
      if (!acc[area]) {
        acc[area] = { teamCount: 0, memberCount: 0, teams: [] as string[] };
      }
      const teamMembers = input.memberStatsByTeam[team.teamId] || { count: 0 };
      acc[area].teamCount++;
      acc[area].memberCount += teamMembers.count;
      acc[area].teams.push(String(team.teamCode || ''));
      return acc;
    },
    {} as Record<string, { teamCount: number; memberCount: number; teams: string[] }>,
  );
}
