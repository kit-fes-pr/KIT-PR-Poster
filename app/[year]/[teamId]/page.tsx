import { notFound } from 'next/navigation';
import DashboardContent from '@/components/dashboard/DashboardContent';
import { getDashboardTeamForYear, parseDashboardYear } from '@/lib/server/dashboard-year';

const RESERVED_YEAR_PATHS = new Set(['all', 'teams']);

export default async function YearTeamDashboardPage({
  params,
}: {
  params: Promise<{ year: string; teamId: string }>;
}) {
  const { year: yearParam, teamId } = await params;
  if (RESERVED_YEAR_PATHS.has(teamId)) {
    notFound();
  }

  const year = parseDashboardYear(yearParam);
  if (!year || !(await getDashboardTeamForYear(teamId, year))) {
    notFound();
  }

  return <DashboardContent mode="team" teamId={teamId} year={year} />;
}
