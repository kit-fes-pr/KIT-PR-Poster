import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildCurrentYearTotalPayload,
  buildCurrentYearTotalStoreView,
  normalizeCurrentYearTotalAuthHeader,
  resolveCurrentYearTotalTargetEventId,
} from '../lib/utils/current-year-total-route';

describe('current-year-total route utils', () => {
  test('normalizeCurrentYearTotalAuthHeader accepts bearer tokens only', () => {
    assert.equal(normalizeCurrentYearTotalAuthHeader('Bearer token-1'), 'token-1');
    assert.equal(normalizeCurrentYearTotalAuthHeader('Bearer   token-1'), 'token-1');
    assert.equal(normalizeCurrentYearTotalAuthHeader('Basic token-1'), null);
    assert.equal(normalizeCurrentYearTotalAuthHeader(null), null);
  });

  test('resolveCurrentYearTotalTargetEventId prefers body eventId and parses year', () => {
    const resolved = resolveCurrentYearTotalTargetEventId({
      eventIdBody: ' event-2026 ',
      yearBody: '2026',
      fallbackEventId: 'fallback-event',
    });

    assert.equal(resolved.targetEventId, 'event-2026');
    assert.equal(resolved.targetYear, 2026);
  });

  test('buildCurrentYearTotalPayload summarizes store statuses', () => {
    const payload = buildCurrentYearTotalPayload({
      eventId: 'event-1',
      year: 2026,
      stores: [
        { distributionStatus: 'completed', distributedCount: 2, requiresPosterPickup: true },
        { distributionStatus: 'failed', distributedCount: 1 },
        { distributionStatus: 'revisit', distributedCount: '3' as unknown as number },
        { distributionStatus: 'pending', distributedCount: 4 },
        { distributionStatus: 'completed', distributedCount: undefined as unknown as number },
      ],
      updatedAt: new Date('2026-06-21T00:00:00.000Z'),
    });

    assert.equal(payload.eventId, 'event-1');
    assert.equal(payload.year, 2026);
    assert.equal(payload.totalStores, 5);
    assert.equal(payload.completedStores, 3);
    assert.equal(payload.failedStores, 1);
    assert.equal(payload.revisitStores, 2);
    assert.equal(payload.pendingStores, 1);
    assert.equal(payload.totalDistributedCount, 10);
    assert.equal(payload.updatedAt.toISOString(), '2026-06-21T00:00:00.000Z');
  });

  test('buildCurrentYearTotalStoreView resolves display names from teams', () => {
    const view = buildCurrentYearTotalStoreView({
      stores: [
        { distributedBy: 'T-01', areaCode: 'A-01' },
        { distributedBy: 'T-02', areaCode: 'A-02' },
      ],
      teamsByCode: {
        'T-01': 'チーム1',
      },
      teamsByArea: {
        'A-01': [{ code: 'T-01', name: 'チーム1' }],
        'A-02': [{ code: 'T-02', name: 'チーム2' }],
      },
    });

    assert.deepEqual(view[0].distributedByName, 'チーム1');
    assert.deepEqual(view[0].assignedTeams, ['チーム1（T-01）']);
    assert.deepEqual(view[1].distributedByName, null);
    assert.deepEqual(view[1].assignedTeams, ['チーム2（T-02）']);
  });
});
