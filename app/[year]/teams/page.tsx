import { notFound } from 'next/navigation';
import TeamSelectContent from '@/components/dashboard/TeamSelectContent';
import { dashboardYearExists, parseDashboardYear } from '@/lib/server/dashboard-year';

export default async function YearTeamSelectPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const { year: yearParam } = await params;
  const year = parseDashboardYear(yearParam);
  if (!year || !(await dashboardYearExists(year))) {
    notFound();
  }

  return <TeamSelectContent year={year} />;
}
