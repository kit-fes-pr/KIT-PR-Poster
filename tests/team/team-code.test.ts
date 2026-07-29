import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildNextTeamCode, buildTeamCodePrefix } from '../../lib/utils/team/team-code';

describe('team code utils', () => {
  test('buildTeamCodePrefix formats date and am/pm period', () => {
    assert.equal(buildTeamCodePrefix('2026-09-04_am'), '20260904AM');
    assert.equal(buildTeamCodePrefix('2026-09-04_pm'), '20260904PM');
    assert.equal(buildTeamCodePrefix('invalid'), null);
  });

  test('buildNextTeamCode returns the first unused sequence for a slot', () => {
    assert.equal(
      buildNextTeamCode({
        timeSlot: '2026-09-04_am',
        existingCodes: ['20260904AM01', '20260904AM02', '20260904PM01', 'legacy'],
      }),
      '20260904AM03',
    );
  });

  test('buildNextTeamCode fills sequence gaps and keeps at least two digits', () => {
    assert.equal(
      buildNextTeamCode({
        timeSlot: '2026-09-04_pm',
        existingCodes: ['20260904PM01', '20260904PM03'],
      }),
      '20260904PM02',
    );
    assert.equal(
      buildNextTeamCode({
        timeSlot: '2026-09-04_pm',
        existingCodes: Array.from(
          { length: 100 },
          (_, index) => `20260904PM${String(index + 1).padStart(2, '0')}`,
        ),
      }),
      '20260904PM101',
    );
  });

  test('buildNextTeamCode rejects invalid minSequence values', () => {
    assert.equal(
      buildNextTeamCode({
        timeSlot: '2026-09-04_pm',
        existingCodes: [],
        minSequence: 2.5,
      }),
      null,
    );
    assert.equal(
      buildNextTeamCode({
        timeSlot: '2026-09-04_pm',
        existingCodes: [],
        minSequence: 0,
      }),
      null,
    );
  });
});
