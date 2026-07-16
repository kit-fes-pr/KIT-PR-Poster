import {
  ALL_AVAILABLE_SLOT_KEY,
  UNAVAILABLE_SLOT_KEY,
  formatAvailabilitySlotLabel,
  normalizeAvailabilitySlots,
} from '../availability/availability';
import { normalizeGrade } from '../grade/grade';
import { generateKana } from '../../kanaUtils';
import type { FormAnswer, FormResponse, ParticipantSurveyResponse } from '@/types/forms';
import { serializeDateTimeValue as serializeDate } from '../dateUtils';

export { serializeDate };

export function toMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate?: () => Date }).toDate === 'function'
  ) {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }
  return 0;
}

export function normalizeFormEventContext(
  eventId: unknown,
  year: unknown,
): { eventId: string; year: number } | null {
  const normalizedYear =
    typeof year === 'number'
      ? Number.isInteger(year) && year >= 1000 && year <= 9999
        ? year
        : Number.NaN
      : typeof year === 'string' && /^\d{4}$/.test(year.trim())
        ? Number(year.trim())
        : Number.NaN;

  if (Number.isInteger(normalizedYear) && normalizedYear >= 1000 && normalizedYear <= 9999) {
    return {
      eventId: `kodai${normalizedYear}`,
      year: normalizedYear,
    };
  }

  const normalizedEventId = typeof eventId === 'string' ? eventId.trim() : '';
  const matchedYear = normalizedEventId.match(/^kodai(\d{4})$/)?.[1];

  if (matchedYear) {
    return {
      eventId: normalizedEventId,
      year: Number(matchedYear),
    };
  }

  if (normalizedEventId) {
    return null;
  }

  return null;
}

export function resolveResponseAvailabilitySlots(
  answers: Array<{ fieldId: string; value: unknown }>,
  participantAvailableSlots: unknown,
): string[] {
  const availabilityAnswer = answers.find(
    (answer: { fieldId: string; value: unknown }) => answer.fieldId === 'availability',
  );
  if (availabilityAnswer) {
    return normalizeAvailabilitySlots(availabilityAnswer.value);
  }

  return normalizeAvailabilitySlots(participantAvailableSlots);
}

export function validateFormAnswersPayload(
  answers: unknown,
): { valid: true } | { valid: false; error: string } {
  if (!Array.isArray(answers)) {
    return { valid: false, error: '回答データが正しくありません' };
  }

  for (const answer of answers) {
    if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) {
      return { valid: false, error: '回答データの形式が正しくありません' };
    }

    if (typeof (answer as { fieldId?: unknown }).fieldId !== 'string') {
      return { valid: false, error: '回答データの形式が正しくありません' };
    }
  }

  return { valid: true };
}

export function expandAvailabilitySlotsForStorage(
  values: unknown,
  allDateSlotKeys: string[],
): string[] {
  const normalized = normalizeAvailabilitySlots(values);
  if (normalized.includes(ALL_AVAILABLE_SLOT_KEY)) {
    return allDateSlotKeys;
  }

  return normalized;
}

export function prepareAnswersForStorage(
  answers: FormAnswer[],
  visibleFieldIds: Set<string>,
  availabilityDateSlotKeys: string[],
): FormAnswer[] {
  const filteredAnswers = answers.filter((answer: FormAnswer) =>
    visibleFieldIds.has(answer.fieldId),
  );
  return filteredAnswers.map((answer: FormAnswer) =>
    answer.fieldId === 'availability'
      ? {
          ...answer,
          value: expandAvailabilitySlotsForStorage(answer.value, availabilityDateSlotKeys),
        }
      : answer,
  );
}

export function mergeFormAnswers(
  existingAnswers: FormAnswer[],
  incomingAnswers: FormAnswer[],
): FormAnswer[] {
  const mergedByFieldId = new Map<string, FormAnswer>();

  for (const answer of existingAnswers) {
    mergedByFieldId.set(answer.fieldId, answer);
  }

  for (const answer of incomingAnswers) {
    mergedByFieldId.set(answer.fieldId, answer);
  }

  return Array.from(mergedByFieldId.values());
}

export function isFormFieldVisibleForGrade(
  field: { visibleFromGrade?: number },
  participantGrade: unknown,
): boolean {
  if (field.visibleFromGrade == null) return true;

  const minGrade = normalizeGrade(field.visibleFromGrade);
  if (minGrade <= 0) return false;

  const grade = normalizeGrade(participantGrade);
  if (grade <= 0) return false;

  return grade >= minGrade;
}

