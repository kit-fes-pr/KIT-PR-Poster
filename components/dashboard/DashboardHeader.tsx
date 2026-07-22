'use client';

import { useState } from 'react';
import Link from 'next/link';
import { VerifiedAuthUser } from '@/lib/utils/auth-fetcher';

export type HeaderMode = 'self' | 'all' | 'teams';

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
  isLoggingOut,
  onLogout,
}: {
  year: number;
  mode: HeaderMode;
  title: string;
  authUser: VerifiedAuthUser | null;
  ownTeam?: HeaderTeam;
  isLoggingOut: boolean;
  onLogout: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const roleLabel = authUser?.isAdmin ? '管理者' : 'ユーザー';
  const navItems = [
    ...(authUser?.role === 'team' && ownTeam
      ? [{ href: `/${year}`, label: '自班店舗', active: mode === 'self' }]
      : []),
    { href: `/${year}/all`, label: '全班店舗', active: mode === 'all' },
    {
      href: `/${year}/teams`,
      label: '班を選ぶ',
      active: mode === 'teams',
    },
  ];

  return (
    <nav className="border-b border-gray-200 bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-start justify-between gap-3 py-4 lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 text-base font-semibold text-gray-900 sm:text-xl">{title}</h1>
              <span className="font-medium text-gray-700">{year}年度</span>
              <div className="hidden items-center gap-2 md:flex">
                <span className="rounded-full bg-indigo-50 px-2.5 py-1 font-medium text-indigo-700">
                  {roleLabel}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 md:hidden"
            aria-expanded={menuOpen}
            aria-controls="dashboard-mobile-menu"
            aria-label="メニュー"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="h-5 w-5"
            >
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>

          <div className="hidden flex-wrap items-center gap-2 md:flex">
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

        {menuOpen && (
          <div
            id="dashboard-mobile-menu"
            className="space-y-2 border-t border-gray-200 py-3 md:hidden"
          >
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 font-medium text-gray-700">
              {roleLabel}
            </span>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={`block rounded-md border px-3 py-3 text-sm ${
                  item.active
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                    : 'border-gray-300 text-gray-700'
                }`}
              >
                {item.label}
              </Link>
            ))}
            {authUser?.isAdmin && (
              <Link
                href="/admin"
                onClick={() => setMenuOpen(false)}
                className="block rounded-md border border-gray-300 px-3 py-3 text-sm text-gray-700"
              >
                管理画面
              </Link>
            )}
            <button
              type="button"
              onClick={onLogout}
              disabled={isLoggingOut}
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-left text-sm text-gray-700 disabled:opacity-50"
            >
              ログアウト
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
