'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDate } from '@/lib/utils/dateUtils';
import {
  UNAVAILABLE_SLOT_KEY,
  ALL_AVAILABLE_SLOT_KEY,
  buildAvailabilitySlotChoices,
  compareAvailabilitySlotKeys,
  formatAvailabilitySlotLabel,
  normalizeAvailabilitySlots,
  sortAvailabilitySlotKeys,
  toggleAvailabilitySelection,
} from '@/lib/utils/availability/availability';
import { normalizeGrade } from '@/lib/utils/grade/grade';
import { filterVisibleFormFieldsForParticipant } from '@/lib/utils/forms/forms';
import { LoadingInline } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { MetricCard } from '@/components/ui/MetricCard';
import { SectionCard } from '@/components/ui/SectionCard';
import { ExportActionButtons } from '@/components/ui/ExportActionButtons';
import YearPageSectionHeader from '@/components/admin/YearPageSectionHeader';
import { Area } from '@/types';
import type { FormAnswer } from '@/types/forms';
import { clearDashboardCache } from '@/lib/utils/dashboard/dashboard-cache';
import { useRequireAdmin } from '@/lib/hooks/useRequireAdmin';
import { buildCsvContent, downloadCsvFile } from '@/lib/utils/export/export';

interface Participant {
  responseId: string;
  name: string;
  grade: number;
  section: string;
  availableSlots: string[];
  submittedAt: Date;
}

interface Team {
  teamId: string;
  teamCode: string;
  teamName: string;
  timeSlot: string;
  areaId?: string;
  assignedArea: string;
  maxMembers: number;
  preferredGrades?: number[];
}

interface Assignment {
  responseId: string;
  teamId: string;
  assignedAt: Date;
  assignedBy: 'auto' | 'manual';
  timeSlot: string;
}

interface FormField {
  fieldId: string;
  type: 'text' | 'select' | 'radio' | 'checkbox' | 'textarea' | 'number';
  label: string;
  placeholder?: string;
  required: boolean;
  visibleFromGrade?: number;
  options?: string[];
  validation?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
  };
  order: number;
}

