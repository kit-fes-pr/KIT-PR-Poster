import { notFound } from 'next/navigation';
import { ReactNode } from 'react';
import DashboardYearShell from '@/components/dashboard/DashboardYearShell';
import { dashboardYearExists, parseDashboardYear } from '@/lib/server/dashboard-year';

export default async function YearDashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ year: string }>;
}) {
  const { year: yearParam } = await params;
  const year = parseDashboardYear(yearParam);
  if (!year || !(await dashboardYearExists(year))) {
    notFound();
  }

  return <DashboardYearShell year={year}>{children}</DashboardYearShell>;
}
