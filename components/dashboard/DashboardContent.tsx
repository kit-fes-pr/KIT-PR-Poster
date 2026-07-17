'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Modal } from '@/components/ui/Modal';
import { Store, StoreFormData } from '@/types';
import { useForm } from 'react-hook-form';
import {
  authenticatedFetch,
  fetcherAuth,
  getVerifiedAuthUser,
  VerifiedAuthUser,
} from '@/lib/utils/auth-fetcher';

type Mode = 'self' | 'all' | 'team';
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

export default function DashboardContent({
  mode,
  teamId,
  year,
}: {
  mode: Mode;
  teamId?: string;
  year?: number;
}) {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<VerifiedAuthUser | null>(null);
  const readOnly = mode === 'all' || mode === 'team';
  const yearQuery = year ? `year=${encodeURIComponent(String(year))}` : '';
  const withYearQuery = (url: string) => {
    if (!yearQuery) return url;
    return `${url}${url.includes('?') ? '&' : '?'}${yearQuery}`;
  };
  const allHref = year ? `/${year}/all` : '/';
  const teamHref = (id: string) => (year ? `/${year}/${id}` : '/');
  const swrKey =
    mode === 'all'
      ? withYearQuery('/api/stores?scope=all')
      : mode === 'team' && teamId
        ? withYearQuery(`/api/stores?teamId=${encodeURIComponent(teamId)}`)
        : mode === 'self'
          ? withYearQuery('/api/stores')
          : null;
  const { data: storesData, mutate } = useSWR(swrKey, fetcherAuth);
  const { data: teamsData } = useSWR<{ teams: DashboardTeam[] }>(
    authChecked ? withYearQuery('/api/dashboard/teams') : null,
    fetcherAuth,
  );

  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingStore, setIsAddingStore] = useState(false);
  const [detailsStoreId, setDetailsStoreId] = useState<string | null>(null);
  const [menuStoreId, setMenuStoreId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<StoreFormData>({
    defaultValues: { distributionStatus: 'pending', distributedCount: 0 },
  });

  const {
    register: registerEdit,
    handleSubmit: handleEditSubmit,
    reset: resetEdit,
    watch: watchEdit,
    setValue: setEditValue,
    formState: { errors: editErrors, isSubmitting: isEditSubmitting },
  } = useForm<StoreFormData>({
    defaultValues: { distributionStatus: 'pending', distributedCount: 0 },
  });

  const watchStatus = watch('distributionStatus');
  const watchEditStatus = watchEdit('distributionStatus');

  useEffect(() => {
    if (!detailsStoreId) return;
    const store = (storesData?.stores || []).find((s: Store) => s.storeId === detailsStoreId);
    if (store) {
      resetEdit({
        storeName: store.storeName,
        address: store.address,
        distributionStatus: store.distributionStatus,
        failureReason: store.failureReason,
        distributedCount: store.distributedCount || 0,
        notes: store.notes || '',
      });
    }
  }, [detailsStoreId, storesData, resetEdit]);

  useEffect(() => {
    let mounted = true;
    getVerifiedAuthUser()
      .then((user) => {
        if (!mounted) return;

        if (mode === 'self') {
          if (user.isAdmin) {
            router.replace(allHref);
            return;
          }
          if (user.role !== 'team' || !user.teamId) {
            router.replace('/');
            return;
          }
        }

        if ((mode === 'all' || mode === 'team') && !user.isAdmin && user.role !== 'team') {
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
  }, [allHref, mode, router, teamId]);

  const filteredStores: Store[] = useMemo(() => {
    const list: Store[] = storesData?.stores || [];
    const filtered = list.filter((store) => {
      const matchesStatus = filterStatus === 'all' || store.distributionStatus === filterStatus;
      const matchesSearch =
        store.storeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        store.address.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });
    return filtered.sort((a, b) => {
      const aKana = (a.storeNameKana || a.storeName || '').toString();
      const bKana = (b.storeNameKana || b.storeName || '').toString();
      const nameCmp = aKana.localeCompare(bKana, 'ja');
      if (nameCmp !== 0) return nameCmp;
      const aAddr = (a.addressKana || a.address || '').toString();
      const bAddr = (b.addressKana || b.address || '').toString();
      return aAddr.localeCompare(bAddr, 'ja');
    });
  }, [storesData, filterStatus, searchQuery]);

  const totalStores = filteredStores.length;
  const completedStores = filteredStores.filter((s) => s.distributionStatus === 'completed').length;
  const failedStores = filteredStores.filter((s) => s.distributionStatus === 'failed').length;
  const totalDistributedCount = filteredStores.reduce(
    (sum, s) => sum + (Number(s.distributedCount) || 0),
    0,
  );
  const teams = teamsData?.teams || [];
  const ownTeam = teams.find((team) => team.teamId === authUser?.teamId || team.isOwnTeam);
  const currentTeam =
    mode === 'team'
      ? teams.find((team) => team.teamId === teamId)
      : mode === 'self'
        ? ownTeam
        : undefined;
  const isViewingOtherTeam =
    mode === 'team' && !!currentTeam && !!ownTeam && currentTeam.teamId !== ownTeam.teamId;

  const onSubmitStore = async (data: StoreFormData) => {
    try {
      const response = await authenticatedFetch(withYearQuery('/api/stores'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          distributedCount:
            data.distributionStatus === 'completed' ? Number(data.distributedCount || 0) : 0,
          failureReason: data.distributionStatus === 'failed' ? data.failureReason : undefined,
          notes: data.notes,
        }),
      });
      if (response.ok) {
        reset();
        setIsAddingStore(false);
        mutate();
      } else {
        const error = await response.json();
        alert(error.error || '店舗の登録に失敗しました');
      }
    } catch (error) {
      console.error('エラー内容:', error);
      alert('店舗の登録に失敗しました');
    }
  };

  // Close menu on outside click
  useEffect(() => {
    if (!menuStoreId) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (!target.closest('[data-menu-root]')) {
        setMenuStoreId(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuStoreId]);

  if (!authChecked) return null;

  const updateStoreStatus = async (
    storeId: string,
    status: Store['distributionStatus'],
    count?: number,
    reason?: string,
  ) => {
    try {
      const response = await authenticatedFetch(`/api/stores/${storeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distributionStatus: status,
          distributedCount: count || 0,
          failureReason: reason,
        }),
      });
      if (response.ok) mutate();
      else {
        const error = await response.json();
        alert(error.error || '更新に失敗しました');
      }
    } catch (error) {
      console.error('エラー内容:', error);
      alert('更新に失敗しました');
    }
  };

  const updateStoreDetails = async (storeId: string, data: StoreFormData) => {
    try {
      const response = await authenticatedFetch(`/api/stores/${storeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName: data.storeName,
          address: data.address,
          distributionStatus: data.distributionStatus,
          distributedCount:
            data.distributionStatus === 'completed' ? Number(data.distributedCount || 0) : 0,
          failureReason: data.distributionStatus === 'failed' ? data.failureReason : undefined,
          notes: data.notes,
        }),
      });
      if (response.ok) {
        mutate();
        setDetailsStoreId(null);
      } else {
        const error = await response.json();
        alert(error.error || '更新に失敗しました');
      }
    } catch (error) {
      console.error('エラー内容:', error);
      alert('更新に失敗しました');
    }
  };

  const deleteStore = async (storeId: string) => {
    if (!confirm('この店舗を削除しますか？この操作は元に戻せません。')) return;
    try {
      const res = await authenticatedFetch(`/api/stores/${storeId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setMenuStoreId(null);
        mutate();
      } else {
        const err = await res.json();
        alert(err.error || '削除に失敗しました');
      }
    } catch (error) {
      console.error('エラー内容:', error);
      alert('削除に失敗しました');
    }
  };

  const getStatusColor = (status: Store['distributionStatus']) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'revisit':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: Store['distributionStatus']) => {
    switch (status) {
      case 'completed':
        return '配布済み';
      case 'failed':
        return '配布不可';
      case 'revisit':
        return '要再訪問';
      default:
        return '未配布';
    }
  };

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 pb-4 sm:px-6 sm:pb-6 lg:px-8">
        {isViewingOtherTeam && currentTeam && ownTeam && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="text-sm font-semibold text-amber-900">他班のページを閲覧しています</div>
            <div className="mt-1 text-sm text-amber-800">
              自班: {ownTeam.teamName} / 表示中: {currentTeam.teamName}
            </div>
          </div>
        )}

        <div className="mb-4 grid grid-cols-2 gap-3 lg:mb-6 lg:grid-cols-4 lg:gap-6">
          <div className="rounded-lg bg-white p-4 shadow sm:p-6">
            <h3 className="text-sm font-medium text-gray-500 sm:text-base">総店舗数</h3>
            <p className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">{totalStores}</p>
          </div>
          <div className="rounded-lg bg-white p-4 shadow sm:p-6">
            <h3 className="text-sm font-medium text-gray-500 sm:text-base">配布済み</h3>
            <p className="mt-1 text-2xl font-bold text-green-600 sm:text-3xl">{completedStores}</p>
          </div>
          <div className="rounded-lg bg-white p-4 shadow sm:p-6">
            <h3 className="text-sm font-medium text-gray-500 sm:text-base">配布不可</h3>
            <p className="mt-1 text-2xl font-bold text-red-600 sm:text-3xl">{failedStores}</p>
          </div>
          <div className="rounded-lg bg-white p-4 shadow sm:p-6">
            <h3 className="text-sm font-medium text-gray-500 sm:text-base">総配布枚数</h3>
            <p className="mt-1 text-2xl font-bold text-indigo-600 sm:text-3xl">
              {totalDistributedCount}
            </p>
          </div>
        </div>

        {!readOnly && (
          <div className="lg:hidden w-full flex justify-center px-4 pb-4">
            <button
              onClick={() => setIsAddingStore(true)}
              className="w-full max-w-xs px-4 py-2 bg-indigo-600 text-white rounded-md text-sm"
            >
              店舗を追加
            </button>
          </div>
        )}

        <div className="rounded-lg bg-white shadow">
          <div className="border-b border-gray-200 px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">店舗一覧</h2>
                <p className="text-sm text-gray-500">{filteredStores.length}件表示中</p>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[10rem_minmax(16rem,1fr)] lg:grid-cols-[12rem_10rem_minmax(16rem,1fr)_auto]">
                {(mode === 'all' || mode === 'team') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      表示する班
                    </label>
                    <select
                      value={mode === 'team' ? teamId || '' : 'all'}
                      onChange={(e) => {
                        const nextTeamId = e.target.value;
                        router.push(nextTeamId === 'all' ? allHref : teamHref(nextTeamId));
                      }}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="all">全班の店舗</option>
                      {teams.map((team) => (
                        <option key={team.teamId} value={team.teamId}>
                          {team.teamName}
                          {team.areaName ? ` / ${team.areaName}` : ''}
                          {team.isOwnTeam ? '（自班）' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">状態</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="all">すべて</option>
                    <option value="pending">未配布</option>
                    <option value="completed">配布済み</option>
                    <option value="failed">配布不可</option>
                    <option value="revisit">要再訪問</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">検索</label>
                  <input
                    type="text"
                    placeholder="店名・住所で検索"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                {!readOnly && (
                  <div className="hidden lg:flex lg:items-end">
                    <button
                      type="button"
                      onClick={() => setIsAddingStore(true)}
                      className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
                    >
                      店舗を追加
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-hidden">
            <div className="space-y-2 p-4">
              {filteredStores.map((store) => (
                <div key={store.storeId} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-medium">{store.storeName}</h3>
                      <div className="mt-1 flex items-center flex-wrap gap-2">
                        <span
                          className={`inline-block px-2 py-1 text-xs rounded-full ${getStatusColor(store.distributionStatus)}`}
                        >
                          {getStatusText(store.distributionStatus)}
                        </span>
                        <span className="inline-block px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">
                          配布枚数: {store.distributedCount || 0}
                        </span>
                      </div>
                      {store.notes && (
                        <p className="text-xs text-gray-500 mt-1">備考: {store.notes}</p>
                      )}
                    </div>
                    <div className="mt-3 sm:mt-0 sm:ml-4 flex items-center space-x-2">
                      {!readOnly &&
                        (store.distributionStatus === 'pending' ||
                          store.distributionStatus === 'revisit') && (
                          <>
                            <button
                              onClick={() => {
                                const count = prompt('配布枚数を入力してください:', '1');
                                if (count)
                                  updateStoreStatus(store.storeId, 'completed', parseInt(count));
                              }}
                              className="px-3 py-1 bg-green-600 text-white rounded text-sm"
                            >
                              配布完了
                            </button>
                            <button
                              onClick={() => {
                                const reason = prompt(
                                  '配布不可理由を選択してください\n1: 不在\n2: 断られた\n3: 閉店\n4: その他',
                                  '1',
                                );
                                const reasons = ['absent', 'refused', 'closed', 'other'];
                                if (reason && ['1', '2', '3', '4'].includes(reason))
                                  updateStoreStatus(
                                    store.storeId,
                                    'failed',
                                    0,
                                    reasons[parseInt(reason) - 1],
                                  );
                              }}
                              className="px-3 py-1 bg-red-600 text-white rounded text-sm"
                            >
                              配布不可
                            </button>
                            <button
                              onClick={() => updateStoreStatus(store.storeId, 'revisit')}
                              className="px-3 py-1 bg-yellow-600 text-white rounded text-sm"
                            >
                              要再訪問
                            </button>
                          </>
                        )}
                      {!readOnly && (
                        <div className="relative" data-menu-root>
                          <button
                            onClick={() =>
                              setMenuStoreId(menuStoreId === store.storeId ? null : store.storeId)
                            }
                            className="px-3 py-1 border border-gray-300 text-gray-700 rounded text-sm"
                            aria-label="メニュー"
                            title="メニュー"
                          >
                            ≡
                          </button>
                          {menuStoreId === store.storeId && (
                            <div className="absolute right-0 mt-2 w-28 bg-white border border-gray-200 rounded shadow-md z-10">
                              <button
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                onClick={() => {
                                  setDetailsStoreId(store.storeId);
                                  setMenuStoreId(null);
                                }}
                              >
                                編集
                              </button>
                              <button
                                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                                onClick={() => deleteStore(store.storeId)}
                              >
                                削除
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {!readOnly && isAddingStore && (
        <Modal open onClose={() => setIsAddingStore(false)} panelClassName="max-w-md p-6">
          <div className="w-full">
            <h2 className="text-lg font-medium mb-4">新規店舗を追加</h2>
            <form className="space-y-4" onSubmit={handleSubmit(onSubmitStore)}>
              <div>
                <label className="block text-sm font-medium text-gray-700">店名</label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  {...register('storeName', { required: '店名は必須です' })}
                />
                {errors.storeName && (
                  <p className="text-red-600 text-sm">{String(errors.storeName.message)}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">住所</label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  {...register('address', { required: '住所は必須です' })}
                />
                {errors.address && (
                  <p className="text-red-600 text-sm">{String(errors.address.message)}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">配布状態</label>
                <select
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  {...register('distributionStatus', { required: true })}
                >
                  <option value="pending">未配布</option>
                  <option value="completed">配布完了</option>
                  <option value="failed">配布不可</option>
                  <option value="revisit">要再訪問</option>
                </select>
              </div>
              {watchStatus === 'completed' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">配布枚数</label>
                  <input
                    type="number"
                    min={1}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    {...register('distributedCount', {
                      required: '配布枚数は必須です',
                      min: { value: 1, message: '1以上を入力してください' },
                    })}
                  />
                  {errors.distributedCount && (
                    <p className="text-red-600 text-sm">
                      {String(errors.distributedCount.message)}
                    </p>
                  )}
                </div>
              )}
              {watchStatus === 'failed' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">配布不可理由</label>
                  <select
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    {...register('failureReason', { required: '理由を選択してください' })}
                  >
                    <option value="absent">不在</option>
                    <option value="refused">断られた</option>
                    <option value="closed">閉店</option>
                    <option value="other">その他</option>
                  </select>
                  {errors.failureReason && (
                    <p className="text-red-600 text-sm">{String(errors.failureReason.message)}</p>
                  )}
                </div>
              )}
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsAddingStore(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50"
                >
                  {isSubmitting ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {!readOnly &&
        detailsStoreId &&
        (() => {
          const store = (storesData?.stores || []).find((s: Store) => s.storeId === detailsStoreId);
          if (!store) return null;
          return (
            <Modal open onClose={() => setDetailsStoreId(null)} panelClassName="max-w-md p-6">
              <div className="w-full">
                <h2 className="text-lg font-medium mb-4">詳細編集</h2>
                <form
                  className="space-y-4"
                  onSubmit={handleEditSubmit((d) => updateStoreDetails(store.storeId, d))}
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-700">店名</label>
                    <input
                      type="text"
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                      {...registerEdit('storeName', { required: '店名は必須です' })}
                    />
                    {editErrors.storeName && (
                      <p className="text-red-600 text-sm">{String(editErrors.storeName.message)}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">住所</label>
                    <input
                      type="text"
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                      {...registerEdit('address', { required: '住所は必須です' })}
                    />
                    {editErrors.address && (
                      <p className="text-red-600 text-sm">{String(editErrors.address.message)}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">備考</label>
                    <textarea
                      rows={3}
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                      placeholder="例: 夕方なら対応可 / 来週再訪問予定など"
                      {...registerEdit('notes')}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">配布状態</label>
                    <select
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      {...registerEdit('distributionStatus', { required: true })}
                      onChange={(e) => {
                        const val = e.target.value as Store['distributionStatus'];
                        setEditValue('distributionStatus', val);
                        if (val !== 'completed') setEditValue('distributedCount', 0);
                        if (val !== 'failed') setEditValue('failureReason', undefined);
                      }}
                    >
                      <option value="pending">未配布</option>
                      <option value="completed">配布完了</option>
                      <option value="failed">配布不可</option>
                      <option value="revisit">要再訪問</option>
                    </select>
                  </div>
                  {watchEditStatus === 'completed' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">配布枚数</label>
                      <input
                        type="number"
                        min={1}
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                        {...registerEdit('distributedCount', {
                          required: '配布枚数は必須です',
                          min: { value: 1, message: '1以上を入力してください' },
                        })}
                      />
                      {editErrors.distributedCount && (
                        <p className="text-red-600 text-sm">
                          {String(editErrors.distributedCount.message)}
                        </p>
                      )}
                    </div>
                  )}
                  {watchEditStatus === 'failed' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        配布不可理由
                      </label>
                      <select
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                        {...registerEdit('failureReason', { required: '理由を選択してください' })}
                      >
                        <option value="absent">不在</option>
                        <option value="refused">断られた</option>
                        <option value="closed">閉店</option>
                        <option value="other">その他</option>
                      </select>
                      {editErrors.failureReason && (
                        <p className="text-red-600 text-sm">
                          {String(editErrors.failureReason.message)}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => setDetailsStoreId(null)}
                      className="px-4 py-2 bg-gray-200 text-gray-800 rounded"
                    >
                      キャンセル
                    </button>
                    <button
                      type="submit"
                      disabled={isEditSubmitting}
                      className="px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50"
                    >
                      {isEditSubmitting ? '保存中...' : '保存'}
                    </button>
                  </div>
                </form>
              </div>
            </Modal>
          );
        })()}
    </>
  );
}