interface CurrentForm {
  formId: string;
  title: string;
  fields: FormField[];
  isActive?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

interface ResponseRecord {
  responseId: string;
  participantData?: {
    name: string;
    grade: number;
    section: string;
    availableSlots?: string[];
  };
  answers?: FormAnswer[];
  submittedAt: string | Date;
}

function parseDateTimestamp(value: string | Date | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export default function TeamAssignmentPage({ params }: { params: Promise<{ year: string }> }) {
  const router = useRouter();
  const [resolvedParams, setResolvedParams] = useState<{ year: string } | null>(null);
  const { user, loading: authLoading } = useRequireAdmin();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [distributionSlots, setDistributionSlots] = useState<string[]>([]);
  const [distributionEventId, setDistributionEventId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedForm, setSelectedForm] = useState<string>('');
  const [selectedFormTitle, setSelectedFormTitle] = useState<string>('');
  const [currentForm, setCurrentForm] = useState<CurrentForm | null>(null);
  const [responseRecords, setResponseRecords] = useState<Record<string, ResponseRecord>>({});
  const [showManualModal, setShowManualModal] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [manualAssignTeamId, setManualAssignTeamId] = useState<string>('');
  const [manualAssignLoading, setManualAssignLoading] = useState<boolean>(false);
  const [showResponseEditModal, setShowResponseEditModal] = useState(false);
  const [selectedResponseId, setSelectedResponseId] = useState<string>('');
  const [editingResponseLoading, setEditingResponseLoading] = useState(false);
  const [responseEditValues, setResponseEditValues] = useState<Record<string, string | string[]>>(
    {},
  );
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>('');
  const [showCreateTeamForm, setShowCreateTeamForm] = useState(false);
  const [createTeamSubmitting, setCreateTeamSubmitting] = useState(false);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [lastAutoAssignmentStats, setLastAutoAssignmentStats] = useState<{
    total: number;
    assigned: number;
    unassigned: number;
    skippedUnavailable: number;
    skippedNoMatchingTeam: number;
    skippedFull: number;
  } | null>(null);
  const [createTeamForm, setCreateTeamForm] = useState({
    teamCode: '',
    teamName: '',
    areaId: '',
    timeSlot: '',
  });

  useEffect(() => {
    params.then(setResolvedParams);
  }, [params]);

  useEffect(() => {
    if (!resolvedParams || !user || authLoading) return;
    loadData();
  }, [resolvedParams, user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    if (!resolvedParams || !user) return;

    try {
      setLoading(true);
      const token = await user.getIdToken();

      const eventRes = await fetch(`/api/admin/events?year=${resolvedParams.year}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      let eventIdForYear = `kodai${resolvedParams.year}`;
      if (eventRes.ok) {
        const eventJson = await eventRes.json();
        const eventData = (
          Array.isArray(eventJson?.data) && eventJson.data.length > 0 ? eventJson.data[0] : null
        ) as {
          id?: string;
          distributionAvailabilitySlots?: string[];
          distributionStartDate?: string | Date;
          distributionEndDate?: string | Date;
        } | null;
        eventIdForYear = eventData?.id || eventIdForYear;
        setDistributionEventId(eventIdForYear);

        const slots =
          Array.isArray(eventData?.distributionAvailabilitySlots) &&
          eventData?.distributionAvailabilitySlots.length > 0
            ? sortAvailabilitySlotKeys(
                eventData!.distributionAvailabilitySlots!.filter(
                  (slot): slot is string => typeof slot === 'string',
                ),
              )
            : sortAvailabilitySlotKeys(
                buildAvailabilitySlotChoices(
                  eventData?.distributionStartDate,
                  eventData?.distributionEndDate,
                ).map((choice) => choice.key),
              );
        setDistributionSlots(slots);
        if (!createTeamForm.timeSlot && slots.length > 0) {
          setCreateTeamForm((prev) => ({ ...prev, timeSlot: slots[0] }));
        }
      } else {
        setDistributionEventId(eventIdForYear);
      }

      const formsRes = await fetch(`/api/forms?year=${encodeURIComponent(resolvedParams.year)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const formsData = formsRes.ok ? await formsRes.json() : null;
      const availableForms = Array.isArray(formsData?.forms)
        ? (formsData.forms as CurrentForm[])
        : [];
      const nextForm =
        availableForms.find((form) => form.isActive) ||
        [...availableForms].sort((a, b) => {
          const aTime = parseDateTimestamp(a.updatedAt ?? a.createdAt);
          const bTime = parseDateTimestamp(b.updatedAt ?? b.createdAt);
          return bTime - aTime;
        })[0] ||
        null;
      if (nextForm) {
        setCurrentForm(nextForm);
        setSelectedForm(nextForm.formId);
        setSelectedFormTitle(nextForm.title || '');
        await loadParticipants(nextForm.formId);
      } else {
        setCurrentForm(null);
        setSelectedForm('');
        setSelectedFormTitle('');
        setParticipants([]);
        setResponseRecords({});
      }

      await loadTeams();
      await loadAreas();
      await loadAssignments();
    } catch (err) {
      setError('データの取得に失敗しました');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getAvailabilityLabel = (slots: string[]) => {
    const normalized = sortAvailabilitySlotKeys(normalizeAvailabilitySlots(slots));
    if (normalized.length === 0) return '-';
    return normalized.map((slot) => formatAvailabilitySlotLabel(slot)).join(' / ');
  };

  const openResponseEditModal = (participant: Participant) => {
    const record = responseRecords[participant.responseId];
    const answerMap = new Map(
      (record?.answers || []).map((answer) => [answer.fieldId, answer.value]),
    );

    setSelectedParticipant(participant);
    setSelectedResponseId(participant.responseId);
    const participantGradeValue = normalizeGrade(
      record?.participantData?.grade ?? participant.grade,
    );
    setResponseEditValues({
      participantName: record?.participantData?.name || participant.name || '',
      participantGrade: participantGradeValue > 0 ? String(participantGradeValue) : '',
      participantSection: record?.participantData?.section || participant.section || '',
      availability: normalizeAvailabilitySlots(
        record?.participantData?.availableSlots || participant.availableSlots,
      ),
      ...Object.fromEntries(answerMap.entries()),
    });
    setShowResponseEditModal(true);
  };

  const updateAvailabilityField = (fieldId: string, option: string, options: string[]) => {
    const allDateSlotKeys = options.filter(
      (key) => key !== UNAVAILABLE_SLOT_KEY && key !== ALL_AVAILABLE_SLOT_KEY,
    );
    setResponseEditValues((current) => {
      const currentValues = normalizeAvailabilitySlots(current[fieldId]);
      const nextValues = toggleAvailabilitySelection(currentValues, option, allDateSlotKeys);
      return { ...current, [fieldId]: nextValues };
    });
  };

  const saveResponseEdit = async () => {
    if (!resolvedParams || !user || !selectedForm || !selectedResponseId || !currentForm) return;

    const record = responseRecords[selectedResponseId];
    if (!record) {
      setError('編集対象の回答が見つかりません');
      return;
    }

    const availability = normalizeAvailabilitySlots(responseEditValues?.availability);
    if (availability.length === 0) {
      setError('参加可能日時は一つ以上選択してください');
      return;
    }

    try {
      setEditingResponseLoading(true);
      setError('');
      const token = await user.getIdToken();

      const answers: FormAnswer[] = currentForm.fields.map((field) => {
        const value = responseEditValues[field.fieldId];
        return {
          fieldId: field.fieldId,
          value: value ?? (field.type === 'checkbox' ? [] : ''),
        };
      });

      const res = await fetch(`/api/forms/${selectedForm}/responses/${selectedResponseId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          answers,
          participantData: {
            name: String(responseEditValues?.participantName || ''),
            grade: String(responseEditValues?.participantGrade || ''),
            section: String(responseEditValues?.participantSection || ''),
            availableSlots: availability,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '回答の更新に失敗しました');

      await loadParticipants(selectedForm);
      setShowResponseEditModal(false);
      setSelectedResponseId('');
      setSelectedParticipant(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '回答の更新に失敗しました';
      setError(msg);
    } finally {
      setEditingResponseLoading(false);
    }
  };

  const renderResponseEditField = (field: FormField) => {
    const fieldId = field.fieldId;
    const isAvailabilityField = fieldId === 'availability';
    const label = `${field.label}${field.required ? ' *' : ''}`;
    const optionLabel = (option: string) =>
      isAvailabilityField ? formatAvailabilitySlotLabel(option) : option;
    const value = responseEditValues[fieldId];

    if (isAvailabilityField && field.type === 'checkbox') {
      const selectedValues = normalizeAvailabilitySlots(value);
      const options = field.options || [];
      const specialOptions = options.filter(
        (option) => option === UNAVAILABLE_SLOT_KEY || option === ALL_AVAILABLE_SLOT_KEY,
      );
      const dateOptions = options.filter(
        (option) => option !== UNAVAILABLE_SLOT_KEY && option !== ALL_AVAILABLE_SLOT_KEY,
      );

      return (
        <div key={fieldId} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              {specialOptions.length > 0 && (
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {specialOptions.map((option, index) => {
                    const selected = selectedValues.includes(option);
                    return (
                      <label
                        key={`${option}-${index}`}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all ${
                          selected
                            ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                            : 'border-gray-200 bg-white hover:border-indigo-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => updateAvailabilityField(fieldId, option, options)}
                          className="sr-only"
                        />
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                            selected
                              ? 'border-indigo-600 bg-indigo-600 text-white'
                              : 'border-gray-300 bg-white text-transparent'
                          }`}
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M16.704 5.29a1 1 0 0 1 0 1.414l-7.25 7.25a1 1 0 0 1-1.414 0l-3.25-3.25a1 1 0 1 1 1.414-1.414l2.543 2.543 6.543-6.543a1 1 0 0 1 1.414 0Z" />
                          </svg>
                        </span>
                        <span>
                          <span className="block text-sm font-medium text-gray-900">
                            {optionLabel(option)}
                          </span>
                          <span className="mt-1 block text-xs text-gray-500">
                            {option === ALL_AVAILABLE_SLOT_KEY
                              ? '配布期間内の全日時に対応可能です'
                              : 'この日時には参加できません'}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {dateOptions.map((option, index) => {
                  const selected = selectedValues.includes(option);
                  return (
                    <label
                      key={`${option}-${index}`}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all ${
                        selected
                          ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                          : 'border-gray-200 bg-white hover:border-indigo-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => updateAvailabilityField(fieldId, option, options)}
                        className="sr-only"
                      />
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                          selected
                            ? 'border-indigo-600 bg-indigo-600 text-white'
                            : 'border-gray-300 bg-white text-transparent'
                        }`}
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M16.704 5.29a1 1 0 0 1 0 1.414l-7.25 7.25a1 1 0 0 1-1.414 0l-3.25-3.25a1 1 0 1 1 1.414-1.414l2.543 2.543 6.543-6.543a1 1 0 0 1 1.414 0Z" />
                        </svg>
                      </span>
                      <span>
                        <span className="block text-sm font-medium text-gray-900">
                          {optionLabel(option)}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (field.type === 'select' || field.type === 'radio') {
      return (
        <div key={fieldId}>
          <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
          <select
            value={typeof value === 'string' ? value : ''}
            onChange={(e) =>
              setResponseEditValues((current) => ({ ...current, [fieldId]: e.target.value }))
            }
            className="block w-full rounded-md border border-gray-300 px-3 py-2"
          >
            <option value="">選択してください</option>
            {field.options?.map((option) => (
              <option key={option} value={option}>
                {optionLabel(option)}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (field.type === 'checkbox') {
      const selectedValues = Array.isArray(value) ? value : [];
      return (
        <div key={fieldId}>
          <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {field.options?.map((option) => {
              const selected = selectedValues.includes(option);
              return (
                <label
                  key={option}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${
                    selected
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 bg-white hover:border-indigo-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => {
                      setResponseEditValues((current) => {
                        const currentValues = Array.isArray(current[fieldId])
                          ? (current[fieldId] as string[])
                          : [];
                        const nextValues = currentValues.includes(option)
                          ? currentValues.filter((item) => item !== option)
                          : [...currentValues, option];
                        return { ...current, [fieldId]: nextValues };
                      });
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">{optionLabel(option)}</span>
                </label>
              );
            })}
          </div>
        </div>
      );
    }

    if (field.type === 'number') {
      return (
        <div key={fieldId}>
          <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
          <input
            type="number"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) =>
              setResponseEditValues((current) => ({ ...current, [fieldId]: e.target.value }))
            }
            className="block w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </div>
      );
    }

    return (
      <div key={fieldId}>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder}
          onChange={(e) =>
            setResponseEditValues((current) => ({ ...current, [fieldId]: e.target.value }))
          }
          className="block w-full rounded-md border border-gray-300 px-3 py-2"
        />
      </div>
    );
  };

  const loadTeams = async () => {
    if (!resolvedParams || !user) return;

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/teams?year=${resolvedParams.year}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data: { teams: Team[] } = await res.json();
        setTeams(
          (data.teams || [])
            .slice()
            .sort((a, b) => compareAvailabilitySlotKeys(a.timeSlot || '', b.timeSlot || '')),
        );
      }
    } catch (err) {
      console.error('チーム取得エラー:', err);
    }
  };

  const loadAreas = async () => {
    if (!resolvedParams || !user) return;

    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/areas', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data: { areas: Area[] } = await res.json();
        setAreas(data.areas || []);
      }
    } catch (err) {
      console.error('配布区域取得エラー:', err);
    }
  };

  const getAreaLabel = (area?: Area | null) => {
    if (!area) return '-';
    return `${area.areaName}（${area.areaCode}）`;
  };

  const getTeamAreaLabel = (team?: Team | null) => {
    if (!team) return '-';
    const matched = areas.find(
      (area) => area.areaId === team.areaId || area.areaCode === team.assignedArea,
    );
    if (matched) return getAreaLabel(matched);
    return team.assignedArea || '-';
  };

  const resolveAssignmentSlot = (team: Team | null | undefined) => {
    if (!team) return '';
    return team.timeSlot || '';
  };

  const createTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvedParams || !user) return;
    if (
      !createTeamForm.teamCode ||
      !createTeamForm.teamName ||
      !createTeamForm.areaId ||
      !createTeamForm.timeSlot
    ) {
      setError('チームコード、チーム名、配布区域、配布枠は必須です');
      return;
    }

    try {
      setCreateTeamSubmitting(true);
      setError('');
      const token = await user.getIdToken();
      const selectedArea = areas.find((area) => area.areaId === createTeamForm.areaId);
      const res = await fetch('/api/admin/teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          teamCode: createTeamForm.teamCode,
          teamName: createTeamForm.teamName,
          timeSlot: createTeamForm.timeSlot,
          areaId: createTeamForm.areaId,
          assignedArea: selectedArea?.areaCode || '',
          eventId: distributionEventId || `kodai${resolvedParams.year}`,
          year: Number(resolvedParams.year),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'チームの作成に失敗しました');

      await loadTeams();
      clearDashboardCache(Number(resolvedParams.year));
      setCreateTeamForm({
        teamCode: '',
        teamName: '',
        areaId: '',
        timeSlot: distributionSlots[0] || '',
      });
      setShowCreateTeamForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'チームの作成に失敗しました');
    } finally {
      setCreateTeamSubmitting(false);
    }
  };

  const loadParticipants = async (formId: string) => {
    if (!resolvedParams || !user || !formId) return;

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/forms/${formId}/responses`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        const recordMap: Record<string, ResponseRecord> = {};
        const participantList = data.responses.map(
          (response: {
            responseId: string;
            participantData?: {
              name: string;
              grade: number;
              section: string;
              availableSlots?: string[];
            };
            answers?: Array<{ fieldId: string; value: string | string[] }>;
            submittedAt: string | Date;
          }) => {
            recordMap[response.responseId] = {
              responseId: response.responseId,
              participantData: response.participantData,
              answers: (response.answers || []) as FormAnswer[],
              submittedAt: response.submittedAt,
            };
            const raw = response.answers?.find((a) => a.fieldId === 'availability')?.value;
            const availableSlots = normalizeAvailabilitySlots(
              Array.isArray(raw)
                ? raw
                : typeof raw === 'string'
                  ? [raw]
                  : response.participantData?.availableSlots || [],
            );

            return {
              responseId: response.responseId,
              name: response.participantData?.name || '',
              grade: normalizeGrade(response.participantData?.grade),
              section: response.participantData?.section || '',
              availableSlots,
              submittedAt: new Date(response.submittedAt),
            };
          },
        );
        setResponseRecords(recordMap);
        setParticipants(
          participantList.filter(
            (participant: Participant) => participant.availableSlots.length > 0,
          ),
        );
      }
    } catch (err) {
      setError('参加者データの取得に失敗しました');
      console.error(err);
    }
  };

  const loadAssignments = async () => {
    if (!resolvedParams || !user) return;

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/assignments?year=${resolvedParams.year}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setAssignments(data.assignments || []);
      }
    } catch (err) {
      console.error('割り当て取得エラー:', err);
    }
  };

  const performAutoAssignment = async () => {
    const year = resolvedParams?.year;
    if (!year) return;

    if (!selectedForm || participants.length === 0 || teams.length === 0) {
      setError('フォーム、参加者、チームデータが必要です');
      return;
    }

    try {
      if (!user) {
        setError('認証が必要です');
        return;
      }
      const token = await user.getIdToken();

      const res = await fetch('/api/admin/assignments/auto', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          year: resolvedParams?.year,
          formId: selectedForm,
          participants,
          teams,
        }),
      });

      if (res.ok) {
        const data = await res.json();

        setAssignments(data.assignments || []);
        setLastAutoAssignmentStats(data.stats || null);
        await loadAssignments();
        clearDashboardCache(Number(year));
        if ((data?.stats?.assigned || 0) === 0) {
          setError(
            '自動割り当ては完了しましたが、割り当て可能な組み合わせがありませんでした。配布枠とチームの配布枠キーが一致しているか確認してください。',
          );
        }
        if ((data?.stats?.assigned || 0) > 0) {
          setError('');
        }
      } else {
        const errorData = await res.json();
        setError(errorData.error || '自動割り当てに失敗しました');
      }
    } catch (err) {
      setError('自動割り当てに失敗しました');
      console.error(err);
    }
  };

  const clearAssignments = async () => {
    const year = resolvedParams?.year;
    if (!year) return;
    if (!selectedForm || !user) return;

    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/assignments', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          year,
          formId: selectedForm,
        }),
      });

      if (res.ok) {
        setAssignments([]);
        clearDashboardCache(Number(year));
        setError('');
      } else {
        const errorData = await res.json();
        setError(errorData.error || '割り当てのクリアに失敗しました');
      }
    } catch (err) {
      setError('割り当てのクリアに失敗しました');
      console.error(err);
    }
  };

