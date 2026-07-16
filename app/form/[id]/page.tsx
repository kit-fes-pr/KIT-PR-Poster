'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { LoadingInline } from '@/components/ui/Loading';
import { SurveyForm, FormAnswer } from '@/types/forms';
import { normalizeAvailabilitySlots } from '@/lib/utils/availability/availability';
import { PublicSurveyForm } from '@/components/forms/PublicSurveyForm';
import type { ParticipantIdentityFormValues } from '@/components/forms/ParticipantIdentitySection';
import { filterVisibleFormFieldsForParticipant } from '@/lib/utils/forms/forms';

interface FormData {
  [fieldId: string]: string | string[];
  // 参加者必須情報
  participantName: string;
  participantNameKana: string;
  participantGrade: string;
  participantSection: string;
}

export default function FormResponsePage({ params }: { params: Promise<{ id: string }> }) {
  const [resolvedParams, setResolvedParams] = useState<{ id: string } | null>(null);
  const [form, setForm] = useState<SurveyForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const { handleSubmit, control, watch, setValue, getValues } = useForm<FormData>();
  const participantGrade = watch('participantGrade');
  const participantAvailability = watch('availability');
  const visibleFields = useMemo(() => {
    if (!form) return [];
    return filterVisibleFormFieldsForParticipant(
      form.fields,
      participantGrade,
      participantAvailability,
    ).sort((a, b) => a.order - b.order);
  }, [form, participantGrade, participantAvailability]);

  useEffect(() => {
    if (participantGrade === '4') {
      setValue('participantSection', '4年', {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      return;
    }

    if (getValues('participantSection') === '4年') {
      setValue('participantSection', '', {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
    }
  }, [participantGrade, setValue, getValues]);

  useEffect(() => {
    params.then(setResolvedParams);
  }, [params]);

  useEffect(() => {
    if (!resolvedParams) return;

    const loadForm = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/forms/${resolvedParams.id}`);
        const data = await res.json();

        if (res.ok) {
          setForm(data);
        } else {
          setError(data.error || 'フォームの取得に失敗しました');
        }
      } catch (err) {
        setError('フォームの取得に失敗しました');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadForm();
  }, [resolvedParams]);

  const onSubmit = async (data: FormData) => {
    if (!form || !resolvedParams) return;

    try {
      setSubmitting(true);
      setError('');

      for (const field of form.fields) {
        if (!visibleFields.some((visibleField) => visibleField.fieldId === field.fieldId)) {
          continue;
        }

        const rawValue = data[field.fieldId];

        if (field.type === 'select' || field.type === 'radio') {
          if (typeof rawValue === 'string' && rawValue && !field.options?.includes(rawValue)) {
            setError(`${field.label}の選択肢が正しくありません`);
            return;
          }
        }

        if (field.type === 'checkbox') {
          if (rawValue == null) {
            if (field.required) {
              setError(`${field.label}は一つ以上選択してください`);
              return;
            }
            continue;
          }

          if (!Array.isArray(rawValue)) {
            setError(`${field.label}は配列で送信してください`);
            return;
          }

          if (!field.required && rawValue.length === 0) {
            continue;
          }

          const invalidValue = rawValue.find((value) => !field.options?.includes(value));
          if (invalidValue) {
            setError(`${field.label}の選択肢が正しくありません`);
            return;
          }
        }
      }

      // フォームデータを変換
      const answers: FormAnswer[] = visibleFields.map((field) => ({
        fieldId: field.fieldId,
        value: data[field.fieldId] || (field.type === 'checkbox' ? [] : ''),
      }));

      const availableSlots = normalizeAvailabilitySlots(data.availability);
      if (availableSlots.length === 0) {
        setError('参加可能日時は一つ以上選択してください');
        return;
      }

      const res = await fetch(`/api/forms/${resolvedParams.id}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          answers,
          participantData: {
            name: data.participantName,
            nameKana: data.participantNameKana,
            section: data.participantSection,
            grade: data.participantGrade,
            availableSlots,
          },
          submitterInfo: {
            submittedAt: new Date().toISOString(),
          },
        }),
      });

      const result = await res.json();

      if (res.ok) {
        setSubmitted(true);
      } else {
        setError(result.error || '回答の送信に失敗しました');
        if (result.details) {
          setError(result.details.join('\n'));
        }
      }
    } catch (err) {
      setError('回答の送信に失敗しました');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <LoadingInline size="lg" />
        </div>
      </div>
    );
  }

  if (error && !form) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-50 border border-red-200 rounded-md p-6 max-w-md">
            <h2 className="text-lg font-medium text-red-900 mb-2">エラー</h2>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-green-50 border border-green-200 rounded-md p-6 max-w-md">
            <div className="flex items-center justify-center mb-4">
              <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center">
                <svg
                  className="h-6 w-6 text-green-600"
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
              </div>
            </div>
            <h2 className="text-lg font-medium text-green-900 mb-2">回答を送信しました</h2>
            <p className="text-sm text-green-700">
              ご協力ありがとうございます。
              <br />
              予定が変更になったらPR総括に連絡ください。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-8">
            {/* ヘッダー */}
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-gray-900">{form?.title}</h1>
              {form?.description && (
                <p className="mt-2 text-sm text-gray-600">{form.description}</p>
              )}
            </div>

            {/* エラー表示 */}
            {error && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
                <pre className="text-sm text-red-600 whitespace-pre-wrap">{error}</pre>
              </div>
            )}

            {/* フォーム */}
            <PublicSurveyForm
              form={form ? { ...form, fields: visibleFields } : form}
              control={
                control as unknown as import('react-hook-form').Control<ParticipantIdentityFormValues>
              }
              handleSubmit={
                handleSubmit as unknown as import('react-hook-form').UseFormHandleSubmit<ParticipantIdentityFormValues>
              }
              onSubmit={onSubmit}
              submitting={submitting}
              submitLabel="回答を送信"
            />

            {/* フッター */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <p className="text-xs text-gray-500 text-center">
                工大祭実行委員会 - ポスター配布管理システム
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
