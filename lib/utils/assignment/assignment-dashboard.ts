import { buildDashboardMemberStats, type DashboardMemberStats } from '../dashboard/dashboard-route';

export type AssignmentDashboardRecord = {
  teamId?: unknown;
  responseId?: unknown;
};

export function buildAssignmentDashboardMemberStats(
  assignments: AssignmentDashboardRecord[],
): DashboardMemberStats {
  return buildDashboardMemberStats(
    assignments.map((assignment) => ({
      teamId: assignment.teamId,
      studentId: assignment.responseId,
    })),
  );
}
