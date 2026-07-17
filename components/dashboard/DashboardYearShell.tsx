'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import useSWR from 'swr';
import DashboardHeader, { HeaderMode } from '@/components/dashboard/DashboardHeader';
import DashboardModeGuide from '@/components/dashboard/DashboardModeGuide';
import { auth } from '@/lib/firebase';
import {
  authenticatedFetch,
  fetcherAuth,
  getVerifiedAuthUser,
  VerifiedAuthUser,
} from '@/lib/utils/auth-fetcher';
import { removeLocalStorageItem } from '@/lib/utils/browser-storage';

type DashboardRouteMode = 'self' | 'all' | 'teams';

type DashboardTeam = {
  teamId: string;
  teamCode: string;
  teamName: string;
  areaName?: string;
  assignedArea?: string;
  timeSlot?: string;
  year?: number;
  isOwnTeam?: boolean;
};

export default function DashboardYearShell({
  year,
  children,
}: {
  year: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [authUser, setAuthUser] = useState<VerifiedAuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const { data: teamsData } = useSWR<{ teams: DashboardTeam[] }>(
    authChecked ? `/api/dashboard/teams?year=${encodeURIComponent(String(year))}` : null,
    fetcherAuth,
  );

  useEffect(() => {
    let mounted = true;
    getVerifiedAuthUser()
      .then((user) => {
        if (!mounted) return;
        setAuthUser(user);
        setAuthChecked(true);
      })
      .catch(() => {
        if (mounted) router.replace('/');
      });
    return () => {
      mounted = false;
    };
  }, [router]);

  const routeState = useMemo(() => {
    const parts = pathname.split('/').filter(Boolean);
    const afterYear = parts[1];
    if (!afterYear) return { mode: 'self' as const };
    if (afterYear === 'all') return { mode: 'all' as const };
    return { mode: 'teams' as const, teamId: afterYear };
  }, [pathname]);

  const teams = teamsData?.teams || [];
  const ownTeam = teams.find((team) => team.teamId === authUser?.teamId || team.isOwnTeam);
  const currentTeam =
    routeState.mode === 'teams'
      ? teams.find((team) => team.teamId === routeState.teamId)
      : routeState.mode === 'self'
        ? ownTeam
        : undefined;

  const title =
    routeState.mode === 'all'
      ? '全班の配布店舗'
      : routeState.mode === 'teams'
        ? currentTeam
          ? `${currentTeam.teamName} の配布店舗`
          : '班を選ぶ'
        : currentTeam
          ? `${currentTeam.teamName} の配布店舗`
          : '自班の配布店舗';

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try {
      await authenticatedFetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout API error:', error);
    } finally {
      try {
        await signOut(auth);
      } catch (error) {
        console.error('Firebase sign out error:', error);
      }
      removeLocalStorageItem('authToken');
      router.replace('/');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {authChecked && (
        <>
          <DashboardHeader
            year={year}
            mode={routeState.mode as HeaderMode}
            title={title}
            authUser={authUser}
            ownTeam={ownTeam}
            isLoggingOut={isLoggingOut}
            onLogout={handleLogout}
          />

          <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8">
            <DashboardModeGuide
              year={year}
              mode={routeState.mode as HeaderMode}
              canUseSelf={authUser?.role === 'team' && !!ownTeam}
            />
          </div>
        </>
      )}
      {children}
    </div>
  );
}
