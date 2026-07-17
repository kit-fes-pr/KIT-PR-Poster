'use client';

import Link from 'next/link';
import { VerifiedAuthUser } from '@/lib/utils/auth-fetcher';

type HeaderMode = 'self' | 'all' | 'team' | 'teams';

type HeaderTeam = {
  teamId: string;
  teamName: string;
};

export default function DashboardHeader({
  year,
  mode,
  title,
  authUser,
  ownTeam,
  currentTeam,
  isLoggingOut,
  onLogout,
}: {
  year: number;
  mode: HeaderMode;
  title: string;
  authUser: VerifiedAuthUser | null;
  ownTeam?: HeaderTeam;
  currentTeam?: HeaderTeam;
  isLoggingOut: boolean;
  onLogout: () => void;
}) {
  const isViewingOtherTeam =
    mode === 'team' && !!ownTeam && !!currentTeam && ownTeam.teamId !== currentTeam.teamId;
  const roleLabel = authUser?.isAdmin ? '管理者' : '班ユーザー';

  const navClass = (active: boolean) =>
    `rounded-md border px-3 py-2 text-center text-sm ${
      active
        ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
    }`;

  return (
    <nav className="border-b border-gray-200 bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 text-base font-semibold text-gray-900 sm:text-xl">{title}</h1>
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                {roleLabel}
              </span>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                {year}年度
              </span>
              {isViewingOtherTeam && (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                  他班閲覧中
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            {authUser?.isAdmin && (
              <Link
                href="/admin"
                className="rounded-md border border-gray-300 px-3 py-2 text-center text-sm text-gray-700 hover:bg-gray-50"
              >
                管理画面
              </Link>
            )}
            <button
              type="button"
              onClick={onLogout}
              disabled={isLoggingOut}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              ログアウト
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
