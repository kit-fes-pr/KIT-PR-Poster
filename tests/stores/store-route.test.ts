import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { validateTeamForStoreCreate } from '../../lib/utils/stores/store-route';

describe('store route utils', () => {
  test('validateTeamForStoreCreate rejects missing teams even when targetYear is omitted', () => {
    const result = validateTeamForStoreCreate({
      exists: false,
      targetYear: null,
      targetEventId: null,
    });

    assert.deepEqual(result, {
      ok: false,
      status: 404,
      error: '班が見つかりません',
    });
  });

  test('validateTeamForStoreCreate rejects inactive teams even when targetYear is omitted', () => {
    const result = validateTeamForStoreCreate({
      exists: true,
      data: {
        teamCode: 'AM1-2026',
        isActive: false,
        assignedArea: 'A-01',
        eventId: 'kodai2026',
      },
      targetYear: null,
      targetEventId: null,
    });

    assert.deepEqual(result, {
      ok: false,
      status: 403,
      error: '無効な班では店舗を登録できません',
    });
  });

  test('validateTeamForStoreCreate resolves active team defaults', () => {
    const result = validateTeamForStoreCreate({
      exists: true,
      data: {
        isActive: true,
        year: 2026,
        assignedArea: 'A-01',
        eventId: 'kodai2026',
      },
      targetYear: 2026,
      targetEventId: 'kodai2026',
    });

    assert.deepEqual(result, {
      ok: true,
      assignedArea: 'A-01',
      eventId: 'kodai2026',
    });
  });

  test('validateTeamForStoreCreate rejects teams outside the requested year', () => {
    const result = validateTeamForStoreCreate({
      exists: true,
      data: {
        isActive: true,
        year: 2025,
        eventId: 'kodai2025',
      },
      targetYear: 2026,
      targetEventId: 'kodai2026',
    });

    assert.deepEqual(result, {
      ok: false,
      status: 404,
      error: '班が見つかりません',
    });
  });
});
