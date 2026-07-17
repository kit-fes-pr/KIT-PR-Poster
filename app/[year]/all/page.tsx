import { notFound } from 'next/navigation';
import DashboardContent from '@/components/dashboard/DashboardContent';
import { dashboardYearExists, parseDashboardYear } from '@/lib/server/dashboard-year';

export default async function YearAllTeamsDashboardPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const { year: yearParam } = await params;
  const year = parseDashboardYear(yearParam);
  if (!year || !(await dashboardYearExists(year))) {
    notFound();
  }

  return <DashboardContent mode="all" year={year} />;
}
