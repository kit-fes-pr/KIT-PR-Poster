'use client';

import { useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { NavButton } from '@/lib/hooks/useNavigation';

interface YearSidebarProps {
  year: string;
  distributionPeriod?: string;
}

export default function YearSidebar({ year, distributionPeriod }: YearSidebarProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const items = useMemo(
    () => [
      { href: `/admin/event/${year}`, label: '年度トップ', exact: true },
      { href: `/admin/event/${year}/form`, label: 'フォーム管理' },
      { href: `/admin/event/${year}/team`, label: 'チーム管理' },
      { href: `/${year}/all`, label: '配布班管理' },
      { href: `/admin/event/${year}/setting`, label: 'イベント設定' },
    ],
    [year],
  );

  const activeHref = useMemo(() => {
    if (!pathname) return '';
    const exactMatch = items.find((item) => item.exact && pathname === item.href);
    if (exactMatch) return exactMatch.href;
    const prefixMatches = items
      .filter((item) => !item.exact && pathname?.startsWith(item.href))
      .sort((a, b) => b.href.length - a.href.length);
    return prefixMatches[0]?.href || '';
  }, [items, pathname]);

  const isMultiDayPeriod = (distributionPeriod ?? '').includes('〜');

  const renderMenuItems = (itemClassName = '') => (
    <>
      {items.map((item) => {
        const isActive = activeHref === item.href;
        return (
          <NavButton
            key={item.href}
            href={item.href}
            onClick={() => setMobileMenuOpen(false)}
            className={`flex w-full min-h-16 border rounded-3xl px-5 py-4 text-left text-sm font-medium transition-all duration-200 ${
              itemClassName
            } ${
              isActive
                ? 'border border-indigo-200 bg-indigo-100 text-indigo-800'
                : 'border border-gray-200 bg-gray-50 text-gray-700'
            }`}
          >
            <span className="block">{item.label}</span>
            <span className="text-xs">開く→</span>
          </NavButton>
        );
      })}
    </>
  );

  return (
    <>
      <aside className="relative z-20 mx-auto w-full max-w-[320px] px-4 lg:hidden">
        <div className="relative w-full overflow-visible rounded-3xl border border-gray-200 bg-white p-6">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={mobileMenuOpen}
            className="flex w-full items-center justify-between gap-4 rounded-3xl bg-gray-50 px-5 py-4 text-left"
          >
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-semibold text-gray-900">{year} 年度</h2>
              <div className="mt-3 w-full rounded-2xl bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                  配布期間
                </p>
                <p
                  className={`mt-1 w-full text-sm font-medium text-gray-900 ${
                    isMultiDayPeriod ? 'whitespace-normal leading-5' : 'whitespace-nowrap'
                  }`}
                >
                  {distributionPeriod || '未設定'}
                </p>
              </div>
            </div>
            <div>
              <svg
                className={`h-6 w-6 text-gray-400 transform transition-transform duration-200 ${
                  mobileMenuOpen ? 'rotate-90' : ''
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
          </button>

          <div
            aria-hidden={!mobileMenuOpen}
            className={`absolute left-0 top-[calc(100%-1px)] z-30 w-full overflow-hidden rounded-3xl border border-gray-200 bg-white transition-all duration-300 ${
              mobileMenuOpen
                ? 'visible pointer-events-auto translate-y-0 opacity-100'
                : 'invisible pointer-events-none -translate-y-2 opacity-0'
            }`}
          >
            <div className="space-y-4 p-6">
              <div className="flex flex-col gap-3">{renderMenuItems()}</div>
            </div>
          </div>
        </div>
      </aside>

      <aside className="hidden h-full min-h-full w-full max-w-[320px] flex-col rounded-3xl border border-gray-200 bg-white p-4 lg:flex">
        <div className="shrink-0">
          <h2 className="mt-1 text-lg font-semibold text-gray-900">{year} 年度</h2>
          <div className="mt-4 w-full rounded-2xl bg-gray-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
              配布期間
            </p>
            <p
              className={`mt-1 w-full text-sm font-medium text-gray-900 ${
                isMultiDayPeriod ? 'whitespace-normal leading-5' : 'whitespace-nowrap'
              }`}
            >
              {distributionPeriod || '未設定'}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-1 flex-col gap-3">{renderMenuItems('w-full')}</div>
      </aside>
    </>
  );
}
