import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildAssignmentDashboardMemberStats } from '../../lib/utils/assignment/assignment-dashboard';

describe('assignment dashboard utils', () => {
  test('buildAssignmentDashboardMemberStats groups assignment records by team', () => {
    const stats = buildAssignmentDashboardMemberStats([
      { teamId: 'team-1', responseId: 'response-1' },
      { teamId: 'team-1', responseId: 'response-2' },
      { teamId: 'team-2', responseId: 'response-3' },
    ]);

    assert.equal(stats.totalMembers, 3);
    assert.equal(stats.byTeam['team-1'].count, 2);
    assert.equal(stats.byTeam['team-2'].count, 1);
    assert.deepEqual(stats.byTeam['team-1'].members, [
      { name: '', studentId: 'response-1', grade: '', department: '' },
      { name: '', studentId: 'response-2', grade: '', department: '' },
    ]);
  });
});
