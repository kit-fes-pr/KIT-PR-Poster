'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { LoadingInline } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { Area, Team, Store } from '@/types';
import YearPageSectionHeader from '@/components/admin/YearPageSectionHeader';
import {
  buildAvailabilitySlotChoices,
  formatAvailabilitySlotLabel,
} from '@/lib/utils/availability/availability';
import { normalizeGrade } from '@/lib/utils/grade/grade';
import { clearDashboardCache } from '@/lib/utils/dashboard/dashboard-cache';
import { useRequireAdmin } from '@/lib/hooks/useRequireAdmin';
import { authenticatedFetch, fetcherAuth } from '@/lib/utils/auth-fetcher';

export default function TeamDetailPage() {
  const router = useRouter();
  const params = useParams<{ year: string; teamId: string }>();
  const y = params?.year;
  const teamId = params?.teamId;

  const { user, isAdmin, loading: authLoading } = useRequireAdmin();
  const [team, setTeam] = useState<Team | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [distributionSlots, setDistributionSlots] = useState<string[]>([]);
  const completed = useMemo(
    () => stores.filter((s: Store) => s.distributionStatus === 'completed'),
    [stores],
  );
  const failed = useMemo(
    () => stores.filter((s: Store) => s.distributionStatus === 'failed'),
    [stores],
  );
  const revisit = useMemo(
    () => stores.filter((s: Store) => s.distributionStatus === 'revisit'),
    [stores],
  );
  const [loading, setLoading] = useState(true);
  const [isBasicEditOpen, setIsBasicEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<{
    teamName: string;
    timeSlot: string;
    assignedArea: string;
  }>({ teamName: '', timeSlot: '', assignedArea: '' });
  const [memberLoading, setMemberLoading] = useState(false);
  const [assignedMembers, setAssignedMembers] = useState<
    Array<{
      responseId: string;
      name: string;
      grade: number;
      section: string;
      timeSlot: string;
      formId: string;
    }>
  >([]);

  useEffect(() => {
    if (!teamId) {
      console.error('No teamId provided');
      router.replace('/admin/event');
      return;
    }

    const init = async () => {
      if (!isAdmin || !user) return;
      try {
        const token = await user.getIdToken();

        const eventRes = await fetch(`/api/admin/events?year=${y}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (eventRes.ok) {
          const eventJson = await eventRes.json().catch(() => ({}));
          const eventData = (
            Array.isArray(eventJson?.data) && eventJson.data.length > 0 ? eventJson.data[0] : null
          ) as {
            distributionAvailabilitySlots?: string[];
            distributionStartDate?: string | Date;
            distributionEndDate?: string | Date;
          } | null;
          const slots =
            Array.isArray(eventData?.distributionAvailabilitySlots) &&
            eventData?.distributionAvailabilitySlots.length > 0
              ? eventData!.distributionAvailabilitySlots!.filter(
                  (slot): slot is string => typeof slot === 'string',
                )
              : buildAvailabilitySlotChoices(
                  eventData?.distributionStartDate,
                  eventData?.distributionEndDate,
                ).map((choice) => choice.key);
          setDistributionSlots(slots);
        }

        const td = await fetcherAuth(`/api/admin/teams/${teamId}`, token);
        const areasData = await fetcherAuth('/api/admin/areas', token);
        const loadedAreas = (areasData.areas || []) as Area[];
        const selectedArea = loadedAreas.find(
          (area) =>
            area.areaId === td.team.areaId ||
            area.areaId === td.team.assignedArea ||
            area.areaCode === td.team.assignedArea,
        );
        setTeam(td.team);
        setAreas(loadedAreas);

        setEditForm({
          teamName: td.team.teamName || '',
          timeSlot: td.team.timeSlot || '',
          assignedArea: selectedArea?.areaId || '',
        });

        const st = await fetcherAuth(`/api/admin/teams/${teamId}/stores`);
        setStores(st.stores || []);
      } catch (error) {
        console.error('Team detail loading error:', error);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [router, teamId, y, isAdmin, user]);

  // 割り当てメンバー取得
  useEffect(() => {
    const loadMembers = async () => {
      if (!teamId || !y || authLoading || !user) return;
      try {
        setMemberLoading(true);
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/teams/${teamId}/members?year=${y}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || '割り当てメンバーの取得に失敗しました');
        }
        const data = await res.json();
        setAssignedMembers(data.members || []);
      } catch (e) {
        console.error('Load assigned members error:', e);
      } finally {
        setMemberLoading(false);
      }
    };
    loadMembers();
  }, [teamId, y, user, authLoading]);

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

  const StatusBadge = ({ status }: { status: string }) => {
    const map: Record<string, string> = {
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      revisit: 'bg-yellow-100 text-yellow-800',
      pending: 'bg-gray-100 text-gray-800',
    };
    const label: Record<string, string> = {
      completed: '配布済み',
      failed: '配布不可',
      revisit: '要再訪問',
      pending: '未配布',
    };
    const cls = map[status] || map.pending;
    const text = label[status] || label.pending;
    return <span className={`inline-block px-2 py-1 text-xs rounded-full ${cls}`}>{text}</span>;
  };

  const getTeamAreaName = (targetTeam?: Team | null) => {
    if (!targetTeam) return '-';
    const matched = areas.find(
      (area) =>
        area.areaId === targetTeam.areaId ||
        area.areaId === targetTeam.assignedArea ||
        area.areaCode === targetTeam.assignedArea,
    );
    return matched?.areaName || '-';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 space-y-6">
        <YearPageSectionHeader
          title={`${y} 年度 チーム詳細`}
          description="チーム情報の確認と編集を行います。"
          actions={
            <>
              <Link
                href={`/admin/event/${y}/team`}
                className="px-4 py-2 border rounded-md text-sm bg-white text-gray-700 hover:bg-gray-50"
              >
                チーム管理へ戻る
              </Link>
              <button
                className="px-4 py-2 border border-red-300 text-red-700 rounded-md text-sm bg-white hover:bg-red-50"
                onClick={async () => {
                  if (!confirm('このチームを削除しますか？配布記録がある場合は削除できません。'))
                    return;
                  try {
                    const res = await authenticatedFetch(`/api/admin/teams/${teamId}`, {
                      method: 'DELETE',
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || '削除に失敗しました');
                    clearDashboardCache(Number(y));
                    router.push(`/admin/event/${y}/team`);
                  } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : '削除に失敗しました';
                    alert(message);
                  }
                }}
              >
                削除
              </button>
            </>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow lg:col-span-3">
            <h2 className="text-lg font-medium">
              {team?.teamName}（{team?.teamCode}）
            </h2>
            <p className="text-sm text-gray-600 mt-1">担当区域: {getTeamAreaName(team)}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <div>
                <p className="text-sm text-gray-600">総件数</p>
                <p className="text-2xl font-bold">{stores.length}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">配布済み</p>
                <p className="text-2xl font-bold text-green-600">{completed.length}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">配布不可</p>
                <p className="text-2xl font-bold text-red-600">{failed.length}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">要再訪問</p>
                <p className="text-2xl font-bold text-yellow-600">{revisit.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow lg:col-span-1">
            <h2 className="text-lg font-medium mb-3">配布済み</h2>
            <div className="space-y-3 max-h-[60vh] overflow-auto pr-2">
              {completed.map((s: Store) => (
                <div key={s.storeId} className="border rounded p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{s.storeName}</p>
                    <StatusBadge status={s.distributionStatus} />
                  </div>
                  <p className="text-sm text-gray-600">{s.address}</p>
                  <p className="text-xs text-gray-500 mt-1">配布枚数: {s.distributedCount || 0}</p>
                  {s.notes && <p className="text-xs text-gray-500 mt-1">備考: {s.notes}</p>}
                </div>
              ))}
              {completed.length === 0 && <p className="text-sm text-gray-500">なし</p>}
            </div>
            {isBasicEditOpen && (
              <Modal open onClose={() => setIsBasicEditOpen(false)} panelClassName="max-w-md p-6">
                <div className="w-full">
                  <h2 className="text-lg font-medium mb-4">基本情報を編集</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">チーム名</label>
                      <input
                        className="mt-1 w-full border rounded px-3 py-2"
                        value={editForm.teamName}
                        onChange={(e) => setEditForm({ ...editForm, teamName: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">配布枠</label>
                      <select
                        className="mt-1 w-full border rounded px-3 py-2"
                        value={editForm.timeSlot}
                        onChange={(e) => setEditForm({ ...editForm, timeSlot: e.target.value })}
                        disabled={distributionSlots.length === 0}
                      >
                        <option value="">配布枠を選択</option>
                        {distributionSlots.map((slot) => (
                          <option key={slot} value={slot}>
                            {formatAvailabilitySlotLabel(slot)}
                          </option>
                        ))}
                      </select>
                      {distributionSlots.length === 0 && (
                        <p className="mt-1 text-xs text-gray-500">
                          先に配布設定で配布枠を登録してください。
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">担当区域</label>
                      <select
                        className="mt-1 w-full border rounded px-3 py-2"
                        value={editForm.assignedArea}
                        onChange={(e) => setEditForm({ ...editForm, assignedArea: e.target.value })}
                      >
                        <option value="">担当区域を選択</option>
                        {areas.map((area) => (
                          <option key={area.areaId} value={area.areaId}>
                            {area.areaName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      onClick={() => setIsBasicEditOpen(false)}
                      className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md"
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const payload = {
                            teamName: editForm.teamName,
                            timeSlot: editForm.timeSlot,
                            areaId: editForm.assignedArea,
                          };
                          const res = await authenticatedFetch(`/api/admin/teams/${teamId}`, {
                            method: 'PATCH',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(payload),
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error || '更新に失敗しました');
                          clearDashboardCache(Number(y));
                          setTeam(data.team);
                          setIsBasicEditOpen(false);
                        } catch (error: unknown) {
                          const message =
                            error instanceof Error ? error.message : '更新に失敗しました';
                          alert(message);
                        }
                      }}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-md"
                    >
                      保存
                    </button>
                  </div>
                </div>
              </Modal>
            )}
          </div>

          <div className="bg-white p-6 rounded-lg shadow lg:col-span-1">
            <h2 className="text-lg font-medium mb-3">配布不可</h2>
            <div className="space-y-3 max-h-[60vh] overflow-auto pr-2">
              {failed.map((s: Store) => (
                <div key={s.storeId} className="border rounded p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{s.storeName}</p>
                    <StatusBadge status={s.distributionStatus} />
                  </div>
                  <p className="text-sm text-gray-600">{s.address}</p>
                  <p className="text-xs text-gray-500 mt-1">理由: {s.failureReason || '-'}</p>
                  {s.notes && <p className="text-xs text-gray-500 mt-1">備考: {s.notes}</p>}
                </div>
              ))}
              {failed.length === 0 && <p className="text-sm text-gray-500">なし</p>}
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow lg:col-span-1">
            <h2 className="text-lg font-medium mb-3">要再訪問</h2>
            <div className="space-y-3 max-h-[60vh] overflow-auto pr-2">
              {revisit.map((s: Store) => (
                <div key={s.storeId} className="border rounded p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{s.storeName}</p>
                    <StatusBadge status={s.distributionStatus} />
                  </div>
                  <p className="text-sm text-gray-600">{s.address}</p>
                  {s.notes && <p className="text-xs text-gray-500 mt-1">備考: {s.notes}</p>}
                </div>
              ))}
              {revisit.length === 0 && <p className="text-sm text-gray-500">なし</p>}
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow lg:col-span-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium mb-4">基本情報</h2>
              <button
                onClick={() => setIsBasicEditOpen(true)}
                className="px-3 py-1 border rounded-md"
              >
                編集
              </button>
            </div>
            {loading ? (
              <LoadingInline />
            ) : (
              <div className="space-y-3 text-sm">
                <p>
                  <span className="text-gray-600">チーム名:</span>{' '}
                  <span className="ml-2 font-medium">{team?.teamName || '-'}</span>
                </p>
                <p>
                  <span className="text-gray-600">コード:</span>{' '}
                  <span className="ml-2">{team?.teamCode || '-'}</span>
                </p>
                <p>
                  <span className="text-gray-600">配布枠:</span>{' '}
                  <span className="ml-2">{formatAvailabilitySlotLabel(team?.timeSlot || '')}</span>
                </p>
                <p>
                  <span className="text-gray-600">担当区域:</span>{' '}
                  <span className="ml-2">{getTeamAreaName(team)}</span>
                </p>
              </div>
            )}
          </div>

          {/* 割り当てメンバー */}
          <div className="bg-white p-6 rounded-lg shadow lg:col-span-3">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium">割り当てメンバー</h2>
              <span className="text-sm text-gray-500">{assignedMembers.length} 名</span>
            </div>
            {memberLoading ? (
              <LoadingInline />
            ) : assignedMembers.length === 0 ? (
              <p className="text-sm text-gray-500">
                現在このチームに割り当てられたメンバーはありません
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        氏名
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        学年
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        セクション
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        時間帯
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {assignedMembers
                      .slice()
                      .sort((a, b) => {
                        const aGrade = normalizeGrade(a.grade);
                        const bGrade = normalizeGrade(b.grade);
                        if (bGrade !== aGrade) return bGrade - aGrade;
                        return new Intl.Collator('ja').compare(a.name || '', b.name || '');
                      })
                      .map((m) => (
                        <tr key={m.responseId}>
                          <td className="px-6 py-3 text-sm text-gray-900">{m.name}</td>
                          <td className="px-6 py-3 text-sm text-gray-900">
                            {m.grade ? `${m.grade}年` : '-'}
                          </td>
                          <td className="px-6 py-3 text-sm text-gray-900">{m.section}</td>
                          <td className="px-6 py-3 text-sm">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                m.timeSlot.endsWith('_am')
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : m.timeSlot.endsWith('_pm')
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {formatAvailabilitySlotLabel(m.timeSlot)}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
