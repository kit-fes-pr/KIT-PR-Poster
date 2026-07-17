'use client';

import Link from 'next/link';

type DashboardMode = 'self' | 'all' | 'team' | 'teams';

export default function DashboardModeGuide({
  year,
  mode,
  canUseSelf,
}: {
  year: number;
  mode: DashboardMode;
  canUseSelf: boolean;
}) {
  const items = [
    ...(canUseSelf
      ? [
          {
            key: 'self' as const,
            href: `/${year}`,
            label: '自班店舗',
            caption: '自分の班が担当する店舗を登録・更新する作業画面',
          },
        ]
      : []),
    {
      key: 'all' as const,
      href: `/${year}/all`,
      label: '全班店舗',
      caption: '年度全体の店舗状況を確認し、班で絞り込む確認画面',
    },
    {
      key: 'teams' as const,
      href: `/${year}/teams`,
      label: '班を選ぶ',
      caption: 'チームID・班名・担当区域から班別ページへ移動する画面',
    },
  ];

  return (
    <div className="mb-4 hidden gap-3 md:grid lg:grid-cols-3">
      {items.map((item) => {
        const active = mode === item.key || (mode === 'team' && item.key === 'teams');
        return (
          <Link
            key={item.key}
            href={item.href}
            className={`rounded-lg border bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow ${
              active ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-gray-200'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-gray-900">{item.label}</div>
              {active && (
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                  表示中
                </span>
              )}
            </div>
            <div className="mt-1 text-sm leading-6 text-gray-600">{item.caption}</div>
          </Link>
        );
      })}
    </div>
  );
}
