import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildDeletedTeamLogData,
  buildTeamCreateData,
  buildTeamUpdateData,
  normalizeTeamYear,
  resolveTeamAreaSelection,
  shouldBlockTeamDeletion,
} from '../../lib/utils/team/team-api';

describe('team api utils', () => {
  test('normalizeTeamYear accepts only 4-digit integers', () => {
    assert.equal(normalizeTeamYear(2026), 2026);
    assert.equal(normalizeTeamYear('2026'), 2026);
    assert.equal(normalizeTeamYear('2026.5'), undefined);
    assert.equal(normalizeTeamYear('26'), undefined);
    assert.equal(normalizeTeamYear(null), undefined);
  });

  test('resolveTeamAreaSelection prefers resolved area data', () => {
    assert.deepEqual(
      resolveTeamAreaSelection({
        areaId: 'area-raw',
        assignedArea: 'A-01',
        area: {
          areaId: 'area-doc',
          areaCode: ' A-02 ',
          adjacentAreas: 'A-03, A-04,',
        },
      }),
      {
        areaId: 'area-doc',
        assignedArea: 'A-02',
        adjacentAreas: ['A-03', 'A-04'],
      },
    );
    assert.equal(
      resolveTeamAreaSelection({
        areaId: '',
        assignedArea: '',
        area: null,
      }),
      null,
    );
    assert.equal(
      resolveTeamAreaSelection({
        areaId: 'some-area-id',
        assignedArea: 'A-01',
        area: null,
      }),
      null,
    );
  });

  test('buildTeamCreateData and buildTeamUpdateData normalize payloads', () => {
    const area = {
      areaId: 'area-1',
      assignedArea: 'A-01',
      adjacentAreas: ['A-02', '', 'A-03'],
    };
    assert.deepEqual(
      buildTeamCreateData({
        teamCode: ' T-01 ',
        teamName: ' チームA ',
        timeSlot: '2026-06-01_am',
        eventId: 'kohdai2026',
        year: '2026',
        area,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      }),
      {
        teamCode: 'T-01',
        teamName: 'チームA',
        timeSlot: '2026-06-01_am',
        areaId: 'area-1',
        assignedArea: 'A-01',
        adjacentAreas: ['A-02', 'A-03'],
        eventId: 'kohdai2026',
        year: 2026,
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    );
    assert.deepEqual(
      buildTeamUpdateData({
        teamName: '更新後',
        teamCode: 'T-02',
        year: '2027',
        timeSlot: '2026-06-01_pm',
        isActive: false,
        area,
        updatedAt: new Date('2026-02-01T00:00:00.000Z'),
      }),
      {
        updatedAt: new Date('2026-02-01T00:00:00.000Z'),
        teamName: '更新後',
        teamCode: 'T-02',
        year: 2027,
        timeSlot: '2026-06-01_pm',
        isActive: false,
        areaId: 'area-1',
        assignedArea: 'A-01',
        adjacentAreas: ['A-02', 'A-03'],
      },
    );
  });

  test('buildTeamUpdateData rejects invalid timeSlot', () => {
    assert.throws(
      () =>
        buildTeamUpdateData({
          timeSlot: 'foo',
        }),
      /timeSlot is invalid/,
    );
  });

  test('buildDeletedTeamLogData normalizes year and preserves timestamp', () => {
    assert.deepEqual(
      buildDeletedTeamLogData({
        teamId: 'team-1',
        teamCode: 'T-01',
        teamName: 'チームA',
        year: '2026',
        deletedBy: 'admin-1',
        deletedAt: new Date('2026-03-01T00:00:00.000Z'),
      }),
      {
        teamId: 'team-1',
        teamCode: 'T-01',
        teamName: 'チームA',
        year: 2026,
        deletedAt: new Date('2026-03-01T00:00:00.000Z'),
        deletedBy: 'admin-1',
      },
    );
  });

  test('shouldBlockTeamDeletion blocks teams with distribution stores', () => {
    assert.equal(shouldBlockTeamDeletion({ distributionStoresExist: true }), true);
    assert.equal(shouldBlockTeamDeletion({ distributionStoresExist: false }), false);
  });
});
