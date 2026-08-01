'use client';

import Link from 'next/link';
import { useRequireAdmin } from '@/lib/hooks/useRequireAdmin';
import { LoadingScreen } from '@/components/ui/Loading';

type QuickLink = {
  title: string;
  description: string;
  href: string;
};

const quickLinks: QuickLink[] = [
  {
    title: '年度選択',
    description: '年度一覧から対象年度へ移動します。',
    href: '/admin/event',
  },
  {
    title: '配布区域',
    description: '全年度共通の配布区域を管理します。',
    href: '/admin/event/areas',
  },
  {
    title: 'ユーザー管理',
    description: '管理者を招待して初回パスワード設定を案内します。',
    href: '/admin/invite',
  },
  {
    title: 'アカウント設定',
    description: '管理者の表示名など、自分の情報を設定します。',
    href: '/admin/settings',
  },
  {
    title: '店舗CSV一括取込',
    description: '複数年度の店舗情報を区域と住所を確認しながら登録します。',
    href: '/admin/store-import',
  },
];

export default function AdminHome() {
  const { user, loading: authLoading } = useRequireAdmin();

  if (authLoading) {
    return <LoadingScreen />;
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="space-y-6">
        <section className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium text-indigo-600">現在のログイン中ユーザー</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">
            {user?.displayName || '管理者'}
          </h2>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group flex h-full flex-col rounded-3xl border border-gray-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <h3 className="text-lg font-semibold text-gray-900">{link.title}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">{link.description}</p>
              <div className="mt-auto pt-6 text-sm font-medium text-indigo-600 group-hover:text-indigo-700">
                開く →
              </div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
