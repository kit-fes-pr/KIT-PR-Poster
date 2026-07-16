'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import YearPageSectionHeader from '@/components/admin/YearPageSectionHeader';
import { LoadingInline } from '@/components/ui/Loading';
import { ResponseEditModal } from '@/components/forms/ResponseEditModal';
import { FormOverviewTab } from '@/components/forms/FormOverviewTab';
import { FormContentTab } from '@/components/forms/FormContentTab';
import { SurveyFieldBlock } from '@/components/forms/SurveyFieldBlock';
import { formatDate, formatDateOnly } from '@/lib/utils/dateUtils';
import {
  buildAvailabilitySlotChoices,
  formatAvailabilitySlotLabel,
  SPECIAL_AVAILABILITY_SLOT_CHOICES,
  normalizeAvailabilitySlots,
  toggleAvailabilitySelection,
  UNAVAILABLE_SLOT_KEY,
  ALL_AVAILABLE_SLOT_KEY,
} from '@/lib/utils/availability/availability';
import { normalizeGrade } from '@/lib/utils/grade/grade';
import {
  filterEditableFormFieldsForParticipant,
  filterVisibleFormFieldsForParticipant,
} from '@/lib/utils/forms/forms';
import { FormField, FormResponse, ParticipantSurveyResponse, SurveyForm } from '@/types/forms';
import type { AvailabilitySlotChoice } from '@/lib/utils/availability/availability';
import { useRequireAdmin } from '@/lib/hooks/useRequireAdmin';

type AdminTab = 'content' | 'overview';

type FormRecord = SurveyForm & {
  isNew?: boolean; // Keep it if defined in forms.ts, or check
  responseCount: number;
  lastResponseAt?: string | Date;
};

type EventSummary = {
  distributionStartDate?: string | Date;
  distributionEndDate?: string | Date;
  distributionAvailabilitySlots?: string[];
  eventName?: string;
};

const DEFAULT_TITLE = '学外配布参加可否登録';
const DEFAULT_DESCRIPTION = '⚪︎月⚪︎日に実施する学外配布への参加可能日時を選択をお願いします。';

function toDateDisplay(value: Parameters<typeof formatDateOnly>[0]): string {
  return formatDateOnly(value);
}

function buildAvailabilityChoices(
  eventData: EventSummary | null,
  form: FormRecord | null,
): AvailabilitySlotChoice[] {
  if (eventData?.distributionStartDate && eventData?.distributionEndDate) {
    const allChoices = buildAvailabilitySlotChoices(
      eventData.distributionStartDate,
      eventData.distributionEndDate,
    );
    const selectedKeys =
      Array.isArray(eventData.distributionAvailabilitySlots) &&
      eventData.distributionAvailabilitySlots.length > 0
        ? eventData.distributionAvailabilitySlots
        : allChoices.map((choice) => choice.key);
    return [
      ...allChoices.filter((choice) => selectedKeys.includes(choice.key)),
      ...SPECIAL_AVAILABILITY_SLOT_CHOICES,
    ];
  }

  const existingOptions =
    form?.fields.find((field) => field.fieldId === 'availability')?.options || [];
  return existingOptions.map((option) => ({
    key: option as AvailabilitySlotChoice['key'],
    label: formatAvailabilitySlotLabel(option),
    period: 'special' as const,
  }));
}

