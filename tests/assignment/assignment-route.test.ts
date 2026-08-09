import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  normalizeAssignmentAuthHeader,
  parseAssignmentDeletePayload,
  parseAssignmentListQuery,
  parseAssignmentMutationPayload,
} from '../../lib/utils/assignment/assignment-route';

describe('assignment route utils', () => {
  test('normalizeAssignmentAuthHeader accepts bearer tokens only', () => {
    assert.equal(normalizeAssignmentAuthHeader('Bearer token-1'), 'token-1');
    assert.equal(normalizeAssignmentAuthHeader('Bearer   token-1'), 'token-1');
    assert.equal(normalizeAssignmentAuthHeader('Basic token-1'), null);
    assert.equal(normalizeAssignmentAuthHeader(null), null);
  });

  test('parseAssignmentListQuery validates year and formId', () => {
    assert.deepEqual(parseAssignmentListQuery(new URLSearchParams('year=2026&formId=form-1')), {
      year: 2026,
      formId: 'form-1',
    });
    const missingYear = parseAssignmentListQuery(new URLSearchParams('formId=form-1'));
    assert.equal('error' in missingYear ? missingYear.error : null, '年度が必要です');
    const invalidYear = parseAssignmentListQuery(new URLSearchParams('year=2026.5'));
    assert.equal('error' in invalidYear ? invalidYear.error : null, '年度が必要です');
  });

  test('parseAssignmentMutationPayload validates mutation payloads', () => {
    assert.deepEqual(
      parseAssignmentMutationPayload({
        year: '2026',
        formId: ' form-1 ',
        responseId: ' response-1 ',
        teamId: ' team-1 ',
        timeSlot: '2026-06-01_am',
      }),
      {
        year: 2026,
        formId: 'form-1',
        responseId: 'response-1',
        targets: [{ teamId: 'team-1', timeSlot: '2026-06-01_am' }],
      },
    );
    assert.deepEqual(
      parseAssignmentMutationPayload({
        year: '2026',
        formId: ' form-1 ',
        responseId: ' response-1 ',
        assignments: [
          { teamId: ' team-1 ', timeSlot: '2026-06-01_am' },
          { teamId: ' team-2 ', timeSlot: '2026-06-01_pm' },
        ],
      }),
      {
        year: 2026,
        formId: 'form-1',
        responseId: 'response-1',
        targets: [
          { teamId: 'team-1', timeSlot: '2026-06-01_am' },
          { teamId: 'team-2', timeSlot: '2026-06-01_pm' },
        ],
      },
    );
    assert.deepEqual(
      parseAssignmentMutationPayload({
        year: '2026',
        formId: ' form-1 ',
        responseId: ' response-1 ',
        assignments: [],
      }),
      {
        year: 2026,
        formId: 'form-1',
        responseId: 'response-1',
        targets: [],
      },
    );
    const invalidYear = parseAssignmentMutationPayload({
      year: '2026.5',
      formId: 'form-1',
      responseId: 'response-1',
      teamId: 'team-1',
    });
    assert.equal('error' in invalidYear ? invalidYear.error : null, '年度が必要です');
    const missingField = parseAssignmentMutationPayload({
      year: '2026',
      formId: '',
      responseId: 'response-1',
      teamId: 'team-1',
    });
    assert.equal(
      'error' in missingField ? missingField.error : null,
      'year, formId, responseId, teamId は必須です',
    );
    const invalidAssignmentList = parseAssignmentMutationPayload({
      year: '2026',
      formId: 'form-1',
      responseId: 'response-1',
      assignments: [{ teamId: ' ' }],
    });
    assert.equal(
      'error' in invalidAssignmentList ? invalidAssignmentList.error : null,
      'year, formId, responseId, teamId は必須です',
    );

    const invalidType = parseAssignmentMutationPayload(null);
    assert.equal('error' in invalidType ? invalidType.error : null, 'リクエストボディが不正です');

    const invalidPrimitive = parseAssignmentMutationPayload('invalid');
    assert.equal(
      'error' in invalidPrimitive ? invalidPrimitive.error : null,
      'リクエストボディが不正です',
    );
  });

  test('parseAssignmentDeletePayload supports clearing all or auto assignments only', () => {
    assert.deepEqual(
      parseAssignmentDeletePayload({
        year: '2026',
        formId: ' form-1 ',
      }),
      {
        year: 2026,
        formId: 'form-1',
        assignedBy: 'all',
      },
    );
    assert.deepEqual(
      parseAssignmentDeletePayload({
        year: '2026',
        formId: ' form-1 ',
        assignedBy: 'auto',
      }),
      {
        year: 2026,
        formId: 'form-1',
        assignedBy: 'auto',
      },
    );

    const invalidYear = parseAssignmentDeletePayload({
      year: '2026.5',
      formId: 'form-1',
    });
    assert.equal('error' in invalidYear ? invalidYear.error : null, '年度が必要です');

    const invalidType = parseAssignmentDeletePayload(null);
    assert.equal('error' in invalidType ? invalidType.error : null, 'リクエストボディが不正です');
  });
});
