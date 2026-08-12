import { notFound } from 'next/navigation';
import DashboardContent from '@/components/dashboard/DashboardContent';
import { getDashboardTeamForYear, parseDashboardYear } from '@/lib/server/dashboard-year';

export default async function YearTeamOldDashboardPage({
  params,
}: {
  params: Promise<{ year: string; teamId: string }>;
}) {
  const { year: yearParam, teamId } = await params;
  const year = parseDashboardYear(yearParam);
  if (!year || !(await getDashboardTeamForYear(teamId, year))) {
    notFound();
  }

  return <DashboardContent mode="teams" teamId={teamId} year={year} includeOld />;
}
