'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { NavButton } from '@/lib/hooks/useNavigation';
import { removeLocalStorageItem } from '@/lib/utils/browser-storage';

type AdminNavItem = {
  href: string;
  label: string;
  exact?: boolean;
};

const adminNavItems: AdminNavItem[] = [
  { href: '/admin', label: '管理者ダッシュボード', exact: true },
  { href: '/admin/event', label: '年度選択' },
  { href: '/admin/event/areas', label: '配布区域' },
  { href: '/admin/invite', label: 'ユーザー招待' },
];

export default function AdminHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, []);

  const activeHref = useMemo(() => {
    if (!pathname) return '/admin';
    const exactMatch = adminNavItems.find((item) => item.exact && pathname === item.href);
    if (exactMatch) return exactMatch.href;
    const prefixMatches = adminNavItems
      .filter((item) => !item.exact && pathname?.startsWith(item.href))
      .sort((a, b) => b.href.length - a.href.length);
    return prefixMatches[0]?.href || '/admin';
  }, [pathname]);

  if (pathname === '/admin/login') {
    return null;
  }

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } finally {
      removeLocalStorageItem('authToken');
      router.replace('/admin/login');
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-gray-900">管理者ダッシュボード</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {adminNavItems.map((item) => {
              const isActive = activeHref === item.href;
              return (
                <NavButton
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? 'border border-indigo-300 bg-indigo-50 text-indigo-700'
                      : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </NavButton>
              );
            })}
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              ログアウト
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