function buildFixedFields(availabilityOptions: string[]): FormField[] {
  return [
    {
      fieldId: 'availability',
      type: 'checkbox',
      label: '参加可能日時（複数選択）',
      placeholder: '参加可能な日時を選択してください',
      required: true,
      options: availabilityOptions,
      order: 0,
    },
    {
      fieldId: 'carUsage',
      type: 'radio',
      label: '車の運転ができますか',
      placeholder: '車の運転可否を選択してください',
      required: true,
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
  ];
}

function buildPreviewValues(fields: FormField[]): Record<string, string | string[]> {
  return fields.reduce<Record<string, string | string[]>>((acc, field) => {
    acc[field.fieldId] = field.type === 'checkbox' ? [] : '';
    return acc;
  }, {});
}

function isAvailabilityField(field: FormField): boolean {
  return field.fieldId === 'availability';
}

export default function FormDashboardPage({ params }: { params: Promise<{ year: string }> }) {
  const router = useRouter();
  const [resolvedParams, setResolvedParams] = useState<{ year: string } | null>(null);
  const { user, loading: authLoading } = useRequireAdmin();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [eventData, setEventData] = useState<EventSummary | null>(null);
  const [forms, setForms] = useState<FormRecord[]>([]);
  const [responses, setResponses] = useState<(FormResponse | ParticipantSurveyResponse)[]>([]);
  const [activeTab, setActiveTab] = useState<AdminTab>('content');
  const [draftTitle, setDraftTitle] = useState(DEFAULT_TITLE);
  const [draftDescription, setDraftDescription] = useState(DEFAULT_DESCRIPTION);
  const [draftIsActive, setDraftIsActive] = useState(true);
  const [carUsageVisibleFromGrade, setCarUsageVisibleFromGrade] = useState('1');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [isDirty, setIsDirty] = useState(false);
  const [editingResponse, setEditingResponse] = useState<
    (FormResponse | ParticipantSurveyResponse) | null
  >(null);
  const [editFormData, setEditFormData] = useState<{ [key: string]: string | string[] }>({});
  const [editSaving, setEditSaving] = useState(false);
  const hasLoadedFormRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedSnapshotRef = useRef('');
  const responsesCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    params.then(setResolvedParams);
  }, [params]);

  const currentForm = forms[0] ?? null;
  const allAvailabilityChoices = useMemo(
    () => buildAvailabilityChoices(eventData, currentForm),
    [eventData, currentForm],
  );
  const availabilityChoiceKeys = useMemo(
    () => allAvailabilityChoices.map((choice) => choice.key),
    [allAvailabilityChoices],
  );
  const fixedFields = useMemo(
    () => buildFixedFields(availabilityChoiceKeys),
    [availabilityChoiceKeys],
  );
  const [previewValues, setPreviewValues] = useState<Record<string, string | string[]>>(() =>
    buildPreviewValues(fixedFields),
  );
  const visiblePreviewFields = useMemo(
    () =>
      fixedFields.filter(
        (field) => field.fieldId !== 'carUsage' || carUsageVisibleFromGrade !== '0',
      ),
    [carUsageVisibleFromGrade, fixedFields],
  );
  const latestResponse = useMemo(
    () =>
      [...responses].sort(
        (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
      )[0] || null,
    [responses],
  );
  const sortedResponses = useMemo(
    () =>
      [...responses].sort(
        (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
      ),
    [responses],
  );
  const draftSnapshot = useMemo(
    () =>
      JSON.stringify({
        title: draftTitle.trim(),
        description: draftDescription.trim(),
        isActive: draftIsActive,
        carUsageVisibleFromGrade,
      }),
    [carUsageVisibleFromGrade, draftDescription, draftIsActive, draftTitle],
  );
  useEffect(() => {
    if (loading || hasLoadedFormRef.current) {
      return;
    }

    if (currentForm) {
      const carUsageField = currentForm.fields.find((field) => field.fieldId === 'carUsage');
      const nextCarUsageVisibleFromGrade =
        carUsageField?.visibleFromGrade === undefined
          ? '1'
          : String(normalizeGrade(carUsageField.visibleFromGrade));

      savedSnapshotRef.current = JSON.stringify({
        title: currentForm.title,
        description: currentForm.description || '',
        isActive: currentForm.isActive,
        carUsageVisibleFromGrade: nextCarUsageVisibleFromGrade,
      });
      setSaveStatus('saved');

      setDraftTitle(currentForm.title);
      setDraftDescription(currentForm.description || '');
      setDraftIsActive(currentForm.isActive);
      setCarUsageVisibleFromGrade(nextCarUsageVisibleFromGrade);
    } else {
      savedSnapshotRef.current = '';
      setSaveStatus('saved');
      setDraftTitle(DEFAULT_TITLE);
      setDraftDescription(DEFAULT_DESCRIPTION);
      setDraftIsActive(true);
      setCarUsageVisibleFromGrade('1');
      setIsDirty(false);
    }
    setIsDirty(false);
    hasLoadedFormRef.current = true;
  }, [currentForm, loading]);

  useEffect(() => {
    setPreviewValues(buildPreviewValues(fixedFields));
  }, [fixedFields]);

  const handleDraftTitleChange = (value: string) => {
    setDraftTitle(value);
    setIsDirty(true);
  };

  const handleDraftDescriptionChange = (value: string) => {
    setDraftDescription(value);
    setIsDirty(true);
  };

  const handleCarUsageVisibleFromGradeChange = (value: string) => {
    setCarUsageVisibleFromGrade(value);
    setIsDirty(true);
  };

  const handleDraftIsActiveChange = (value: boolean) => {
    setDraftIsActive(value);
    setIsDirty(true);
  };

  const loadDashboard = async () => {
    if (!resolvedParams || !user) return;

    try {
      setLoading(true);
      setError('');

      const token = await user.getIdToken();
      const eventId = `kodai${resolvedParams.year}`;

      const [formsRes, eventRes] = await Promise.all([
        fetch(`/api/forms?eventId=${eventId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
        fetch(`/api/admin/events?year=${resolvedParams.year}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
      ]);

      const formsData = await formsRes.json().catch(() => null);
      const eventJson = await eventRes.json().catch(() => null);

      if (!formsRes.ok) {
        setForms([]);
        setResponses([]);
        setError(formsData?.error || 'フォーム情報の取得に失敗しました');
        return;
      }

      if (eventRes.ok && Array.isArray(eventJson?.data) && eventJson.data.length > 0) {
        setEventData(eventJson.data[0]);
      } else {
        setEventData(null);
      }

      const loadedForms = (formsData?.forms || []) as FormRecord[];
      setForms(loadedForms);

      const nextForm = loadedForms[0] ?? null;
      if (!nextForm) {
        setResponses([]);
        return;
      }

      const responsesRes = await fetch(`/api/forms/${nextForm.formId}/responses`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const responsesData = await responsesRes.json().catch(() => null);

      if (responsesRes.ok) {
        setResponses(
          (responsesData?.responses || []) as (FormResponse | ParticipantSurveyResponse)[],
        );
      } else {
        setResponses([]);
        setError(responsesData?.error || '回答情報の取得に失敗しました');
      }
    } catch (err) {
      console.error(err);
      setError('フォーム管理画面の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!resolvedParams || !user || authLoading) return;
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedParams, user, authLoading]);

  const createForm = async () => {
    if (!resolvedParams || !user) return;

    try {
      setSaving(true);
      setError('');

      if (!draftTitle.trim()) {
        setError('フォームタイトルを入力してください');
        return;
      }

      if (!eventData?.distributionStartDate || !eventData?.distributionEndDate) {
        setError('配布期間が取得できないため、フォームを作成できません');
        return;
      }

      const availabilityOptions = availabilityChoiceKeys;
      if (availabilityOptions.length === 0) {
        setError('参加可能日時を一つ以上選択してください');
        return;
      }

      const visibleFromGrade = Math.min(
        4,
        Math.max(0, Number.parseInt(carUsageVisibleFromGrade, 10) || 0),
      );

      const token = await user.getIdToken();
      const res = await fetch('/api/forms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: draftTitle.trim(),
          description: draftDescription.trim(),
          fields: buildFixedFields(availabilityOptions).map((field) =>
            field.fieldId === 'carUsage' ? { ...field, visibleFromGrade } : field,
          ),
          eventId: `kodai${resolvedParams.year}`,
          year: Number(resolvedParams.year),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error || 'フォームの作成に失敗しました');
        return;
      }

      setForms([data.form as FormRecord]);
      setResponses([]);
      setActiveTab('content');
      setIsDirty(false);
      setSaveStatus('saved');
    } catch (err) {
      console.error(err);
      setError('フォームの作成に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const persistFormSettings = useCallback(
    async (silent = false) => {
      if (!resolvedParams || !user || !currentForm) return;

      const snapshotAtRequest = draftSnapshot;

      try {
        setSaving(true);
        if (!silent) {
          setError('');
        }
        setSaveStatus('saving');

        if (!draftTitle.trim()) {
          setError('フォームタイトルを入力してください');
          return;
        }

        const availabilityOptions = allAvailabilityChoices.map((choice) => choice.key);
        if (availabilityOptions.length === 0) {
          setError('参加可能日時を一つ以上選択してください');
          return;
        }

        const visibleFromGrade = Math.min(
          4,
          Math.max(0, Number.parseInt(carUsageVisibleFromGrade, 10) || 0),
        );

        const token = await user.getIdToken();
        const res = await fetch(`/api/forms/${currentForm.formId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: draftTitle.trim(),
            description: draftDescription.trim(),
            isActive: draftIsActive,
            fields: buildFixedFields(availabilityOptions).map((field) =>
              field.fieldId === 'carUsage' ? { ...field, visibleFromGrade } : field,
            ),
          }),
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          setError(data?.error || 'フォームの更新に失敗しました');
          setSaveStatus('error');
          return;
        }

        const nextForm = data.form as FormRecord;
        const nextCarUsageField = nextForm.fields.find((field) => field.fieldId === 'carUsage');
        setForms([nextForm]);
        setSaveStatus('saved');
        savedSnapshotRef.current = JSON.stringify({
          title: nextForm.title,
          description: nextForm.description || '',
          isActive: nextForm.isActive,
          carUsageVisibleFromGrade:
            nextCarUsageField?.visibleFromGrade === undefined
              ? '1'
              : String(normalizeGrade(nextCarUsageField.visibleFromGrade)),
        });
        if (draftSnapshot === snapshotAtRequest) {
          setIsDirty(false);
        }
      } catch (err) {
        console.error(err);
        setError('フォームの更新に失敗しました');
        setSaveStatus('error');
      } finally {
        setSaving(false);
      }
    },
    [
      allAvailabilityChoices,
      carUsageVisibleFromGrade,
      currentForm,
      draftDescription,
      draftIsActive,
      draftTitle,
      draftSnapshot,
      resolvedParams,
      user,
    ],
  );

  useEffect(() => {
    if (!currentForm || !hasLoadedFormRef.current) return;
    if (!isDirty) return;
    if (saving) return;
    if (draftSnapshot === savedSnapshotRef.current) return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      void persistFormSettings(true);
    }, 700);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [
    carUsageVisibleFromGrade,
    currentForm,
    draftDescription,
    draftIsActive,
    draftTitle,
    isDirty,
    draftSnapshot,
    persistFormSettings,
    saving,
  ]);

  const openEditModal = (response: FormResponse | ParticipantSurveyResponse) => {
    setEditingResponse(response);

    const participantResponse = response as ParticipantSurveyResponse;
    const formData: { [key: string]: string | string[] } = {
      participantName: participantResponse.participantData?.name || '',
      participantNameKana: participantResponse.participantData?.nameKana || '',
      participantGrade: participantResponse.participantData?.grade?.toString() || '',
      participantSection: participantResponse.participantData?.section || '',
    };

    response.answers.forEach((answer) => {
      formData[answer.fieldId] = answer.value;
    });

    if (participantResponse.participantData?.availableSlots) {
      formData.availability = participantResponse.participantData.availableSlots;
    }

    setEditFormData(formData);
  };

  const closeEditModal = () => {
    setEditingResponse(null);
    setEditFormData({});
    setEditSaving(false);
  };

  const updateResponse = async () => {
    if (!editingResponse || !currentForm || !resolvedParams || !user) return;

    try {
      setEditSaving(true);
      setError('');

      const token = await user.getIdToken();
      const answers = currentForm.fields.map((field) => ({
        fieldId: field.fieldId,
        value: editFormData[field.fieldId] || (field.type === 'checkbox' ? [] : ''),
      }));

      const availableSlots = normalizeAvailabilitySlots(editFormData.availability);

      const res = await fetch(
        `/api/forms/${currentForm.formId}/responses/${editingResponse.responseId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            answers,
            participantData: {
              name: String(editFormData.participantName || ''),
              nameKana: String(editFormData.participantNameKana || ''),
              section: String(editFormData.participantSection || ''),
              grade: normalizeGrade(editFormData.participantGrade),
              availableSlots,
            },
          }),
        },
      );

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || '回答の更新に失敗しました');
        return;
      }

      await loadDashboard();
      closeEditModal();
    } catch (err) {
      console.error(err);
      setError('回答の更新に失敗しました');
    } finally {
      setEditSaving(false);
    }
  };

  const deleteForm = async () => {
    if (!resolvedParams || !user || !currentForm) return;

    if (!confirm('このフォームを削除しますか？回答データも含めて削除されます。')) {
      return;
    }

    try {
      setDeleting(true);
      setError('');

      const token = await user.getIdToken();
      const res = await fetch(`/api/forms/${currentForm.formId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error || 'フォームの削除に失敗しました');
        return;
      }

      setForms([]);
      setResponses([]);
      setActiveTab('content');
      setDraftTitle(DEFAULT_TITLE);
      setDraftDescription(DEFAULT_DESCRIPTION);
      setDraftIsActive(true);
    } catch (err) {
      console.error(err);
      setError('フォームの削除に失敗しました');
    } finally {
      setDeleting(false);
    }
  };

  const renderEditableField = (field: FormField) => {
    const fieldValue = editFormData[field.fieldId];
    const optionLabel = (option: string) =>
      isAvailabilityField(field) ? formatAvailabilitySlotLabel(option) : option;

    if (isAvailabilityField(field)) {
      const selectedValues = Array.isArray(fieldValue) ? fieldValue : [];
      const dateOptions = (field.options || []).filter(
        (option) => option !== UNAVAILABLE_SLOT_KEY && option !== ALL_AVAILABLE_SLOT_KEY,
      );
      const allDateSlotKeys = dateOptions;
      const showAllAvailableOption = dateOptions.length > 1;
      const displaySpecialOptions = (field.options || []).filter((option) => {
        if (option === UNAVAILABLE_SLOT_KEY) return true;
        if (option === ALL_AVAILABLE_SLOT_KEY) return showAllAvailableOption;
        return false;
      });

      const renderOptionCard = (
        option: string,
        index: number,
        tone: 'date' | 'special' = 'date',
      ) => {
        const selected = selectedValues.includes(option);
        const isSpecial = tone === 'special';
        return (
          <label
            key={`${option}-${index}`}
            className={`group flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all duration-150 ${
              selected
                ? 'border-indigo-500 bg-indigo-50 shadow-sm ring-2 ring-indigo-200'
                : 'border-gray-200 bg-white hover:border-indigo-300 hover:bg-gray-50'
            }`}
          >
            <input
              type="checkbox"
              value={option}
              checked={selected}
              onChange={() => {
                const currentValues = Array.isArray(editFormData.availability)
                  ? editFormData.availability
                  : [];
                const nextValues = toggleAvailabilitySelection(
                  currentValues,
                  option,
                  allDateSlotKeys,
                );
                setEditFormData((current) => ({
                  ...current,
                  availability: nextValues,
                }));
              }}
              className="sr-only"
            />
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                selected
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-gray-300 bg-white text-transparent group-hover:border-indigo-400'
              }`}
              aria-hidden="true"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M16.704 5.29a1 1 0 0 1 0 1.414l-7.25 7.25a1 1 0 0 1-1.414 0l-3.25-3.25a1 1 0 1 1 1.414-1.414l2.543 2.543 6.543-6.543a1 1 0 0 1 1.414 0Z" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-gray-900">{optionLabel(option)}</span>
              {isSpecial && (
                <span className="mt-1 block text-xs text-gray-500">
                  {option === ALL_AVAILABLE_SLOT_KEY
                    ? '配布期間内の全日時に対応可能です'
                    : 'この日時には参加できません'}
                </span>
              )}
            </span>
          </label>
        );
      };

      return (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          {displaySpecialOptions.length > 0 && (
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {displaySpecialOptions.map((option, index) =>
                renderOptionCard(option, index, 'special'),
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dateOptions.map((option, index) => renderOptionCard(option, index))}
          </div>
        </div>
      );
    }

    if (field.type === 'textarea') {
      return (
        <textarea
          value={typeof fieldValue === 'string' ? fieldValue : ''}
          onChange={(e) =>
            setEditFormData((current) => ({ ...current, [field.fieldId]: e.target.value }))
          }
          rows={4}
          className="mt-1 block w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-indigo-500"
        />
      );
    }

    if (field.type === 'select' || field.type === 'radio') {
      return (
        <select
          value={typeof fieldValue === 'string' ? fieldValue : ''}
          onChange={(e) =>
            setEditFormData((current) => ({ ...current, [field.fieldId]: e.target.value }))
          }
          className="mt-1 block w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-indigo-500"
        >
          <option value="">選択してください</option>
          {(field.options || []).map((option) => (
            <option key={option} value={option}>
              {optionLabel(option)}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        type={field.type === 'number' ? 'number' : 'text'}
        value={typeof fieldValue === 'string' ? fieldValue : ''}
        onChange={(e) =>
          setEditFormData((current) => ({ ...current, [field.fieldId]: e.target.value }))
        }
        className="mt-1 block w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-indigo-500"
      />
    );
  };

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

  const headerActions = currentForm ? (
    <>
      <Link
        href={`/admin/event/${resolvedParams.year}`}
        className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        イベント管理に戻る
      </Link>
      <a
        href={`/form/${currentForm.formId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        公開フォームを開く
      </a>
      <label className="inline-flex items-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700">
        <input
          type="checkbox"
          checked={draftIsActive}
          onChange={(e) => handleDraftIsActiveChange(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        フォームを公開する
      </label>
    </>
  ) : (
    <Link
      href={`/admin/event/${resolvedParams.year}`}
      className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
    >
      イベント管理に戻る
    </Link>
  );

  if (!currentForm) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <YearPageSectionHeader
            title={`フォーム管理 (${resolvedParams.year}年度)`}
            description="この年度にはフォームがまだありません。ここから作成します。"
            actions={headerActions}
          />

          {error && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">基本設定</h2>
                </div>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="title" className="block text-sm font-medium text-gray-700">
                      フォームタイトル *
                    </label>
                    <input
                      id="title"
                      value={draftTitle}
                      onChange={(e) => handleDraftTitleChange(e.target.value)}
                      className="mt-1 w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none ring-0 focus:border-indigo-500"
                      placeholder="例: 工大祭準備に関するアンケート"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="description"
                      className="block text-sm font-medium text-gray-700"
                    >
                      説明文
                    </label>
                    <textarea
                      id="description"
                      rows={4}
                      value={draftDescription}
                      onChange={(e) => handleDraftDescriptionChange(e.target.value)}
                      className="mt-1 w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none ring-0 focus:border-indigo-500"
                      placeholder="フォームの目的や注意事項を記載してください"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="car-usage-visible-from-grade"
                      className="block text-sm font-medium text-gray-700"
                    >
                      車を利用するフォームの表示対象学年
                    </label>
                    <select
                      id="car-usage-visible-from-grade"
                      value={carUsageVisibleFromGrade}
                      onChange={(e) => handleCarUsageVisibleFromGradeChange(e.target.value)}
                      className="mt-1 w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none ring-0 focus:border-indigo-500"
                    >
                      <option value="0">車を利用しない</option>
                      <option value="1">1年生以上</option>
                      <option value="2">2年生以上</option>
                      <option value="3">3年生以上</option>
                      <option value="4">4年生以上</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <Link
                    href={`/admin/event/${resolvedParams.year}`}
                    className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    キャンセル
                  </Link>
                  <button
                    type="button"
                    onClick={createForm}
                    disabled={saving}
                    className="inline-flex items-center rounded-lg border border-transparent bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? '作成中...' : 'フォームを作成'}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-3xl border border-gray-200 bg-gray-100 p-4">
              <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">フォームプレビュー</h3>
                  </div>
                  <Link
                    href={`/admin/event/${resolvedParams.year}/setting`}
                    className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    設定を開く
                  </Link>
                </div>
                <div className="mt-6 space-y-4">
                  {visiblePreviewFields.map((field) => (
                    <div
                      key={field.fieldId}
                      className="rounded-2xl border border-gray-200 bg-gray-50 p-5"
                    >
                      <SurveyFieldBlock
                        field={field}
                        value={previewValues[field.fieldId]}
                        onValueChange={(value) => {
                          setPreviewValues((current) => ({
                            ...current,
                            [field.fieldId]: value,
                          }));
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <YearPageSectionHeader
          title={`フォーム管理 (${resolvedParams.year}年度)`}
          actions={headerActions}
        />

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6 pt-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold text-gray-900">
                    {draftTitle || currentForm.title}
                  </h1>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                      draftIsActive
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {draftIsActive ? '公開中' : '非公開'}
                  </span>
                </div>
                {draftDescription && (
                  <p className="max-w-3xl text-sm leading-6 text-gray-600">{draftDescription}</p>
                )}
                <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                  <span>回答数: {responses.length}</span>
                  <span>
                    最終回答: {latestResponse ? formatDate(latestResponse.submittedAt) : '-'}
                  </span>
                  <span>
                    配布期間:{' '}
                    {eventData?.distributionStartDate && eventData?.distributionEndDate
                      ? `${toDateDisplay(eventData.distributionStartDate)} 〜 ${toDateDisplay(eventData.distributionEndDate)}`
                      : '未設定'}
                  </span>
                  <span>
                    自動保存:{' '}
                    {saveStatus === 'saving'
                      ? '保存中'
                      : saveStatus === 'saved'
                        ? '保存済み'
                        : '保存エラー'}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('content')}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    activeTab === 'content'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  フォーム内容
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('overview');
                    responsesCardRef.current?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    });
                  }}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    activeTab === 'overview'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  回答・各種設定
                </button>
              </div>
            </div>
          </div>

          <div className="p-6">
            {activeTab === 'content' && (
              <FormContentTab
                draftTitle={draftTitle}
                draftDescription={draftDescription}
                onDraftTitleChange={handleDraftTitleChange}
                onDraftDescriptionChange={handleDraftDescriptionChange}
                carUsageVisibleFromGrade={carUsageVisibleFromGrade}
                onCarUsageVisibleFromGradeChange={handleCarUsageVisibleFromGradeChange}
                previewFields={currentForm.fields}
                availabilityChoices={availabilityChoiceKeys}
              />
            )}

            {activeTab === 'overview' && (
              <FormOverviewTab
                year={resolvedParams.year}
                currentForm={currentForm}
                responses={responses}
                sortedResponses={sortedResponses}
                latestResponse={latestResponse}
                allAvailabilityChoices={allAvailabilityChoices}
                responsesCardRef={responsesCardRef}
                onOpenEdit={openEditModal}
                onDeleteForm={deleteForm}
                deleting={deleting}
                saveStatus={saveStatus}
              />
            )}
          </div>
        </div>
      </div>

      {editingResponse && currentForm && (
        <ResponseEditModal
          open
          title="回答を編集"
          onClose={closeEditModal}
          name={String(editFormData.participantName || '')}
          nameKana={String(editFormData.participantNameKana || '')}
          grade={String(editFormData.participantGrade || '')}
          section={String(editFormData.participantSection || '')}
          onNameChange={(value) =>
            setEditFormData((current) => ({ ...current, participantName: value }))
          }
          onNameKanaChange={(value) =>
            setEditFormData((current) => ({ ...current, participantNameKana: value }))
          }
          onGradeChange={(value) =>
            setEditFormData((current) => ({ ...current, participantGrade: value }))
          }
          onSectionChange={(value) =>
            setEditFormData((current) => ({ ...current, participantSection: value }))
          }
          onSubmit={updateResponse}
          submitLabel="変更を保存"
          submitting={editSaving}
          maxWidthClassName="max-w-4xl"
        >
          {filterEditableFormFieldsForParticipant(
            currentForm.fields,
            normalizeGrade(editFormData.participantGrade),
            editFormData.availability,
            editFormData,
          )
            .sort((a, b) => a.order - b.order)
            .map((field) => (
              <div
                key={field.fieldId}
                className="rounded-2xl border border-gray-200 bg-gray-50 p-5"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{field.label}</h3>
                  </div>
                </div>
                {renderEditableField(field)}
              </div>
            ))}
        </ResponseEditModal>
      )}
    </div>
  );
}
