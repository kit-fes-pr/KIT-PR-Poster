'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingInline } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { Area } from '@/types';
import { useFastPageTransition } from '@/lib/hooks/usePageTransition';
import YearPageSectionHeader from '@/components/admin/YearPageSectionHeader';
import { clearAllDashboardCaches } from '@/lib/utils/dashboard/dashboard-cache';
import { useRequireAdmin } from '@/lib/hooks/useRequireAdmin';

export default function AreasPage() {
  const router = useRouter();
  const { navigateWithPreload } = useFastPageTransition();
  const { user, loading: authLoading } = useRequireAdmin();
  const [loading, setLoading] = useState(true);
  const [areas, setAreas] = useState<Area[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [editingSubmitting, setEditingSubmitting] = useState(false);
  const [form, setForm] = useState({
    areaCode: '',
    areaName: '',
    adjacentAreas: '',
    description: '',
  });
  const [editForm, setEditForm] = useState({
    areaCode: '',
    areaName: '',
    adjacentAreas: '',
    description: '',
  });

  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      try {
        setLoading(true);
        setError('');
        const token = await user.getIdToken();
        const areasRes = await fetch('/api/admin/areas', {
          headers: { Authorization: `Bearer ${token}` },
        });

        const areasData = await areasRes.json();
        if (!areasRes.ok) {
          throw new Error(areasData.error || '配布区域の取得に失敗しました');
        }
        setAreas(areasData.areas || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : '配布区域の取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user]);

  const refreshAreas = async () => {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch('/api/admin/areas', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || '配布区域の取得に失敗しました');
    }
    setAreas(data.areas || []);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      setSubmitting(true);
      setError('');
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/areas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '配布区域の作成に失敗しました');
      setForm({ areaCode: '', areaName: '', adjacentAreas: '', description: '' });
      await refreshAreas();
      clearAllDashboardCaches();
    } catch (err) {
      setError(err instanceof Error ? err.message : '配布区域の作成に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (areaId: string) => {
    if (!user || !confirm('この配布区域を削除しますか？')) return;
    try {
      setError('');
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/areas/${areaId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '削除に失敗しました');
      await refreshAreas();
      clearAllDashboardCaches();
      alert('配布区域を削除しました。');
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '削除に失敗しました';
      setError(errMsg);
      alert(errMsg);
    }
  };

  const openEditModal = (area: Area) => {
    setEditingAreaId(area.areaId);
    setEditForm({
      areaCode: area.areaCode || '',
      areaName: area.areaName || '',
      adjacentAreas: Array.isArray(area.adjacentAreas) ? area.adjacentAreas.join(', ') : '',
      description: area.description || '',
    });
  };

  const closeEditModal = () => {
    setEditingAreaId(null);
    setEditingSubmitting(false);
  };

  const handleUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !editingAreaId) return;

    try {
      setEditingSubmitting(true);
      setError('');
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/areas/${editingAreaId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '配布区域の更新に失敗しました');
      await refreshAreas();
      clearAllDashboardCaches();
      closeEditModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : '配布区域の更新に失敗しました');
    } finally {
      setEditingSubmitting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingInline size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <YearPageSectionHeader
          title="配布区域管理"
          description="すべての年度で共通の配布区域を追加、編集、削除します。"
          actions={
            <button
              onClick={() => navigateWithPreload('/admin/event')}
              className="px-4 py-2 rounded-md border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50"
            >
              年度一覧へ
            </button>
          }
        />

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">新しい配布区域を追加</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">区域コード *</label>
                <input
                  value={form.areaCode}
                  onChange={(e) => setForm({ ...form, areaCode: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                  placeholder="A-01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">区域名 *</label>
                <input
                  value={form.areaName}
                  onChange={(e) => setForm({ ...form, areaName: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                  placeholder="本館前"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  周辺区域（カンマ区切り）
                </label>
                <textarea
                  value={form.adjacentAreas}
                  onChange={(e) => setForm({ ...form, adjacentAreas: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                  rows={3}
                  placeholder="A-02, A-03"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">説明</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                  rows={4}
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? '作成中...' : '配布区域を作成'}
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">配布区域一覧</h2>
              <span className="text-sm text-gray-500">{areas.length} 件</span>
            </div>

            {areas.length === 0 ? (
              <div className="py-12 text-center text-gray-500">配布区域が登録されていません</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        区域コード
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        区域名
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        周辺区域
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        説明
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {areas.map((area) => (
                      <tr key={area.areaId}>
                        <td className="px-4 py-3 text-sm text-gray-900">{area.areaCode}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{area.areaName}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {Array.isArray(area.adjacentAreas) && area.adjacentAreas.length > 0
                            ? area.adjacentAreas.join(', ')
                            : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {area.description || '-'}
                        </td>
                        <td className="px-4 py-3 text-right text-sm">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEditModal(area)}
                              className="text-indigo-600 hover:text-indigo-900"
                            >
                              編集
                            </button>
                            <button
                              onClick={() => handleDelete(area.areaId)}
                              className="text-red-600 hover:text-red-900"
                            >
                              削除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <Modal open={Boolean(editingAreaId)} onClose={closeEditModal} panelClassName="max-w-lg p-6">
          <div className="w-full">
            <h2 className="mb-4 text-lg font-medium text-gray-900">配布区域を編集</h2>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">区域コード *</label>
                <input
                  value={editForm.areaCode}
                  onChange={(e) => setEditForm({ ...editForm, areaCode: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">区域名 *</label>
                <input
                  value={editForm.areaName}
                  onChange={(e) => setEditForm({ ...editForm, areaName: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  周辺区域（カンマ区切り）
                </label>
                <textarea
                  value={editForm.adjacentAreas}
                  onChange={(e) => setEditForm({ ...editForm, adjacentAreas: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                  rows={3}
                  placeholder="A-02, A-03"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">説明</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                  rows={4}
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={editingSubmitting}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {editingSubmitting ? '更新中...' : '更新'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      </div>
    </div>
  );
}
