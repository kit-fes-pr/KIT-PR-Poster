import { notFound } from 'next/navigation';
import StoreMapContent from '@/components/dashboard/StoreMapContent';
import { getDashboardTeamForYear, parseDashboardYear } from '@/lib/server/dashboard-year';

const RESERVED_YEAR_PATHS = new Set(['all', 'teams', 'stores', 'map']);

export default async function YearTeamStoreMapPage({
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

  return <StoreMapContent mode="teams" teamId={teamId} year={year} />;
}
