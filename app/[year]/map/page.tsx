import { notFound } from 'next/navigation';
import StoreMapContent from '@/components/dashboard/StoreMapContent';
import { dashboardYearExists, parseDashboardYear } from '@/lib/server/dashboard-year';

export default async function YearStoreMapPage({ params }: { params: Promise<{ year: string }> }) {
  const { year: yearParam } = await params;
  const year = parseDashboardYear(yearParam);
  if (!year || !(await dashboardYearExists(year))) {
    notFound();
  }

  return <StoreMapContent mode="self" year={year} />;
}
