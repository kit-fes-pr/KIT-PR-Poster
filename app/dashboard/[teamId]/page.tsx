'use client';

import { useParams } from 'next/navigation';
import DashboardContent from '../DashboardContent';

export default function TeamDashboardPage() {
  const params = useParams<{ teamId: string }>();
  return <DashboardContent mode="team" teamId={params.teamId} />;
}
