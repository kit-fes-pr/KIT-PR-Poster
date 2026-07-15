import {
  FormAnswer,
  FormCreateData,
  FormField,
  FormResponse,
  ParticipantSurveyResponse,
  SurveyForm,
} from '../../../types/forms';
import { normalizeFormEventContext } from './forms';
import { serializeDate } from './forms';
import { normalizeGrade } from '../grade/grade';

function resolveFixedFieldId(index: number): string {
  if (index === 0) return 'availability';
  if (index === 1) return 'carUsage';
  if (index === 2) return 'remarks';
  return `field_${index + 1}`;
}

export function normalizeFormAuthHeader(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.split('Bearer ')[1]?.trim();
  return token || null;
}

export function validateFormFields(fields: unknown): string | null {
  if (!Array.isArray(fields) || fields.length === 0) {
    return 'フォームフィールドを最低1つ設定してください';
  }

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (!field || typeof field !== 'object') {
      return `フィールド${i + 1}のデータ形式が無効です`;
    }
    const typedField = field as Partial<FormField>;
    if (!typedField.label?.trim()) {
      return `フィールド${i + 1}のラベルは必須です`;
    }
    if (
      !['text', 'select', 'radio', 'checkbox', 'textarea', 'number'].includes(typedField.type || '')
    ) {
      return `フィールド${i + 1}の種類が無効です`;
    }
    if (
      ['select', 'radio', 'checkbox'].includes(typedField.type || '') &&
      (!Array.isArray(typedField.options) || typedField.options.length === 0)
    ) {
      return `フィールド${i + 1}の選択肢を設定してください`;
    }
  }

  return null;
}

export function buildFormCreateRecord(input: {
  title: unknown;
  description: unknown;
  fields: FormCreateData['fields'];
  eventId: unknown;
  year: unknown;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}): { data: Omit<SurveyForm, 'formId'> & { responseCount: number } } | { error: string } {
  const normalizedEventContext = normalizeFormEventContext(input.eventId, input.year);
  if (!normalizedEventContext) {
    return { error: 'eventId と year を正しく指定してください' };
  }

  if (!String(input.title || '').trim()) {
    return { error: 'フォームタイトルは必須です' };
  }

  const fieldsError = validateFormFields(input.fields);
  if (fieldsError) {
    return { error: fieldsError };
  }

  return {
    data: {
      title: String(input.title).trim(),
      description: String(input.description || '').trim(),
      isActive: true,
      eventId: normalizedEventContext.eventId,
      year: normalizedEventContext.year,
      fields: input.fields.map((field, index) => ({
        ...field,
        fieldId: resolveFixedFieldId(index),
        label: field.label.trim(),
        order: index,
      })),
      createdBy: input.createdBy,
      createdAt: input.createdAt || new Date(),
      updatedAt: input.updatedAt || new Date(),
      responseCount: 0,
    },
  };
}

export function buildFormUpdateRecord(input: {
  title?: unknown;
  description?: unknown;
  isActive?: unknown;
  fields?: FormField[];
  updatedAt?: Date;
}): { updateFields: Record<string, unknown>; error: string | null } {
  const updateFields: Record<string, unknown> = {
    updatedAt: input.updatedAt || new Date(),
  };

  if (input.title !== undefined) {
    if (!String(input.title).trim()) {
      return { updateFields, error: 'フォームタイトルは必須です' };
    }
    updateFields.title = String(input.title).trim();
  }

  if (input.description !== undefined) {
    updateFields.description = String(input.description || '').trim();
  }

  if (input.isActive !== undefined) {
    updateFields.isActive = input.isActive;
  }

  if (input.fields !== undefined) {
    const fieldsError = validateFormFields(input.fields);
    if (fieldsError) {
      return { updateFields, error: fieldsError };
    }
    updateFields.fields = input.fields.map((field, index) => ({
      ...field,
      fieldId: field.fieldId || resolveFixedFieldId(index),
      order: index,
    }));
  }

  return { updateFields, error: null };
}

export function serializeFormData<T extends Record<string, unknown>>(data: T) {
  return {
    ...data,
    createdAt: serializeDate(data.createdAt),
    updatedAt: serializeDate(data.updatedAt),
  };
}

export function buildFormResponseRecord(input: {
  formId: string;
  answers: FormAnswer[];
  submitterInfo?: Record<string, unknown>;
  participantData?: {
    name: string;
    nameKana?: string;
    section: string;
    grade: unknown;
    availableSlots?: string[];
  };
  editToken: string;
  now?: Date;
}): Omit<FormResponse | ParticipantSurveyResponse, 'responseId'> {
  const now = input.now || new Date();
  const answers = input.answers.map((answer) => ({
    fieldId: answer.fieldId,
    value: answer.value,
  }));

  if (input.participantData) {
    return {
      formId: input.formId,
      answers,
      submittedAt: now,
      editToken: input.editToken,
      submitterInfo: input.submitterInfo || {},
      participantData: {
        name: input.participantData.name,
        nameKana: input.participantData.nameKana || '',
        section: input.participantData.section,
        grade: normalizeGrade(input.participantData.grade),
        availableSlots: input.participantData.availableSlots || [],
      },
    } as Omit<ParticipantSurveyResponse, 'responseId'>;
  }

  return {
    formId: input.formId,
    answers,
    submittedAt: now,
    editToken: input.editToken,
    submitterInfo: input.submitterInfo || {},
  } as Omit<FormResponse, 'responseId'>;
}
