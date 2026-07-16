import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildFormCreateRecord,
  buildFormResponseRecord,
  buildFormUpdateRecord,
  normalizeFormAuthHeader,
  validateFormFields,
} from '../../lib/utils/forms/forms-api';

describe('forms api utils', () => {
  test('normalizeFormAuthHeader accepts bearer tokens only', () => {
    assert.equal(normalizeFormAuthHeader('Bearer token-1'), 'token-1');
    assert.equal(normalizeFormAuthHeader('Bearer   token-1'), 'token-1');
    assert.equal(normalizeFormAuthHeader('Basic token-1'), null);
    assert.equal(normalizeFormAuthHeader(null), null);
  });

  test('validateFormFields validates required field structure', () => {
    assert.equal(
      validateFormFields([
        { label: '参加可能日時', type: 'checkbox', required: true, options: ['a'] },
      ]),
      null,
    );
    assert.equal(validateFormFields([]), 'フォームフィールドを最低1つ設定してください');
    assert.equal(
      validateFormFields([{ label: ' ', type: 'text', required: true }]),
      'フィールド1のラベルは必須です',
    );
    assert.equal(
      validateFormFields([{ label: 'A', type: 'unknown' as never, required: true }]),
      'フィールド1の種類が無効です',
    );
    assert.equal(validateFormFields([null]), 'フィールド1のデータ形式が無効です');
    assert.equal(validateFormFields(['not-an-object']), 'フィールド1のデータ形式が無効です');
    assert.equal(
      validateFormFields([
        { label: 'A', type: 'select', required: true, options: 'not-an-array' as never },
      ]),
      'フィールド1の選択肢を設定してください',
    );
  });

  test('buildFormCreateRecord and buildFormUpdateRecord normalize payloads', () => {
    const create = buildFormCreateRecord({
      title: '  配布アンケート ',
      description: '  説明 ',
      fields: [
        {
          type: 'checkbox',
          label: '参加可能日時',
          required: true,
          options: ['A', 'B'],
          validation: {},
          visibleFromGrade: 2,
          order: 0,
        },
        {
          type: 'radio',
          label: '車の運転ができますか',
          required: true,
          options: ['運転できる', '免許はあるが運転しない', '免許を持っていない'],
          validation: {},
          visibleFromGrade: 3,
          order: 1,
        },
        {
          type: 'textarea',
          label: '備考',
          required: false,
          validation: {},
          order: 2,
        },
      ],
      eventId: '',
      year: 2026,
      createdBy: 'admin-1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    assert.ok(!('error' in create));
    assert.equal(create.data.eventId, 'kodai2026');
    assert.equal(create.data.title, '配布アンケート');
    assert.equal(create.data.description, '説明');
    assert.equal(create.data.responseCount, 0);
    assert.equal(create.data.fields[0].fieldId, 'availability');
    assert.equal(create.data.fields[0].visibleFromGrade, 2);
    assert.equal(create.data.fields[1].fieldId, 'carUsage');
    assert.equal(create.data.fields[1].visibleFromGrade, 3);
    assert.equal(create.data.fields[2].fieldId, 'remarks');

    const update = buildFormUpdateRecord({
      title: ' 更新後 ',
      description: ' 説明2 ',
      isActive: false,
      fields: [
        {
          fieldId: 'availability',
          type: 'checkbox',
          label: '参加可能日時',
          required: true,
          options: ['A', 'B'],
          validation: {},
          visibleFromGrade: 2,
          order: 0,
        },
        {
          fieldId: 'carUsage',
          type: 'radio',
          label: '車の運転ができますか',
          required: true,
          options: ['運転できる', '免許はあるが運転しない', '免許を持っていない'],
          validation: {},
          visibleFromGrade: 3,
          order: 1,
        },
        {
          fieldId: 'remarks',
          type: 'textarea',
          label: '備考',
          required: false,
          validation: {},
          order: 2,
        },
      ],
      updatedAt: new Date('2026-02-01T00:00:00.000Z'),
    });
    assert.equal(update.error, null);
    assert.equal(update.updateFields.title, '更新後');
    assert.equal(update.updateFields.description, '説明2');
    assert.equal(update.updateFields.isActive, false);
    assert.deepEqual(update.updateFields.updatedAt, new Date('2026-02-01T00:00:00.000Z'));
    assert.equal(
      (update.updateFields.fields as Array<{ fieldId: string }>)[0].fieldId,
      'availability',
    );
    assert.equal(
      (update.updateFields.fields as Array<{ visibleFromGrade?: number }>)[0].visibleFromGrade,
      2,
    );
    assert.equal((update.updateFields.fields as Array<{ fieldId: string }>)[1].fieldId, 'carUsage');
    assert.equal((update.updateFields.fields as Array<{ fieldId: string }>)[2].fieldId, 'remarks');
  });

  test('buildFormResponseRecord normalizes response payloads', () => {
    assert.deepEqual(
      buildFormResponseRecord({
        formId: 'form-1',
        answers: [{ fieldId: 'availability', value: ['A'] }],
        editToken: 'token-1',
        now: new Date('2026-03-01T00:00:00.000Z'),
      }),
      {
        formId: 'form-1',
        answers: [{ fieldId: 'availability', value: ['A'] }],
        submittedAt: new Date('2026-03-01T00:00:00.000Z'),
        editToken: 'token-1',
        submitterInfo: {},
      },
    );
    assert.deepEqual(
      buildFormResponseRecord({
        formId: 'form-1',
        answers: [{ fieldId: 'availability', value: ['A'] }],
        participantData: {
          name: '山田',
          section: '1年',
          grade: '3',
          availableSlots: ['2026-06-01_am'],
        },
        editToken: 'token-2',
        now: new Date('2026-03-01T00:00:00.000Z'),
      }),
      {
        formId: 'form-1',
        answers: [{ fieldId: 'availability', value: ['A'] }],
        submittedAt: new Date('2026-03-01T00:00:00.000Z'),
        editToken: 'token-2',
        submitterInfo: {},
        participantData: {
          name: '山田',
          nameKana: '',
          section: '1年',
          grade: 3,
          availableSlots: ['2026-06-01_am'],
        },
      },
    );
  });
});
