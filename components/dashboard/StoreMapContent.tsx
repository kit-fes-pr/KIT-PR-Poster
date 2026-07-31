'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { StoreDistributionMap } from '@/components/dashboard/StoreDistributionMap';
import { fetcherAuth, getVerifiedAuthUser, VerifiedAuthUser } from '@/lib/utils/auth-fetcher';

type Mode = 'self' | 'all' | 'teams';

export default function StoreMapContent({
  mode,
  teamId,
  year,
}: {
  mode: Mode;
  teamId?: string;
  year: number;
}) {
  const [authUser, setAuthUser] = useState<VerifiedAuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const yearQuery = `year=${encodeURIComponent(String(year))}`;
  const storesUrl =
    mode === 'all'
      ? `/api/stores?scope=all&${yearQuery}`
      : mode === 'teams' && teamId
        ? `/api/stores?teamId=${encodeURIComponent(teamId)}&${yearQuery}`
        : `/api/stores?${yearQuery}`;
  const { data, error } = useSWR(authChecked ? storesUrl : null, fetcherAuth);

  useEffect(() => {
    let mounted = true;
    getVerifiedAuthUser()
      .then((user) => {
        if (!mounted) return;
        setAuthUser(user);
        setAuthChecked(true);
      })
      .catch(() => {
        if (mounted) setAuthChecked(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const stores = data?.stores || [];
  const listHref =
    mode === 'all'
      ? `/${year}/all`
      : mode === 'teams' && teamId
        ? `/${year}/${teamId}`
        : `/${year}`;
  const title =
    mode === 'all'
      ? '全班の配布店舗マップ'
      : mode === 'teams'
        ? '班別 配布店舗マップ'
        : '自班の配布店舗マップ';

  if (!authChecked) return null;

  if (!authUser) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-lg bg-white p-6 text-sm text-red-600 shadow">
          認証情報を確認できませんでした。ログインし直してください。
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-6 sm:px-6 lg:px-8">
      <div className="mb-4 flex justify-end">
        <Link
          href={listHref}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          店舗一覧へ戻る
        </Link>
      </div>
      {error ? (
        <div className="rounded-lg bg-white p-6 text-sm text-red-600 shadow">
          店舗情報の取得に失敗しました。
        </div>
      ) : (
        <StoreDistributionMap stores={stores} title={title} />
      )}
    </div>
  );
}
