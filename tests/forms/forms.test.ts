import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildResponseExportRows,
  expandAvailabilitySlotsForStorage,
  filterEditableFormFieldsForParticipant,
  filterVisibleFormFields,
  formatResponseExportAvailability,
  groupResponseExportRowsByGrade,
  normalizeFormEventContext,
  prepareAnswersForStorage,
  resolveResponseAvailabilitySlots,
  serializeDate,
  sortResponseExportRows,
  toMillis,
  validateFormAnswersPayload,
} from '../../lib/utils/forms/forms';
import type { ParticipantSurveyResponse } from '../../types/forms';

describe('forms utils', () => {
  test('normalizeFormEventContext prefers year and normalizes eventId', () => {
    assert.deepEqual(normalizeFormEventContext('ignored', 2026), {
      eventId: 'kodai2026',
      year: 2026,
    });
    assert.deepEqual(normalizeFormEventContext('ignored', '2027'), {
      eventId: 'kodai2027',
      year: 2027,
    });
  });

  test('normalizeFormEventContext falls back to eventId and rejects invalid context', () => {
    assert.deepEqual(normalizeFormEventContext('kodai2028', undefined), {
      eventId: 'kodai2028',
      year: 2028,
    });
    assert.deepEqual(normalizeFormEventContext('kodai2028', '2028.5'), {
      eventId: 'kodai2028',
      year: 2028,
    });
    assert.equal(normalizeFormEventContext('invalid', undefined), null);
  });

  test('serializeDate and toMillis preserve timestamps consistently', () => {
    const date = new Date('2026-06-21T12:34:56.000Z');
    assert.equal(serializeDate(date), '2026-06-21T12:34:56.000Z');
    assert.equal(serializeDate(0), 0);
    assert.equal(toMillis(date), date.getTime());
    assert.equal(toMillis('2026-06-21T12:34:56.000Z'), date.getTime());
  });

  test('resolveResponseAvailabilitySlots prefers answers availability and falls back to participant data', () => {
    assert.deepEqual(
      resolveResponseAvailabilitySlots(
        [{ fieldId: 'availability', value: ['2026-06-01_am', '2026-06-01_pm'] }],
        ['2026-06-02_am'],
      ),
      ['2026-06-01_am', '2026-06-01_pm'],
    );
    assert.deepEqual(
      resolveResponseAvailabilitySlots([{ fieldId: 'remarks', value: 'ok' }], ['2026-06-02_am']),
      ['2026-06-02_am'],
    );
    assert.deepEqual(resolveResponseAvailabilitySlots([], ['unavailable']), ['unavailable']);
  });

  test('filterVisibleFormFields filters fields by participant grade', () => {
    const fields = [
      { fieldId: 'availability', visibleFromGrade: 1 },
      { fieldId: 'carUsage', visibleFromGrade: 0 },
      { fieldId: 'remarks' },
    ];

    assert.deepEqual(
      filterVisibleFormFields(fields, '2').map((field) => field.fieldId),
      ['availability', 'remarks'],
    );
    assert.deepEqual(
      filterVisibleFormFields(fields, '3').map((field) => field.fieldId),
      ['availability', 'remarks'],
    );
  });

  test('filterVisibleFormFields filters fields by minimum grade', () => {
    const fields = [
      { fieldId: 'availability', visibleFromGrade: 1 },
      { fieldId: 'carUsage', visibleFromGrade: 3 },
      { fieldId: 'remarks' },
    ];

    assert.deepEqual(
      filterVisibleFormFields(fields, '2').map((field) => field.fieldId),
      ['availability', 'remarks'],
    );
    assert.deepEqual(
      filterVisibleFormFields(fields, '3').map((field) => field.fieldId),
      ['availability', 'carUsage', 'remarks'],
    );
  });

  test('filterEditableFormFieldsForParticipant keeps hidden fields with existing answers', () => {
    const fields = [
      { fieldId: 'availability' },
      { fieldId: 'carUsage', visibleFromGrade: 3 },
      { fieldId: 'remarks' },
    ];

    assert.deepEqual(
      filterEditableFormFieldsForParticipant(fields, '2', ['2026-06-01_am'], {
        carUsage: '運転できる',
      }).map((field) => field.fieldId),
      ['availability', 'carUsage', 'remarks'],
    );
    assert.deepEqual(
      filterEditableFormFieldsForParticipant(fields, '2', ['2026-06-01_am'], {}).map(
        (field) => field.fieldId,
      ),
      ['availability', 'remarks'],
    );
  });

  test('expandAvailabilitySlotsForStorage converts all available into date slots', () => {
    assert.deepEqual(
      expandAvailabilitySlotsForStorage(
        ['all_available'],
        ['2026-06-01_am', '2026-06-01_pm', '2026-06-02_am'],
      ),
      ['2026-06-01_am', '2026-06-01_pm', '2026-06-02_am'],
    );
    assert.deepEqual(
      expandAvailabilitySlotsForStorage(
        ['2026-06-01_am', '2026-06-02_pm'],
        ['2026-06-01_am', '2026-06-01_pm', '2026-06-02_am', '2026-06-02_pm'],
      ),
      ['2026-06-01_am', '2026-06-02_pm'],
    );
  });

  test('prepareAnswersForStorage filters invisible answers and expands availability', () => {
    assert.deepEqual(
      prepareAnswersForStorage(
        [
          { fieldId: 'availability', value: ['all_available'] },
          { fieldId: 'remarks', value: 'ok' },
          { fieldId: 'carUsage', value: '運転できる' },
        ],
        new Set(['availability', 'remarks']),
        ['2026-06-01_am', '2026-06-01_pm'],
      ),
      [
        { fieldId: 'availability', value: ['2026-06-01_am', '2026-06-01_pm'] },
        { fieldId: 'remarks', value: 'ok' },
      ],
    );
  });

  test('validateFormAnswersPayload rejects invalid answer entries', () => {
    assert.deepEqual(validateFormAnswersPayload(null), {
      valid: false,
      error: '回答データが正しくありません',
    });
    assert.deepEqual(validateFormAnswersPayload(['oops']), {
      valid: false,
      error: '回答データの形式が正しくありません',
    });
    assert.deepEqual(validateFormAnswersPayload([null]), {
      valid: false,
      error: '回答データの形式が正しくありません',
    });
    assert.deepEqual(validateFormAnswersPayload([{ value: 'ok' }]), {
      valid: false,
      error: '回答データの形式が正しくありません',
    });
    assert.deepEqual(validateFormAnswersPayload([{ fieldId: 'remarks', value: 'ok' }]), {
      valid: true,
    });
  });

  test('sortResponseExportRows sorts by Japanese name and puts blank names last', () => {
    const rows = sortResponseExportRows([
      {
        responseId: '3',
        name: '',
        nameKana: '',
        grade: 1,
        section: 'PR',
        submittedAt: '2026-03-03T00:00:00.000Z',
        availableSlots: [],
      },
      {
        responseId: '2',
        name: 'いとう',
        nameKana: '',
        grade: 2,
        section: '技術',
        submittedAt: '2026-03-02T00:00:00.000Z',
        availableSlots: [],
      },
      {
        responseId: '1',
        name: 'あおき',
        nameKana: '',
        grade: 1,
        section: '企画',
        submittedAt: '2026-03-01T00:00:00.000Z',
        availableSlots: [],
      },
    ]);

    assert.deepEqual(
      rows.map((row) => row.responseId),
      ['1', '2', '3'],
    );
  });

  test('sortResponseExportRows prefers full furigana over kanji display name', () => {
    const rows = sortResponseExportRows([
      {
        responseId: '1',
        name: '山田',
        nameKana: 'やまだ',
        grade: 1,
        section: '企画',
        submittedAt: '2026-03-01T00:00:00.000Z',
        availableSlots: [],
      },
      {
        responseId: '2',
        name: '佐藤',
        nameKana: 'さとう',
        grade: 1,
        section: '技術',
        submittedAt: '2026-03-02T00:00:00.000Z',
        availableSlots: [],
      },
      {
        responseId: '3',
        name: '青木',
        nameKana: 'あおき',
        grade: 1,
        section: 'PR',
        submittedAt: '2026-03-03T00:00:00.000Z',
        availableSlots: [],
      },
    ]);

    assert.deepEqual(
      rows.map((row) => row.responseId),
      ['3', '2', '1'],
    );
  });

  test('buildResponseExportRows extracts participant fields for export', () => {
    const responses: ParticipantSurveyResponse[] = [
      {
        responseId: 'response-1',
        formId: 'form-1',
        answers: [],
        submittedAt: new Date('2026-03-01T00:00:00.000Z'),
        participantData: {
          name: ' 山田 ',
          nameKana: ' やまだ ',
          grade: 3,
          section: ' PR ',
          availableSlots: ['2026-06-01_am', 'unavailable'],
        },
      },
    ];

    assert.deepEqual(buildResponseExportRows(responses), [
      {
        responseId: 'response-1',
        name: '山田',
        nameKana: 'やまだ',
        grade: 3,
        section: 'PR',
        availableSlots: ['2026-06-01_am', 'unavailable'],
        submittedAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ]);
  });

  test('formatResponseExportAvailability formats selected availability slots', () => {
    assert.equal(
      formatResponseExportAvailability({
        responseId: 'response-1',
        name: '山田',
        nameKana: 'やまだ',
        grade: 3,
        section: 'PR',
        availableSlots: ['2026-06-01_am', 'unavailable'],
        submittedAt: new Date('2026-03-01T00:00:00.000Z'),
      }),
      '6/1 午前 ・ 参加不可',
    );
  });

  test('groupResponseExportRowsByGrade groups by ascending grade and sorts rows in each group', () => {
    const groups = groupResponseExportRowsByGrade([
      {
        responseId: '4',
        name: '未設定',
        nameKana: 'みせってい',
        grade: 0,
        section: '4年',
        submittedAt: '2026-03-04T00:00:00.000Z',
        availableSlots: [],
      },
      {
        responseId: '2',
        name: 'いとう',
        nameKana: '',
        grade: 1,
        section: '技術',
        submittedAt: '2026-03-02T00:00:00.000Z',
        availableSlots: [],
      },
      {
        responseId: '3',
        name: 'あおき',
        nameKana: '',
        grade: 2,
        section: '企画',
        submittedAt: '2026-03-03T00:00:00.000Z',
        availableSlots: [],
      },
      {
        responseId: '1',
        name: 'あおき',
        nameKana: '',
        grade: 1,
        section: '企画',
        submittedAt: '2026-03-01T00:00:00.000Z',
        availableSlots: [],
      },
    ]);

    assert.deepEqual(
      groups.map((group) => group.label),
      ['1年', '2年', '学年未設定'],
    );
    assert.deepEqual(
      groups[0].rows.map((row) => row.responseId),
      ['1', '2'],
    );
  });
});
