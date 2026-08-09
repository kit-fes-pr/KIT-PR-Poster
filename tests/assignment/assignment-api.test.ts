import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildManualAssignmentRecord,
  buildManualAssignmentRecords,
  normalizeAssignmentYear,
  preserveExistingAssignmentLabels,
} from '../../lib/utils/assignment/assignment-api';

describe('assignment api utils', () => {
  test('normalizeAssignmentYear accepts only 4-digit years', () => {
    assert.equal(normalizeAssignmentYear(2026), 2026);
    assert.equal(normalizeAssignmentYear('2026'), 2026);
    assert.equal(normalizeAssignmentYear('2026.5'), undefined);
    assert.equal(normalizeAssignmentYear('26'), undefined);
    assert.equal(normalizeAssignmentYear(null), undefined);
  });

  test('buildManualAssignmentRecord normalizes manual assignment payloads', () => {
    assert.deepEqual(
      buildManualAssignmentRecord({
        year: '2026',
        formId: ' form-1 ',
        responseId: ' response-1 ',
        teamId: ' team-1 ',
        timeSlot: '2026-06-01_am',
        assignedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
      {
        year: 2026,
        formId: 'form-1',
        responseId: 'response-1',
        teamId: 'team-1',
        timeSlot: '2026-06-01_am',
        assignedAt: new Date('2026-01-01T00:00:00.000Z'),
        assignedBy: 'manual',
      },
    );
  });

  test('buildManualAssignmentRecord rejects invalid input', () => {
    assert.equal(
      buildManualAssignmentRecord({
        year: '2026.5',
        formId: 'form-1',
        responseId: 'response-1',
        teamId: 'team-1',
        timeSlot: '2026-06-01_am',
      }),
      null,
    );
    assert.equal(
      buildManualAssignmentRecord({
        year: '2026',
        formId: 'form-1',
        responseId: 'response-1',
        teamId: 'team-1',
        timeSlot: 'foo',
      }),
      null,
    );
  });

  test('buildManualAssignmentRecords builds multiple unique manual assignments', () => {
    assert.deepEqual(
      buildManualAssignmentRecords({
        year: '2026',
        formId: ' form-1 ',
        responseId: ' response-1 ',
        assignedAt: new Date('2026-01-01T00:00:00.000Z'),
        targets: [
          { teamId: ' team-1 ', timeSlot: '2026-06-01_am' },
          { teamId: ' team-1 ', timeSlot: '2026-06-01_am' },
          { teamId: ' team-2 ', timeSlot: '2026-06-01_pm' },
        ],
      }),
      [
        {
          year: 2026,
          formId: 'form-1',
          responseId: 'response-1',
          teamId: 'team-1',
          timeSlot: '2026-06-01_am',
          assignedAt: new Date('2026-01-01T00:00:00.000Z'),
          assignedBy: 'manual',
        },
        {
          year: 2026,
          formId: 'form-1',
          responseId: 'response-1',
          teamId: 'team-2',
          timeSlot: '2026-06-01_pm',
          assignedAt: new Date('2026-01-01T00:00:00.000Z'),
          assignedBy: 'manual',
        },
      ],
    );
  });

  test('preserveExistingAssignmentLabels keeps auto labels only for assignments that remain selected', () => {
    const assignedAt = new Date('2026-01-01T00:00:00.000Z');
    const nextAssignments = buildManualAssignmentRecords({
      year: '2026',
      formId: 'form-1',
      responseId: 'response-1',
      assignedAt: new Date('2026-02-01T00:00:00.000Z'),
      targets: [
        { teamId: 'team-auto', timeSlot: '2026-06-01_am' },
        { teamId: 'team-new', timeSlot: '2026-06-01_pm' },
      ],
    });
    assert.ok(nextAssignments);

    assert.deepEqual(
      preserveExistingAssignmentLabels(nextAssignments, [
        {
          teamId: 'team-auto',
          assignedAt,
          assignedBy: 'auto',
        },
        {
          teamId: 'team-removed',
          assignedAt,
          assignedBy: 'auto',
        },
      ]).map(({ teamId, assignedAt, assignedBy }) => ({ teamId, assignedAt, assignedBy })),
      [
        { teamId: 'team-auto', assignedAt, assignedBy: 'auto' },
        {
          teamId: 'team-new',
          assignedAt: new Date('2026-02-01T00:00:00.000Z'),
          assignedBy: 'manual',
        },
      ],
    );
  });

  test('preserveExistingAssignmentLabels uses the first matching existing assignment', () => {
    const firstAssignedAt = new Date('2026-01-01T00:00:00.000Z');
    const duplicateAssignedAt = new Date('2026-01-02T00:00:00.000Z');
    const nextAssignments = buildManualAssignmentRecords({
      year: '2026',
      formId: 'form-1',
      responseId: 'response-1',
      assignedAt: new Date('2026-02-01T00:00:00.000Z'),
      targets: [{ teamId: 'team-1', timeSlot: '2026-06-01_am' }],
    });
    assert.ok(nextAssignments);

    assert.deepEqual(
      preserveExistingAssignmentLabels(nextAssignments, [
        {
          teamId: 'team-1',
          assignedAt: firstAssignedAt,
          assignedBy: 'auto',
        },
        {
          teamId: 'team-1',
          assignedAt: duplicateAssignedAt,
          assignedBy: 'manual',
        },
      ]).map(({ teamId, assignedAt, assignedBy }) => ({ teamId, assignedAt, assignedBy })),
      [{ teamId: 'team-1', assignedAt: firstAssignedAt, assignedBy: 'auto' }],
    );
  });
});
