'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { StoreDistributionMap } from '@/components/dashboard/StoreDistributionMap';
import { StoreCreateModal } from '@/components/dashboard/StoreCreateModal';
import { fetcherAuth, getVerifiedAuthUser, VerifiedAuthUser } from '@/lib/utils/auth-fetcher';

type Mode = 'self' | 'all' | 'teams';
type SelectedMapPlace = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

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
  const [isAddingStore, setIsAddingStore] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [selectedMapPlace, setSelectedMapPlace] = useState<SelectedMapPlace | null>(null);
  const yearQuery = `year=${encodeURIComponent(String(year))}`;
  const storesUrl =
    mode === 'all'
      ? `/api/stores?scope=all&${yearQuery}`
      : mode === 'teams' && teamId
        ? `/api/stores?teamId=${encodeURIComponent(teamId)}&${yearQuery}`
        : `/api/stores?${yearQuery}`;
  const { data, error, mutate } = useSWR(authChecked ? storesUrl : null, fetcherAuth);

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
  const canAddStore = mode === 'self' && authUser?.role === 'team';

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
      <div className="mb-4 rounded-lg bg-white px-4 py-3 shadow">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900">
              {addMode ? '追加する店舗の場所を地図上で押してください' : title}
            </p>
            {canAddStore && (
              <p className="mt-1 text-xs text-gray-500">
                地図で場所を選ぶと、住所と座標を入れた状態で店舗登録できます。
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {canAddStore && (
              <button
                type="button"
                onClick={() => setAddMode((current) => !current)}
                className={`w-full rounded-md px-3 py-2 text-sm font-medium sm:w-auto ${
                  addMode
                    ? 'border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                {addMode ? '追加モードを終了' : '地図で追加'}
              </button>
            )}
            <Link
              href={listHref}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-center text-sm text-gray-700 hover:bg-gray-50 sm:w-auto"
            >
              店舗一覧へ戻る
            </Link>
          </div>
        </div>
      </div>
      {error ? (
        <div className="rounded-lg bg-white p-6 text-sm text-red-600 shadow">
          店舗情報の取得に失敗しました。
        </div>
      ) : (
        <StoreDistributionMap
          stores={stores}
          title={title}
          addMode={addMode}
          onSelectCreateLocation={
            canAddStore
              ? (place) => {
                  setSelectedMapPlace(place);
                  setIsAddingStore(true);
                }
              : undefined
          }
        />
      )}
      {canAddStore && isAddingStore && (
        <StoreCreateModal
          open
          year={year}
          initialPlace={selectedMapPlace}
          showPlacePicker={false}
          onClose={() => {
            setIsAddingStore(false);
            setSelectedMapPlace(null);
          }}
          onSaved={() => {
            setAddMode(false);
            setSelectedMapPlace(null);
            mutate();
          }}
        />
      )}
    </div>
  );
}
