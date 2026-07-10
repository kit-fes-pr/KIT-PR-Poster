'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LoadingInline } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { DEFAULT_TIME_ZONE, formatDateOnly } from '@/lib/utils/dateUtils';
import { useRequireAdmin } from '@/lib/hooks/useRequireAdmin';

const fetcher = async (url: string) => {
  const token = localStorage.getItem('authToken');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('認証が必要です');
  return res.json();
};

export default function AdminEventIndex() {
  const { user, isAdmin, loading: authLoading } = useRequireAdmin();
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  const [latest, setLatest] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<{
    year: string;
    eventName: string;
    distributionStartDate: string;
    distributionEndDate: string;
  }>({ year: '', eventName: '', distributionStartDate: '', distributionEndDate: '' });
  const [menuEventId, setMenuEventId] = useState<string | null>(null);

  // Close popup menu on outside click
  useEffect(() => {
    if (!menuEventId) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (!target.closest('[data-menu-root]')) setMenuEventId(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuEventId]);

  useEffect(() => {
    const init = async () => {
      if (!isAdmin || !user) return;
      try {
        const token = await user.getIdToken();
        const { events, latest } = await fetch('/api/admin/events', {
          headers: { Authorization: `Bearer ${token}` },
        }).then(async (res) => {
          if (!res.ok) {
            throw new Error('認証が必要です');
          }
          return res.json();
        });
        setEvents(events || []);
        setLatest(latest || null);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load events:', err);
      }
    };
    init();
  }, [isAdmin, user]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingInline size="lg" />
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingInline size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">年度選択</h2>
          </div>
          <button
            onClick={() => setIsCreating(true)}
            className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
          >
            学外配布年度を追加
          </button>
        </div>

        {loading ? (
          <LoadingInline />
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <div className="space-y-6">
            {latest && (
              <div className="bg-white p-6 rounded-lg shadow">
                <h2 className="text-lg font-medium mb-2">最新年度</h2>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold">{String(latest.year)} 年度</p>
                    <p className="text-sm text-gray-600">
                      {String(latest.eventName) || '学外配布'}
                    </p>
                  </div>
                  <Link
                    href={`/admin/event/${latest.year}`}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm"
                  >
                    この年度を開く
                  </Link>
                </div>
              </div>
            )}

            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-lg font-medium mb-4">年度一覧</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {events.map((ev) => (
                  <div
                    key={ev.id as string}
                    className="group relative border border-gray-200 rounded-lg bg-white p-4 transition transform duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 focus-within:outline-none focus-within:ring-2 focus-within:ring-indigo-500 md:hover:-translate-y-1 md:hover:shadow-lg"
                  >
                    <Link
                      href={`/admin/event/${ev.year}`}
                      className="absolute inset-0 z-10 rounded-lg"
                      aria-label={`${String(ev.year)} 年度を開く`}
                    />
                    <div className="pointer-events-none relative z-20 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-semibold">{String(ev.year)} 年度</p>
                        <p className="text-sm text-gray-500">
                          {String(ev.eventName) || '学外配布'} /{' '}
                          {(() => {
                            const s = ev.distributionStartDate;
                            const e = ev.distributionEndDate;
                            if (!s || !e) return '-';
                            const sd = formatDateOnly(s as string | Date);
                            const ed = formatDateOnly(e as string | Date);
                            return sd === ed ? sd : `${sd} 〜 ${ed}`;
                          })()}
                        </p>
                      </div>
                      <div className="pointer-events-auto relative z-30 shrink-0" data-menu-root>
                        <button
                          className="px-2 py-1 border rounded text-sm"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMenuEventId(menuEventId === ev.id ? null : (ev.id as string));
                          }}
                          aria-label="メニュー"
                          title="メニュー"
                        >
                          ≡
                        </button>
                        {menuEventId === ev.id && (
                          <div className="absolute right-0 z-40 mt-2 w-32 rounded border border-gray-200 bg-white shadow-md">
                            <Link
                              href={`/admin/event/${ev.year}`}
                              className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuEventId(null);
                              }}
                            >
                              開く
                            </Link>
                            <Link
                              href="/admin/event/areas"
                              className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuEventId(null);
                              }}
                            >
                              配布区域
                            </Link>
                            <Link
                              href={`/admin/event/${ev.year}/setting`}
                              className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuEventId(null);
                              }}
                            >
                              編集
                            </Link>
                            <button
                              className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (
                                  !confirm(
                                    `${ev.year}年度のイベントを削除しますか？関連データがある場合は削除できません。`,
                                  )
                                )
                                  return;
                                try {
                                  const token = localStorage.getItem('authToken');
                                  const res = await fetch('/api/admin/events', {
                                    method: 'DELETE',
                                    headers: {
                                      'Content-Type': 'application/json',
                                      Authorization: `Bearer ${token}`,
                                    },
                                    body: JSON.stringify({ id: ev.id }),
                                  });
                                  const data = await res.json();
                                  if (!res.ok) throw new Error(data.error || '削除に失敗しました');
                                  const { events, latest } = await fetcher('/api/admin/events');
                                  setEvents(events || []);
                                  setLatest(latest || null);
                                  setMenuEventId(null);
                                } catch (error: unknown) {
                                  const message =
                                    error instanceof Error ? error.message : '削除に失敗しました';
                                  alert(message);
                                }
                              }}
                            >
                              削除
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {events.length === 0 && (
                  <p className="text-sm text-gray-500">イベントが登録されていません</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <Modal open={isCreating} onClose={() => setIsCreating(false)} panelClassName="max-w-md p-6">
        <div className="w-full">
          <h2 className="text-lg font-semibold mb-4">イベントを追加</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">配布年度（西暦）</label>
              <input
                type="number"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
                placeholder="例: 2025"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">イベント名（任意）</label>
              <input
                type="text"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                value={form.eventName}
                onChange={(e) => setForm({ ...form, eventName: e.target.value })}
                placeholder="例: 工大祭2025 学外配布"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">配布開始日</label>
                <input
                  type="date"
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  value={form.distributionStartDate}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      distributionStartDate: e.target.value,
                      distributionEndDate: form.distributionEndDate || e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">配布終了日</label>
                <input
                  type="date"
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  value={form.distributionEndDate}
                  onChange={(e) => setForm({ ...form, distributionEndDate: e.target.value })}
                />
              </div>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={() => setIsCreating(false)}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md"
            >
              キャンセル
            </button>
            <button
              onClick={async () => {
                try {
                  const token = localStorage.getItem('authToken');
                  const res = await fetch('/api/admin/events', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                      year: Number(form.year),
                      eventName: form.eventName,
                      distributionStartDate: form.distributionStartDate,
                      distributionEndDate: form.distributionEndDate || form.distributionStartDate,
                      distributionTimeZone: DEFAULT_TIME_ZONE,
                    }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || '作成に失敗しました');
                  // 再読み込み
                  const { events, latest } = await fetcher('/api/admin/events');
                  setEvents(events || []);
                  setLatest(latest || null);
                  setIsCreating(false);
                  setForm({
                    year: '',
                    eventName: '',
                    distributionStartDate: '',
                    distributionEndDate: '',
                  });
                } catch (error: unknown) {
                  const message = error instanceof Error ? error.message : '作成に失敗しました';
                  alert(message);
                }
              }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md"
              disabled={!form.year || !form.distributionStartDate}
            >
              作成
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
