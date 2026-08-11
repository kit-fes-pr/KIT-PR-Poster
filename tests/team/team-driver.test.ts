import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { selectTeamDriverResponseId } from '../../lib/utils/team/team-driver';

describe('team driver selection', () => {
  test('prefers an auto-assigned driver who can drive', () => {
    assert.equal(
      selectTeamDriverResponseId([
        { responseId: 'manual-driver', grade: 4, canDrive: true, assignedBy: 'manual' },
        { responseId: 'auto-driver', grade: 2, canDrive: true, assignedBy: 'auto' },
      ]),
      'auto-driver',
    );
  });

  test('ignores members who cannot drive', () => {
    assert.equal(
      selectTeamDriverResponseId([
        { responseId: 'not-driver', grade: 4, canDrive: false },
        { responseId: 'driver', grade: 2, canDrive: true },
      ]),
      'driver',
    );
  });

  test('returns undefined when no member can drive', () => {
    assert.equal(
      selectTeamDriverResponseId([{ responseId: 'member', grade: 3, canDrive: false }]),
      undefined,
    );
  });
});
