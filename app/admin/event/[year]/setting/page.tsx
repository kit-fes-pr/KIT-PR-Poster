'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import YearPageSectionHeader from '@/components/admin/YearPageSectionHeader';
import { LoadingInline } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { formatDateOnly } from '@/lib/utils/dateUtils';
import {
  buildAvailabilitySlotChoices,
  UNAVAILABLE_SLOT_KEY,
  ALL_AVAILABLE_SLOT_KEY,
} from '@/lib/utils/availability/availability';
import type { AvailabilitySlotChoice } from '@/lib/utils/availability/availability';
import { useRequireAdmin } from '@/lib/hooks/useRequireAdmin';
import { clearDashboardCache } from '@/lib/utils/dashboard/dashboard-cache';

type EventSummary = {
  id?: string;
  eventName?: string;
  distributionStartDate?: string | Date;
  distributionEndDate?: string | Date;
  distributionAvailabilitySlots?: string[];
  distributionTimeZone?: string;
};

type CurrentForm = {
  formId: string;
  title: string;
  description?: string;
  isActive: boolean;
  fields: { fieldId: string; options?: string[]; visibleFromGrade?: number }[];
};

type TeamSummary = {
  teamId?: string;
  id?: string;
  teamName?: string;
  teamCode?: string;
  timeSlot?: string;
};

type TeamSlotBulkUpdate = {
  teamId: string;
  timeSlot: string;
  eventId: string;
  year: number;
};

function buildFormAvailabilityOptions(slotKeys: string[]): string[] {
  return [...slotKeys, UNAVAILABLE_SLOT_KEY, ALL_AVAILABLE_SLOT_KEY];
}

