'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { fetcherAuth, getVerifiedAuthUser, VerifiedAuthUser } from '@/lib/utils/auth-fetcher';

type DashboardTeam = {
  teamId: string;
  teamCode: string;
  teamName: string;
  assignedArea?: string;
  timeSlot?: string;
  year?: number;
  isOwnTeam?: boolean;
};

export default function TeamSelectContent({ year }: { year: number }) {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<VerifiedAuthUser | null>(null);
  const [query, setQuery] = useState('');
  const { data } = useSWR<{ teams: DashboardTeam[] }>(
    authChecked ? `/api/dashboard/teams?year=${encodeURIComponent(String(year))}` : null,
    fetcherAuth,
  );

  useEffect(() => {
    let mounted = true;
    getVerifiedAuthUser()
      .then((user) => {
        if (!mounted) return;
        if (!user.isAdmin && user.role !== 'team') {
          router.replace('/');
          return;
        }
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

  const teams = data?.teams || [];
  const ownTeam = teams.find((team) => team.teamId === authUser?.teamId || team.isOwnTeam);
  const filteredTeams = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return teams;
    return teams.filter((team) =>
      [team.teamId, team.teamName, team.teamCode, team.assignedArea]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword)),
    );
  }, [query, teams]);

  if (!authChecked) return null;

  return (
    <main className="mx-auto max-w-7xl px-4 pb-4 sm:px-6 sm:pb-6 lg:px-8">
      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <label className="block text-sm font-semibold text-gray-900" htmlFor="team-search">
              班を検索
            </label>
            <p className="mt-1 text-sm text-gray-500">
              チームID・班名・班コード・担当区域で絞り込めます。
            </p>
          </div>
          <div className="text-sm text-gray-500">{filteredTeams.length}班表示中</div>
        </div>
        <input
          id="team-search"
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="例: teamId / A班 / 北区"
          className="mt-3 w-full rounded-md border border-gray-300 px-3 py-3 text-base sm:text-sm"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredTeams.map((team) => {
          const isOwnTeam = team.teamId === ownTeam?.teamId || team.isOwnTeam;
          return (
            <Link
              key={team.teamId}
              href={`/${year}/${team.teamId}`}
              className={`rounded-lg border bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow ${
                isOwnTeam ? 'border-green-300 ring-2 ring-green-100' : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-gray-900">
                    {team.teamName}
                  </div>
                  <div className="mt-1 text-sm text-gray-500">{team.teamCode || '-'}</div>
                </div>
                {isOwnTeam && (
                  <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                    自班
                  </span>
                )}
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <div className="text-xs font-medium text-gray-500">チームID</div>
                  <div className="mt-0.5 break-all rounded-md bg-gray-50 px-2 py-1 font-mono text-xs text-gray-800">
                    {team.teamId}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-500">担当区域</div>
                  <div className="truncate font-medium text-gray-900">
                    {team.assignedArea || '-'}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-500">年度</div>
                  <div className="font-medium text-gray-900">{team.year || year}</div>
                </div>
              </div>
            </Link>
          );
        })}
        {filteredTeams.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500 sm:col-span-2 lg:col-span-3">
            条件に一致する班がありません。検索語を短くするか、チームID・班名・担当区域を確認してください。
          </div>
        )}
      </div>
    </main>
  );
}
