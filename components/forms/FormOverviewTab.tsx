'use client';

import Link from 'next/link';
import { MutableRefObject } from 'react';
import { auth } from '@/lib/firebase';
import { formatDate } from '@/lib/utils/dateUtils';
import { formatAvailabilitySlotLabel } from '@/lib/utils/availability/availability';
import {
  buildResponseExportRows,
  formatResponseExportAvailability,
  sortResponseExportRows,
} from '@/lib/utils/forms/forms';
import { buildCsvContent, downloadCsvFile, sanitizeFileName } from '@/lib/utils/export/export';
import { ExportActionButtons } from '@/components/ui/ExportActionButtons';
import { FormField, FormResponse, ParticipantSurveyResponse, SurveyForm } from '@/types/forms';

type AvailabilityChoice = {
  key: string;
  label: string;
};

type FormOverviewTabProps = {
  year: string;
  currentForm: SurveyForm;
  responses: (FormResponse | ParticipantSurveyResponse)[];
  sortedResponses: (FormResponse | ParticipantSurveyResponse)[];
  latestResponse: FormResponse | ParticipantSurveyResponse | null;
  allAvailabilityChoices: AvailabilityChoice[];
  responsesCardRef: MutableRefObject<HTMLDivElement | null>;
  onOpenEdit: (response: FormResponse | ParticipantSurveyResponse) => void;
  onDeleteForm: () => void;
  deleting: boolean;
  saveStatus: 'saved' | 'saving' | 'error';
};

function renderResponseValue(field: FormField, value: string | string[] | undefined): string {
  if (value === undefined || value === null) return '-';
  const values = Array.isArray(value) ? value : [value];
  if (values.length === 0) return '-';
  if (field.fieldId === 'availability') {
    return values.map((item) => formatAvailabilitySlotLabel(item)).join(' / ');
  }
  return values.join(' / ');
}

function buildResponseCsvContent(rows: ReturnType<typeof buildResponseExportRows>): string {
  const header = ['名前', '学年', 'セクション', '参加可能日時', '回答日時'];
  const body = rows.map((row) => [
    row.name || '名前未入力',
    row.grade > 0 ? `${row.grade}年` : '',
    row.section,
    formatResponseExportAvailability(row),
    formatDate(row.submittedAt),
  ]);
  return buildCsvContent([header, ...body]);
}

export function FormOverviewTab({
  year,
  currentForm,
  responses,
  sortedResponses,
  latestResponse,
  allAvailabilityChoices,
  responsesCardRef,
  onOpenEdit,
  onDeleteForm,
  deleting,
  saveStatus,
}: FormOverviewTabProps) {
  const exportRows = sortResponseExportRows(buildResponseExportRows(responses));

  const handleCsvExport = () => {
    downloadCsvFile(
      `${sanitizeFileName(currentForm.title)}_回答者一覧.csv`,
      buildResponseCsvContent(exportRows),
    );
  };

  const handlePdfExport = async () => {
    const viewerWindow = window.open('', '_blank');
    if (!viewerWindow) {
      alert('PDFビューアを開けませんでした。ポップアップ設定を確認してください。');
      return;
    }
    viewerWindow.document.write(
      '<!doctype html><html><head><meta charset="utf-8"><title>PDF生成中</title></head><body style="font-family: sans-serif; padding: 24px;">PDFを生成しています...</body></html>',
    );
    viewerWindow.document.close();

    const token = await auth.currentUser?.getIdToken();
    if (!token) {
      viewerWindow.document.body.textContent = 'PDF出力にはログインが必要です';
      return;
    }

    const response = await fetch('/api/admin/export/responses/pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        year,
        formTitle: currentForm.title,
        rows: exportRows,
      }),
    });

    if (!response.ok) {
      viewerWindow.document.body.textContent = 'PDFの生成に失敗しました';
      return;
    }

    const pdfBlob = await response.blob();
    const pdfUrl = URL.createObjectURL(pdfBlob);
    viewerWindow.location.href = pdfUrl;
    window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">選択肢設定</h3>
          </div>
          <Link
            href={`/admin/event/${year}/setting`}
            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            イベント設定へ
          </Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {allAvailabilityChoices.length > 0 ? (
            allAvailabilityChoices.map((choice) => (
              <span
                key={choice.key}
                className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700"
              >
                {choice.label}
              </span>
            ))
          ) : (
            <span className="text-sm text-red-600">配布日時が未設定です</span>
          )}
        </div>
      </div>

      <div
        ref={responsesCardRef}
        className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">回答</h3>
          </div>
          <div className="flex flex-wrap items-start justify-end gap-3">
            <ExportActionButtons onCsvExport={handleCsvExport} onPdfExport={handlePdfExport} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                  回答数
                </p>
                <p className="mt-1 text-2xl font-semibold text-gray-900">{responses.length}</p>
              </div>
              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                  最新回答
                </p>
                <p className="mt-1 text-sm font-medium text-gray-900">
                  {latestResponse ? formatDate(latestResponse.submittedAt) : 'まだ回答がありません'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {responses.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center">
            <p className="text-lg font-medium text-gray-900">回答がありません</p>
            <p className="mt-2 text-sm text-gray-500">
              フォームを公開すると、このカード内に回答が表示されます。
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      回答日時
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      参加者情報
                    </th>
                    {currentForm.fields.map((field) => (
                      <th
                        key={field.fieldId}
                        className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500"
                      >
                        {field.label}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {sortedResponses.map((response) => {
                    const participantResponse = response as ParticipantSurveyResponse;

                    return (
                      <tr key={response.responseId} className="align-top">
                        <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-900">
                          {formatDate(response.submittedAt)}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-900">
                          <div className="font-medium">
                            {participantResponse.participantData?.name || '名前未入力'}
                          </div>
                          {participantResponse.participantData?.nameKana && (
                            <div className="mt-0.5 text-xs text-gray-400">
                              {participantResponse.participantData.nameKana}
                            </div>
                          )}
                          <div className="mt-1 text-gray-500">
                            {participantResponse.participantData?.grade
                              ? `${participantResponse.participantData.grade}年 `
                              : ''}
                            {participantResponse.participantData?.section || ''}
                          </div>
                        </td>
                        {currentForm.fields.map((field) => {
                          const answer = response.answers.find(
                            (item) => item.fieldId === field.fieldId,
                          );
                          return (
                            <td key={field.fieldId} className="px-4 py-4 text-sm text-gray-900">
                              <div className="max-w-[18rem] whitespace-pre-wrap break-words">
                                {renderResponseValue(
                                  field,
                                  answer?.value as string | string[] | undefined,
                                )}
                              </div>
                            </td>
                          );
                        })}
                        <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-900">
                          <button
                            type="button"
                            onClick={() => onOpenEdit(response)}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                          >
                            編集
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onDeleteForm}
          disabled={deleting}
          className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deleting ? '削除中...' : 'フォームを削除'}
        </button>
      </div>
    </div>
  );
}