function toInputDateValue(value: string | Date | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export default function DistributionSettingsPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const router = useRouter();
  const [resolvedParams, setResolvedParams] = useState<{ year: string } | null>(null);
  const { user, loading: authLoading } = useRequireAdmin();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [eventData, setEventData] = useState<EventSummary | null>(null);
  const [currentForm, setCurrentForm] = useState<CurrentForm | null>(null);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [eventName, setEventName] = useState('');
  const [distributionStartDate, setDistributionStartDate] = useState('');
  const [distributionEndDate, setDistributionEndDate] = useState('');
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [teamSlotModalOpen, setTeamSlotModalOpen] = useState(false);
  const [teamSlotDrafts, setTeamSlotDrafts] = useState<Record<string, string>>({});
  const [applyingTeamSlots, setApplyingTeamSlots] = useState(false);
  const hasLoadedRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef<string>('');

  useEffect(() => {
    params.then(setResolvedParams);
  }, [params]);

  const allChoices = useMemo<AvailabilitySlotChoice[]>(
    () => buildAvailabilitySlotChoices(distributionStartDate, distributionEndDate),
    [distributionStartDate, distributionEndDate],
  );

  useEffect(() => {
    if (!resolvedParams || !user || authLoading) return;

    const load = async () => {
      try {
        setLoading(true);
        setError('');

        const token = await user.getIdToken();
        const eventId = `kodai${resolvedParams.year}`;

        const [eventRes, formsRes, teamsRes] = await Promise.all([
          fetch(`/api/admin/events?year=${resolvedParams.year}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/forms?eventId=${eventId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/admin/teams?year=${resolvedParams.year}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const eventJson = await eventRes.json().catch(() => null);
        const formsJson = await formsRes.json().catch(() => null);
        const teamsJson = await teamsRes.json().catch(() => null);

        if (!eventRes.ok) {
          setError(eventJson?.error || 'イベント設定の取得に失敗しました');
          return;
        }

        const nextEvent = (
          Array.isArray(eventJson?.data) && eventJson.data.length > 0 ? eventJson.data[0] : null
        ) as EventSummary | null;
        setEventData(nextEvent);
        setEventName(nextEvent?.eventName || `工大祭${resolvedParams.year}`);
        setDistributionStartDate(
          toInputDateValue(nextEvent?.distributionStartDate as string | Date | undefined),
        );
        setDistributionEndDate(
          toInputDateValue(nextEvent?.distributionEndDate as string | Date | undefined),
        );

        const slotsFromEvent =
          Array.isArray(nextEvent?.distributionAvailabilitySlots) &&
          nextEvent?.distributionAvailabilitySlots!.length > 0
            ? nextEvent!.distributionAvailabilitySlots!
            : buildAvailabilitySlotChoices(
                nextEvent?.distributionStartDate,
                nextEvent?.distributionEndDate,
              ).map((choice) => choice.key);
        setSelectedSlots(slotsFromEvent);
        lastSavedSnapshotRef.current = JSON.stringify({
          eventName: nextEvent?.eventName || `工大祭${resolvedParams.year}`,
          distributionStartDate: toInputDateValue(
            nextEvent?.distributionStartDate as string | Date | undefined,
          ),
          distributionEndDate: toInputDateValue(
            nextEvent?.distributionEndDate as string | Date | undefined,
          ),
          selectedSlots: slotsFromEvent,
        });
        hasLoadedRef.current = true;

        const nextForm =
          Array.isArray(formsJson?.forms) && formsJson.forms.length > 0
            ? (formsJson.forms[0] as CurrentForm)
            : null;
        setCurrentForm(nextForm);
        setTeams(Array.isArray(teamsJson?.teams) ? (teamsJson.teams as TeamSummary[]) : []);
      } catch (err) {
        console.error(err);
        setError('イベント設定の読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [resolvedParams, user, authLoading]);

  useEffect(() => {
    if (allChoices.length === 0) return;
    setSelectedSlots((current) => {
      const valid = current.filter((slot) => allChoices.some((choice) => choice.key === slot));
      if (valid.length > 0) return valid;
      return allChoices.map((choice) => choice.key);
    });
  }, [allChoices]);

  const persistSettings = useCallback(
    async (silent = false) => {
      if (!resolvedParams || !user) return false;

      if (!distributionStartDate || !distributionEndDate) {
        if (!silent) {
          setError('配布日を入力してください');
        }
        setSaveStatus('error');
        return false;
      }

      const validSlots = selectedSlots.filter((slot) =>
        allChoices.some((choice) => choice.key === slot),
      );
      if (validSlots.length === 0) {
        if (!silent) {
          setError('午前/午後を一つ以上選択してください');
        }
        setSaveStatus('error');
        return false;
      }

      try {
        if (!silent) {
          setError('');
        }
        setSaveStatus('saving');

        const token = await user.getIdToken();
        const eventId = eventData?.id || `kodai${resolvedParams.year}`;

        const eventRes = await fetch('/api/admin/events', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            id: eventId,
            year: Number(resolvedParams.year),
            eventName,
            distributionStartDate,
            distributionEndDate,
            distributionAvailabilitySlots: validSlots,
          }),
        });

        const eventJson = await eventRes.json().catch(() => null);
        if (!eventRes.ok) {
          setError(eventJson?.error || 'イベント設定の保存に失敗しました');
          setSaveStatus('error');
          return false;
        }

        setEventData(eventJson.data as EventSummary);
        setSelectedSlots(validSlots);

        if (currentForm) {
          const carUsageVisibleFromGrade =
            currentForm.fields.find((field) => field.fieldId === 'carUsage')?.visibleFromGrade ?? 1;
          const formRes = await fetch(`/api/forms/${currentForm.formId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              title: currentForm.title,
              description: currentForm.description || '',
              isActive: currentForm.isActive,
              fields: [
                {
                  fieldId: 'availability',
                  type: 'checkbox',
                  label: '参加可能日時',
                  placeholder: '参加可能な日時を選択してください',
                  required: true,
                  options: buildFormAvailabilityOptions(validSlots),
                  order: 0,
                },
                {
                  fieldId: 'carUsage',
                  type: 'radio',
                  label: '車の運転ができますか',
                  required: true,
                  visibleFromGrade: carUsageVisibleFromGrade,
                  options: ['運転できる', '免許はあるが運転しない', '免許を持っていない'],
                  order: 1,
                },
                {
                  fieldId: 'remarks',
                  type: 'textarea',
                  label: '備考',
                  placeholder: 'その他連絡事項があればご記入ください',
                  required: false,
                  order: 2,
                },
              ],
            }),
          });

          const formJson = await formRes.json().catch(() => null);
          if (!formRes.ok) {
            setError(formJson?.error || 'フォームの選択肢同期に失敗しました');
            setSaveStatus('error');
            return false;
          }
        }

        lastSavedSnapshotRef.current = JSON.stringify({
          eventName,
          distributionStartDate,
          distributionEndDate,
          selectedSlots: validSlots,
        });
        setSaveStatus('saved');
        return true;
      } catch (err) {
        console.error(err);
        setError('イベント設定の保存に失敗しました');
        setSaveStatus('error');
        return false;
      } finally {
      }
    },
    [
      allChoices,
      currentForm,
      distributionEndDate,
      distributionStartDate,
      eventData?.id,
      eventName,
      resolvedParams,
      selectedSlots,
      user,
    ],
  );

  const getSavedSnapshot = useCallback(() => {
    try {
      return JSON.parse(lastSavedSnapshotRef.current || '{}') as {
        eventName?: string;
        distributionStartDate?: string;
        distributionEndDate?: string;
        selectedSlots?: string[];
      };
    } catch {
      return {};
    }
  }, []);

  const buildDefaultTeamSlotDrafts = useCallback(
    (choices: AvailabilitySlotChoice[]) => {
      const fallbackSlot = choices[0]?.key || '';
      return teams.reduce<Record<string, string>>((acc, team) => {
        const teamId = team.teamId || team.id || '';
        if (!teamId) return acc;
        const currentSuffix = String(team.timeSlot || '').endsWith('_pm') ? '_pm' : '_am';
        const sameHalfDay = choices.find((choice) => choice.key.endsWith(currentSuffix));
        const stillValid = choices.find((choice) => choice.key === team.timeSlot);
        acc[teamId] = stillValid?.key || sameHalfDay?.key || fallbackSlot;
        return acc;
      }, {});
    },
    [teams],
  );

  const openTeamSlotModalForDateChange = useCallback(
    (nextStartDate: string, nextEndDate: string) => {
      const nextChoices = buildAvailabilitySlotChoices(nextStartDate, nextEndDate);
      setTeamSlotDrafts(buildDefaultTeamSlotDrafts(nextChoices));
      setTeamSlotModalOpen(true);
    },
    [buildDefaultTeamSlotDrafts],
  );

  const handleDistributionStartDateChange = (value: string) => {
    setDistributionStartDate(value);
    if (!hasLoadedRef.current || teams.length === 0) return;
    const saved = getSavedSnapshot();
    if (value !== saved.distributionStartDate) {
      openTeamSlotModalForDateChange(value, distributionEndDate || value);
    }
  };

  const handleDistributionEndDateChange = (value: string) => {
    setDistributionEndDate(value);
    if (!hasLoadedRef.current || teams.length === 0) return;
    const saved = getSavedSnapshot();
    if (value !== saved.distributionEndDate) {
      openTeamSlotModalForDateChange(distributionStartDate || value, value);
    }
  };

  const cancelTeamSlotChange = () => {
    const saved = getSavedSnapshot();
    setDistributionStartDate(saved.distributionStartDate || '');
    setDistributionEndDate(saved.distributionEndDate || '');
    setSelectedSlots(saved.selectedSlots || []);
    setTeamSlotDrafts({});
    setTeamSlotModalOpen(false);
  };

  const applyTeamSlotChange = async () => {
    if (!user || !resolvedParams) return;
    const invalidTeam = teams.find((team) => {
      const teamId = team.teamId || team.id || '';
      return !teamId || !teamSlotDrafts[teamId];
    });
    if (invalidTeam) {
      setError('すべてのチームに配布枠を選択してください');
      return;
    }

    try {
      setApplyingTeamSlots(true);
      setError('');
      const saved = await persistSettings(false);
      if (!saved) return;

      const token = await user.getIdToken();
      const eventId = eventData?.id || `kodai${resolvedParams.year}`;
      const updates = teams
        .map((team) => {
          const teamId = team.teamId || team.id || '';
          const nextTimeSlot = teamSlotDrafts[teamId];
          if (!teamId || !nextTimeSlot || nextTimeSlot === team.timeSlot) return null;
          return {
            teamId,
            timeSlot: nextTimeSlot,
            eventId,
            year: Number(resolvedParams.year),
          };
        })
        .filter((update): update is TeamSlotBulkUpdate => update !== null);

      if (updates.length > 0) {
        const res = await fetch('/api/admin/teams/bulk', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ updates }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(json?.error || 'チーム配布枠の更新に失敗しました');
        }
      }

      setTeams((current) =>
        current.map((team) => {
          const teamId = team.teamId || team.id || '';
          return teamId && teamSlotDrafts[teamId]
            ? { ...team, timeSlot: teamSlotDrafts[teamId] }
            : team;
        }),
      );
      clearDashboardCache(Number(resolvedParams.year));
      setTeamSlotModalOpen(false);
      setTeamSlotDrafts({});
      setSaveStatus('saved');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'チーム配布枠の更新に失敗しました');
      setSaveStatus('error');
    } finally {
      setApplyingTeamSlots(false);
    }
  };

  const toggleSlot = (slotKey: string) => {
    setSelectedSlots((current) =>
      current.includes(slotKey)
        ? current.filter((value) => value !== slotKey)
        : [...current, slotKey],
    );
  };

  useEffect(() => {
    if (!hasLoadedRef.current || !resolvedParams || !user || authLoading) return;
    if (teamSlotModalOpen) return;

    const snapshot = JSON.stringify({
      eventName,
      distributionStartDate,
      distributionEndDate,
      selectedSlots,
    });

    if (snapshot === lastSavedSnapshotRef.current) return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      void persistSettings(true);
    }, 700);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [
    eventName,
    distributionStartDate,
    distributionEndDate,
    selectedSlots,
    resolvedParams,
    user,
    authLoading,
    persistSettings,
  ]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingInline size="lg" />
      </div>
    );
  }

  if (!user || !resolvedParams) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <YearPageSectionHeader
          title={`イベント設定 (${resolvedParams.year}年度)`}
          actions={
            <>
              <Link
                href={`/admin/event/${resolvedParams.year}`}
                className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                年度ページへ戻る
              </Link>
              <Link
                href={`/admin/event/${resolvedParams.year}/form`}
                className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                フォーム管理へ
              </Link>
            </>
          }
        />

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <p className="mt-4 text-xs text-gray-500">
          自動保存:{' '}
          {saveStatus === 'saving' ? '保存中' : saveStatus === 'saved' ? '保存済み' : '保存エラー'}
        </p>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">基本情報</h2>
              <div className="mt-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">イベント名</label>
                  <input
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">配布開始日</label>
                  <input
                    type="date"
                    value={distributionStartDate}
                    onChange={(e) => handleDistributionStartDateChange(e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">配布終了日</label>
                  <input
                    type="date"
                    value={distributionEndDate}
                    onChange={(e) => handleDistributionEndDateChange(e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">実施時間設定</h2>
                </div>
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                  {selectedSlots.length}件選択中
                </span>
              </div>

              {allChoices.length === 0 ? (
                <p className="mt-4 text-sm text-red-600">
                  配布期間を設定すると選択肢が表示されます。
                </p>
              ) : (
                <div className="mt-4 grid gap-3">
                  {(() => {
                    const grouped = new Map<string, AvailabilitySlotChoice[]>();
                    allChoices.forEach((choice) => {
                      if (!choice.date) return;
                      const current = grouped.get(choice.date) || [];
                      current.push(choice);
                      grouped.set(choice.date, current);
                    });

                    return Array.from(grouped.entries()).map(([dateKey, items]) => (
                      <div
                        key={dateKey}
                        className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                      >
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-gray-900">{dateKey}</p>
                          <p className="text-xs text-gray-500">{formatDateOnly(dateKey)}</p>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {items.map((choice) => {
                            const checked = selectedSlots.includes(choice.key);
                            return (
                              <label
                                key={choice.key}
                                className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${
                                  checked
                                    ? 'border-indigo-300 bg-indigo-50'
                                    : 'border-gray-200 bg-white'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleSlot(choice.key)}
                                  className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-sm text-gray-700">{choice.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <Modal
        open={teamSlotModalOpen}
        onClose={applyingTeamSlots ? () => undefined : cancelTeamSlotChange}
        panelClassName="max-w-3xl"
      >
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">チームの配布枠を更新</h2>
          <p className="mt-1 text-sm text-gray-600">
            配布日が変更されたため、既存チームの配布枠を新しい日程に合わせて選択してください。
          </p>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          {allChoices.length === 0 ? (
            <p className="text-sm text-red-600">配布期間を設定してください。</p>
          ) : (
            <div className="space-y-3">
              {teams.map((team) => {
                const teamId = team.teamId || team.id || '';
                return (
                  <div
                    key={teamId || team.teamCode}
                    className="grid gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:grid-cols-[1fr_220px]"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {team.teamName || '名称未設定'}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">{team.teamCode || '-'}</p>
                    </div>
                    <select
                      value={teamSlotDrafts[teamId] || ''}
                      onChange={(e) =>
                        setTeamSlotDrafts((current) => ({
                          ...current,
                          [teamId]: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500"
                      disabled={!teamId || applyingTeamSlots}
                    >
                      <option value="">配布枠を選択</option>
                      {allChoices.map((choice) => (
                        <option key={choice.key} value={choice.key}>
                          {choice.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={cancelTeamSlotChange}
            disabled={applyingTeamSlots}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={applyTeamSlotChange}
            disabled={applyingTeamSlots || allChoices.length === 0}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {applyingTeamSlots ? '更新中...' : '保存して更新'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