export function isFormFieldVisibleForParticipant(
  field: { fieldId: string; visibleFromGrade?: number },
  participantGrade: unknown,
  availabilityValue: unknown,
): boolean {
  if (!isFormFieldVisibleForGrade(field, participantGrade)) {
    return false;
  }

  if (field.fieldId !== 'carUsage') {
    return true;
  }

  const selectedAvailability = normalizeAvailabilitySlots(availabilityValue);
  return !selectedAvailability.includes(UNAVAILABLE_SLOT_KEY);
}

export function filterVisibleFormFieldsForParticipant<
  T extends { fieldId: string; visibleFromGrade?: number },
>(fields: T[], participantGrade: unknown, availabilityValue: unknown): T[] {
  return fields.filter((field) =>
    isFormFieldVisibleForParticipant(field, participantGrade, availabilityValue),
  );
}

export function hasFormFieldAnswerValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim() !== '';
  return value !== null && value !== undefined;
}

export function filterEditableFormFieldsForParticipant<
  T extends { fieldId: string; visibleFromGrade?: number },
>(
  fields: T[],
  participantGrade: unknown,
  availabilityValue: unknown,
  answerValues: Record<string, unknown>,
): T[] {
  return fields.filter(
    (field) =>
      isFormFieldVisibleForParticipant(field, participantGrade, availabilityValue) ||
      hasFormFieldAnswerValue(answerValues[field.fieldId]),
  );
}

export function filterVisibleFormFields<T extends { visibleFromGrade?: number }>(
  fields: T[],
  participantGrade: unknown,
): T[] {
  return fields.filter((field) => isFormFieldVisibleForGrade(field, participantGrade));
}

export type ResponseExportRow = {
  responseId: string;
  name: string;
  nameKana: string;
  grade: number;
  section: string;
  availableSlots: string[];
  submittedAt: Date | string | number;
};

function getSubmittedAtMillis(value: Date | string | number): number {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function buildResponseExportRows(
  responses: (FormResponse | ParticipantSurveyResponse)[],
): ResponseExportRow[] {
  return responses.map((response) => {
    const participantData = (response as ParticipantSurveyResponse).participantData;
    return {
      responseId: response.responseId,
      name: participantData?.name?.trim() || '',
      nameKana: participantData?.nameKana?.trim() || '',
      grade: normalizeGrade(participantData?.grade),
      section: participantData?.section?.trim() || '',
      availableSlots: normalizeAvailabilitySlots(participantData?.availableSlots),
      submittedAt: response.submittedAt,
    };
  });
}

export function formatResponseExportAvailability(row: ResponseExportRow): string {
  if (row.availableSlots.length === 0) return '-';
  return row.availableSlots.map((slot) => formatAvailabilitySlotLabel(slot)).join(' ・ ');
}

export function sortResponseExportRows(rows: ResponseExportRow[]): ResponseExportRow[] {
  const collator = new Intl.Collator('ja');

  return [...rows].sort((a, b) => {
    const aSortName = generateKana(a.nameKana || a.name);
    const bSortName = generateKana(b.nameKana || b.name);
    const aHasName = aSortName.length > 0;
    const bHasName = bSortName.length > 0;
    if (aHasName !== bHasName) return aHasName ? -1 : 1;

    const nameCompare = collator.compare(aSortName, bSortName);
    if (nameCompare !== 0) return nameCompare;

    const displayNameCompare = collator.compare(a.name, b.name);
    if (displayNameCompare !== 0) return displayNameCompare;

    if (a.grade !== b.grade) return a.grade - b.grade;

    const sectionCompare = collator.compare(a.section, b.section);
    if (sectionCompare !== 0) return sectionCompare;

    return getSubmittedAtMillis(a.submittedAt) - getSubmittedAtMillis(b.submittedAt);
  });
}

export function groupResponseExportRowsByGrade(
  rows: ResponseExportRow[],
): Array<{ grade: number | null; label: string; rows: ResponseExportRow[] }> {
  const groups = new Map<number | null, ResponseExportRow[]>();

  for (const row of rows) {
    const grade = row.grade > 0 ? row.grade : null;
    groups.set(grade, [...(groups.get(grade) || []), row]);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      return a - b;
    })
    .map(([grade, groupRows]) => ({
      grade,
      label: grade === null ? '学年未設定' : `${grade}年`,
      rows: sortResponseExportRows(groupRows),
    }));
}