  const getAssignmentForParticipant = (responseId: string) => {
    return assignments.find((a) => a.responseId === responseId);
  };

  const getTeamById = (teamId: string) => {
    return teams.find((t) => t.teamId === teamId);
  };

  const getAssignmentStats = () => {
    const assigned = participants.filter((p) => getAssignmentForParticipant(p.responseId));
    const assignableParticipants = participants.filter((p) => {
      const normalized = normalizeAvailabilitySlots(p.availableSlots);
      return normalized.length > 0 && !normalized.includes(UNAVAILABLE_SLOT_KEY);
    });
    const unassigned = assignableParticipants.filter(
      (p) => !getAssignmentForParticipant(p.responseId),
    );

    return {
      total: participants.length,
      assigned: assigned.length,
      unassigned: unassigned.length,
    };
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <LoadingInline size="lg" />
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const stats = getAssignmentStats();
  const unavailableParticipants = participants.filter((p) => {
    const normalized = normalizeAvailabilitySlots(p.availableSlots);
    return normalized.length === 0 || normalized.includes(UNAVAILABLE_SLOT_KEY);
  });
  const unavailableCount = unavailableParticipants.length;
  const availableParticipants = participants.filter((p) => {
    const normalized = normalizeAvailabilitySlots(p.availableSlots);
    return normalized.length > 0 && !normalized.includes(UNAVAILABLE_SLOT_KEY);
  });
  const matchingTeams = [...teams]
    .filter((team) => distributionSlots.includes(team.timeSlot))
    .sort((a, b) => compareAvailabilitySlotKeys(a.timeSlot || '', b.timeSlot || ''));
  const participantsWithAllAvailable = participants.filter((p) =>
    normalizeAvailabilitySlots(p.availableSlots).includes(ALL_AVAILABLE_SLOT_KEY),
  );
  const filteredParticipants = participants.filter((p) => {
    const normalized = normalizeAvailabilitySlots(p.availableSlots);
    if (normalized.length === 0 || normalized.includes(UNAVAILABLE_SLOT_KEY)) return false;
    if (!selectedTeamFilter) return true;
    const a = getAssignmentForParticipant(p.responseId);
    return a?.teamId === selectedTeamFilter;
  });
  const collator = new Intl.Collator('ja');
  const sortedParticipants = [...filteredParticipants].sort((a, b) => {
    const aGrade = normalizeGrade(a.grade);
    const bGrade = normalizeGrade(b.grade);
    if (bGrade !== aGrade) return bGrade - aGrade;
    const an = a.name || '';
    const bn = b.name || '';
    return collator.compare(an, bn);
  });

  const exportAssignmentsCsv = () => {
    if (assignments.length === 0) {
      setError('出力できる割り当てがありません');
      return;
    }
    const collator = new Intl.Collator('ja');
    const rows = assignments
      .map((a) => {
        const p = participants.find((p) => p.responseId === a.responseId);
        const t = teams.find((t) => t.teamId === a.teamId);
        if (!p || !t) return null;
        const teamLabel = t.teamName || t.assignedArea || t.teamId;
        return {
          team: teamLabel,
          grade: normalizeGrade(p.grade),
          name: p.name || '',
        };
      })
      .filter(Boolean) as Array<{ team: string; grade: number; name: string }>;

    const sorted = rows.sort((a, b) => {
      const tc = collator.compare(a.team, b.team);
      if (tc !== 0) return tc;
      if (b.grade !== a.grade) return b.grade - a.grade;
      return collator.compare(a.name, b.name);
    });

    const header = ['チーム', '学年', '氏名'];
    const data = sorted.map((r) => [r.team, r.grade ? `${r.grade}` : '', r.name]);
    downloadCsvFile(
      `チーム割り当て_${resolvedParams?.year || ''}.csv`,
      buildCsvContent([header, ...data]),
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <YearPageSectionHeader
          title={`チーム割り当て管理 (${resolvedParams?.year}年度)`}
          description="アンケート結果を基に参加者を配布区域チームに割り当てます。"
        />

        {/* エラー表示 */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* チーム作成 */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-medium text-gray-900">チーム作成</h2>
              <p className="text-sm text-gray-500">
                配布区域を選んで、その区域へ配布するチームを作成します。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateTeamForm((prev) => !prev)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              {showCreateTeamForm ? 'フォームを閉じる' : 'チームを作成'}
            </button>
          </div>

          {showCreateTeamForm && (
            <form onSubmit={createTeam} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  チームコード *
                </label>
                <input
                  value={createTeamForm.teamCode}
                  onChange={(e) =>
                    setCreateTeamForm({ ...createTeamForm, teamCode: e.target.value })
                  }
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="A-01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">チーム名 *</label>
                <input
                  value={createTeamForm.teamName}
                  onChange={(e) =>
                    setCreateTeamForm({ ...createTeamForm, teamName: e.target.value })
                  }
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="本館前A班"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">配布区域 *</label>
                <select
                  value={createTeamForm.areaId}
                  onChange={(e) => setCreateTeamForm({ ...createTeamForm, areaId: e.target.value })}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">配布区域を選択</option>
                  {areas.map((area) => (
                    <option key={area.areaId} value={area.areaId}>
                      {getAreaLabel(area)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">配布枠</label>
                <select
                  value={createTeamForm.timeSlot}
                  onChange={(e) =>
                    setCreateTeamForm({ ...createTeamForm, timeSlot: e.target.value })
                  }
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md"
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
              <div className="md:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={createTeamSubmitting || areas.length === 0}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                >
                  {createTeamSubmitting ? '作成中...' : 'チームを作成'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* 設定セクション */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">割り当て設定</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-700 mb-1">対象フォーム</p>
              <p className="text-sm text-gray-900">{selectedFormTitle || 'フォームが未設定です'}</p>
            </div>
          </div>

          {/* 自動割り当て実行ボタン */}
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={performAutoAssignment}
              disabled={!selectedForm || participants.length === 0 || teams.length === 0}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              自動割り当てを実行
            </button>

            {assignments.length > 0 && (
              <button
                onClick={clearAssignments}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                割り当てをクリア
              </button>
            )}
          </div>
        </div>

        {/* 統計情報 */}
        {participants.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <MetricCard
              label="総参加者数"
              value={`${stats.total}人`}
              icon={
                <svg
                  className="h-6 w-6 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              }
            />
            <MetricCard
              label="割り当て済み"
              value={`${stats.assigned}人`}
              icon={
                <svg
                  className="h-6 w-6 text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              }
            />
            <MetricCard
              label="参加不可"
              value={`${unavailableCount}人`}
              icon={
                <svg
                  className="h-6 w-6 text-indigo-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              }
            />
            <MetricCard
              label="未割り当て"
              value={`${stats.unassigned}人`}
              icon={
                <svg
                  className="h-6 w-6 text-yellow-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 17.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              }
            />
          </div>
        )}

        {/* 参加者一覧と割り当て結果 */}
        {participants.length > 0 && (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <div className="px-4 py-5 sm:px-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    参加者一覧と割り当て状況
                  </h3>
                  <p className="mt-1 max-w-2xl text-sm text-gray-500">
                    選択されたフォームの回答者とチーム割り当て状況
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 flex-col">
                    <p className="border-gray-300 rounded-md text-sm text-gray-600">エクスポート</p>
                    <ExportActionButtons onCsvExport={exportAssignmentsCsv} />
                  </div>
                  <div className="flex items-center gap-2 flex-col">
                    <label className="text-sm text-gray-600">班で絞り込み</label>
                    <select
                      value={selectedTeamFilter}
                      onChange={(e) => setSelectedTeamFilter(e.target.value)}
                      className="block w-48 px-3 py-2 border border-gray-300 rounded-md text-sm"
                    >
                      <option value="">全ての班</option>
                      {teams.map((t) => (
                        <option key={t.teamId} value={t.teamId}>
                          {t.teamName || getTeamAreaLabel(t)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      参加者情報
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      希望時間帯
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      回答日時
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      割り当て先
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedParticipants.map((participant) => {
                    const assignment = getAssignmentForParticipant(participant.responseId);
                    const team = assignment ? getTeamById(assignment.teamId) : null;

                    return (
                      <tr key={participant.responseId}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            <div className="font-medium">{participant.name}</div>
                            <div className="text-gray-500">
                              {participant.grade}年 - {participant.section}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {getAvailabilityLabel(participant.availableSlots)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(participant.submittedAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {assignment && team ? (
                            <div className="text-sm">
                              <div className="font-medium text-gray-900">{team.teamName}</div>
                              <div className="text-gray-500">{getTeamAreaLabel(team)}</div>
                              <div className="text-gray-400 text-xs">
                                配布枠: {formatAvailabilitySlotLabel(team.timeSlot)}
                              </div>
                              <div className="flex space-x-2 mt-1">
                                <span
                                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                    assignment.assignedBy === 'auto'
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-green-100 text-green-800'
                                  }`}
                                >
                                  {assignment.assignedBy === 'auto' ? '自動' : '手動'}
                                </span>
                                {assignment.timeSlot && (
                                  <span
                                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                      assignment.timeSlot.endsWith('_am')
                                        ? 'bg-yellow-100 text-yellow-800'
                                        : assignment.timeSlot.endsWith('_pm')
                                          ? 'bg-purple-100 text-purple-800'
                                          : 'bg-gray-100 text-gray-800'
                                    }`}
                                  >
                                    {formatAvailabilitySlotLabel(assignment.timeSlot)}
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                              未割り当て
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => openResponseEditModal(participant)}
                              className="text-emerald-600 hover:text-emerald-900"
                            >
                              回答変更
                            </button>
                            <button
                              onClick={() => {
                                setSelectedParticipant(participant);
                                setShowManualModal(true);
                              }}
                              className="text-indigo-600 hover:text-indigo-900"
                            >
                              割り当て変更
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {selectedForm && unavailableParticipants.length > 0 && (
          <div className="bg-white shadow overflow-hidden sm:rounded-md mt-8">
            <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
              <h3 className="text-lg leading-6 font-medium text-gray-900">参加不可メンバー</h3>
              <p className="mt-1 text-sm text-gray-500">
                参加不可を選んだ回答者を別枠で表示します。手動割り当ては可能です。
              </p>
            </div>
            <div className="divide-y divide-gray-200">
              {unavailableParticipants.map((participant) => {
                const assignment = getAssignmentForParticipant(participant.responseId);
                const team = assignment ? getTeamById(assignment.teamId) : null;

                return (
                  <div
                    key={participant.responseId}
                    className="px-4 py-4 sm:px-6 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">{participant.name}</div>
                      <div className="text-sm text-gray-500">
                        {participant.grade}年 - {participant.section}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {getAvailabilityLabel(participant.availableSlots)}
                      </div>
                      {assignment && team && (
                        <div className="mt-2 text-xs text-gray-500">
                          割り当て先: {team.teamName} /{' '}
                          {formatAvailabilitySlotLabel(assignment.timeSlot)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => openResponseEditModal(participant)}
                        className="text-emerald-600 hover:text-emerald-900 text-sm font-medium"
                      >
                        回答変更
                      </button>
                      <button
                        onClick={() => {
                          setSelectedParticipant(participant);
                          setShowManualModal(true);
                        }}
                        className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                      >
                        割り当て変更
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* フォーム未選択時のメッセージ */}
        {participants.length === 0 && selectedForm === '' && (
          <div className="text-center py-12">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">フォームが未設定です</h3>
            <p className="mt-1 text-sm text-gray-500">
              この年度のフォームが作成されると、自動で読み込まれます。
            </p>
          </div>
        )}

        {/* 手動割り当てモーダル */}
        {showManualModal && selectedParticipant && (
          <Modal
            open
            onClose={() => {
              setShowManualModal(false);
              setSelectedParticipant(null);
            }}
            centered={false}
            panelClassName="max-w-lg"
            contentClassName="px-6 py-6"
          >
            <div className="relative top-0 mx-auto w-full">
              <div className="mt-3">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">手動割り当て変更</h3>
                  <button
                    onClick={() => {
                      setShowManualModal(false);
                      setSelectedParticipant(null);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                <div className="mb-4">
                  <div className="font-medium text-gray-900">{selectedParticipant.name}</div>
                  <div className="text-sm text-gray-500">
                    {selectedParticipant.grade}年 - {selectedParticipant.section}
                  </div>
                  <div className="text-sm text-gray-500">
                    希望時間帯: {getAvailabilityLabel(selectedParticipant.availableSlots)}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      割り当て先チーム
                    </label>
                    <select
                      value={manualAssignTeamId}
                      onChange={(e) => setManualAssignTeamId(e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="">チームを選択</option>
                      {teams.map((team) => (
                        <option key={team.teamId} value={team.teamId}>
                          {team.teamName} - {getTeamAreaLabel(team)} /{' '}
                          {formatAvailabilitySlotLabel(team.timeSlot)} (最大{team.maxMembers || 10}
                          人)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    onClick={() => {
                      setShowManualModal(false);
                      setSelectedParticipant(null);
                      setManualAssignTeamId('');
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    キャンセル
                  </button>
                  <button
                    disabled={manualAssignLoading || !manualAssignTeamId || !selectedParticipant}
                    onClick={async () => {
                      if (!selectedParticipant || !manualAssignTeamId) return;
                      try {
                        setManualAssignLoading(true);
                        const token = await user!.getIdToken();
                        // 時間帯の自動決定
                        const team = teams.find((t) => t.teamId === manualAssignTeamId);
                        const ts = resolveAssignmentSlot(team);
                        if (!ts) {
                          throw new Error('選択されたチームに対応する参加可能時間が見つかりません');
                        }
                        const res = await fetch('/api/admin/assignments', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`,
                          },
                          body: JSON.stringify({
                            year: resolvedParams?.year,
                            formId: selectedForm,
                            responseId: selectedParticipant.responseId,
                            teamId: manualAssignTeamId,
                            timeSlot: ts,
                          }),
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || '更新に失敗しました');
                        // 再読込
                        await loadAssignments();
                        setShowManualModal(false);
                        setSelectedParticipant(null);
                        setManualAssignTeamId('');
                      } catch (e: unknown) {
                        const msg = e instanceof Error ? e.message : '更新に失敗しました';
                        setError(msg);
                      } finally {
                        setManualAssignLoading(false);
                      }
                    }}
                    className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {manualAssignLoading ? '保存中...' : '割り当てを保存'}
                  </button>
                </div>
              </div>
            </div>
          </Modal>
        )}

        {showResponseEditModal && selectedParticipant && (
          <Modal
            open
            onClose={() => {
              setShowResponseEditModal(false);
              setSelectedResponseId('');
              setSelectedParticipant(null);
            }}
            centered={false}
            panelClassName="max-w-3xl"
            contentClassName="px-4 pb-10"
          >
            <div className="mx-auto mt-10 w-full">
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">回答を編集</h3>
                  <p className="text-sm text-gray-500">後から連絡があった場合の修正に使います。</p>
                </div>
                <button
                  onClick={() => {
                    setShowResponseEditModal(false);
                    setSelectedResponseId('');
                    setSelectedParticipant(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <div className="space-y-6 px-6 py-6">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="text-sm font-medium text-gray-900">
                    {selectedParticipant.name}
                  </div>
                  <div className="text-sm text-gray-500">
                    {selectedParticipant.grade}年 - {selectedParticipant.section}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    現在の希望時間帯: {getAvailabilityLabel(selectedParticipant.availableSlots)}
                  </div>
                </div>

                {!currentForm ? (
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
                    フォーム情報が読み込まれていません。
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          お名前 *
                        </label>
                        <input
                          value={String(responseEditValues?.participantName || '')}
                          onChange={(e) =>
                            setResponseEditValues((current) => ({
                              ...current,
                              participantName: e.target.value,
                            }))
                          }
                          className="block w-full rounded-md border border-gray-300 px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          学年 *
                        </label>
                        <select
                          value={String(responseEditValues?.participantGrade || '')}
                          onChange={(e) =>
                            setResponseEditValues((current) => ({
                              ...current,
                              participantGrade: e.target.value,
                            }))
                          }
                          className="block w-full rounded-md border border-gray-300 px-3 py-2"
                        >
                          <option value="">選択してください</option>
                          <option value="1">1年生</option>
                          <option value="2">2年生</option>
                          <option value="3">3年生</option>
                          <option value="4">4年生</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          所属セクション *
                        </label>
                        <input
                          value={String(responseEditValues?.participantSection || '')}
                          onChange={(e) =>
                            setResponseEditValues((current) => ({
                              ...current,
                              participantSection: e.target.value,
                            }))
                          }
                          className="block w-full rounded-md border border-gray-300 px-3 py-2"
                        />
                      </div>
                    </div>

                    {filterVisibleFormFieldsForParticipant(
                      currentForm.fields,
                      normalizeGrade(responseEditValues?.participantGrade),
                      responseEditValues?.availability,
                    )
                      .slice()
                      .sort((a, b) => a.order - b.order)
                      .map((field) => renderResponseEditField(field))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
                <button
                  onClick={() => {
                    setShowResponseEditModal(false);
                    setSelectedResponseId('');
                    setSelectedParticipant(null);
                  }}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  onClick={saveResponseEdit}
                  disabled={editingResponseLoading || !currentForm}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {editingResponseLoading ? '保存中...' : '回答を保存'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}
