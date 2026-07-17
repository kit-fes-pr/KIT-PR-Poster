import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildTeamRouteCreatePayload,
  buildTeamRouteListQuery,
  buildTeamRouteUpdatePayload,
  normalizeTeamRouteAuthHeader,
} from '../../lib/utils/team/team-route';

describe('team route utils', () => {
  test('normalizeTeamRouteAuthHeader accepts bearer tokens only', () => {
    assert.equal(normalizeTeamRouteAuthHeader('Bearer token-1'), 'token-1');
    assert.equal(normalizeTeamRouteAuthHeader('Bearer   token-1'), 'token-1');
    assert.equal(normalizeTeamRouteAuthHeader('Basic token-1'), null);
    assert.equal(normalizeTeamRouteAuthHeader(null), null);
  });

  test('buildTeamRouteListQuery resolves event and year scopes', () => {
    const customEvent = buildTeamRouteListQuery({
      eventIdParam: 'custom-event',
      yearParam: '2026',
    });
    assert.equal(customEvent.scope, '');
    assert.equal(customEvent.targetEventId, 'custom-event');
    assert.equal(customEvent.targetYear, 2026);
    assert.equal(customEvent.normalizedYear, 2026);

    const yearFallback = buildTeamRouteListQuery({ eventIdParam: '', yearParam: '2026' });
    assert.equal(yearFallback.scope, '');
    assert.equal(yearFallback.targetEventId, 'kodai2025');
    assert.equal(yearFallback.targetYear, 2026);
    assert.equal(yearFallback.normalizedYear, 2026);
  });

  test('buildTeamRouteCreatePayload normalizes create payloads', () => {
    const created = buildTeamRouteCreatePayload({
      teamCode: ' T-01 ',
      teamName: ' チームA ',
      timeSlot: '2026-06-01_am',
      areaId: 'area-1',
      assignedArea: 'A-01',
      eventId: 'kodai2026',
      year: '2026',
      area: {
        areaId: 'area-1',
        areaCode: ' A-01 ',
        adjacentAreas: 'A-02, A-03,',
      },
      eventAvailabilitySlots: ['2026-06-01_am', '2026-06-01_pm'],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    assert.ok(!('error' in created));
    if ('error' in created) throw new Error(String(created.error));
    assert.equal(created.data.teamCode, 'T-01');
    assert.equal(created.data.teamName, 'チームA');
    assert.equal(created.data.timeSlot, '2026-06-01_am');
    assert.equal(created.data.eventId, 'kodai2026');
    assert.equal(created.data.year, 2026);
    assert.deepEqual(created.data.adjacentAreas, ['A-02', 'A-03']);
  });

  test('buildTeamRouteUpdatePayload normalizes update payloads', () => {
    const updated = buildTeamRouteUpdatePayload({
      teamName: ' 更新後 ',
      teamCode: 'T-02',
      timeSlot: '2026-06-01_pm',
      isActive: false,
      areaId: 'area-1',
      assignedArea: 'A-01',
      area: {
        areaId: 'area-1',
        areaCode: 'A-01',
        adjacentAreas: ['A-02', '', 'A-03'],
      },
      eventAvailabilitySlots: ['2026-06-01_am', '2026-06-01_pm'],
      updatedAt: new Date('2026-02-01T00:00:00.000Z'),
    });

    assert.ok(!('error' in updated));
    if ('error' in updated) throw new Error(String(updated.error));
    assert.equal(updated.update.teamName, ' 更新後 ');
    assert.equal(updated.update.teamCode, 'T-02');
    assert.equal(updated.update.timeSlot, '2026-06-01_pm');
    assert.equal(updated.update.validStartDate, '2026-06-01T08:00:00+09:00');
    assert.equal(updated.update.validEndDate, '2026-06-01T21:00:00+09:00');
    assert.equal(updated.update.accessWindowVersion, 1);
    assert.equal(updated.update.isActive, false);
    assert.equal(updated.update.areaId, 'area-1');
    assert.deepEqual(updated.update.adjacentAreas, ['A-02', 'A-03']);
  });
});
