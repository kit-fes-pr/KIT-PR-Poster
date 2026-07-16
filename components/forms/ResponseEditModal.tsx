'use client';

import { ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';
import { ParticipantIdentityFields } from '@/components/forms/ParticipantIdentityFields';

type ResponseEditModalProps = {
  open: boolean;
  title: string;
  description?: string;
  name: string;
  nameKana: string;
  grade: string;
  section: string;
  onClose: () => void;
  onNameChange: (value: string) => void;
  onNameKanaChange: (value: string) => void;
  onGradeChange: (value: string) => void;
  onSectionChange: (value: string) => void;
  onSubmit: () => void;
  submitLabel: string;
  submitting?: boolean;
  children: ReactNode;
  footerNote?: ReactNode;
  maxWidthClassName?: string;
};

export function ResponseEditModal({
  open,
  title,
  description,
  name,
  nameKana,
  grade,
  section,
  onClose,
  onNameChange,
  onNameKanaChange,
  onGradeChange,
  onSectionChange,
  onSubmit,
  submitLabel,
  submitting = false,
  children,
  footerNote,
  maxWidthClassName = 'max-w-4xl',
}: ResponseEditModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      centered={false}
      panelClassName={maxWidthClassName}
      contentClassName="px-6 py-6"
    >
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          {description && <p className="text-sm text-gray-500">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div className="px-6 py-6">
        {footerNote && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {footerNote}
          </div>
        )}

        <div className="space-y-6">
          <ParticipantIdentityFields
            name={name}
            nameKana={nameKana}
            grade={grade}
            section={section}
            onNameChange={onNameChange}
            onNameKanaChange={onNameKanaChange}
            onGradeChange={onGradeChange}
            onSectionChange={onSectionChange}
          />

          {children}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting}
              className="rounded-lg border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? '保存中...' : submitLabel}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
