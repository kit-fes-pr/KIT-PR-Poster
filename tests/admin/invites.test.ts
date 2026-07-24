import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ADMIN_EMAIL_PATTERN,
  buildAdminInviteDisplayName,
  buildAdminInviteLogPayload,
  buildAdminUserView,
  buildAdminRecordCreatePayload,
  buildAdminRecordUpdatePayload,
  normalizeAdminDisplayName,
  normalizeAdminInviteEmail,
  normalizeAdminUserAction,
} from '../../lib/utils/admin/invites';

describe('admin invite utils', () => {
  test('ADMIN_EMAIL_PATTERN accepts kanazawa-it.ac.jp addresses only', () => {
    assert.equal(ADMIN_EMAIL_PATTERN.test('admin@sub.kanazawa-it.ac.jp'), true);
    assert.equal(ADMIN_EMAIL_PATTERN.test('admin@kanazawa-it.ac.jp'), true);
    assert.equal(ADMIN_EMAIL_PATTERN.test('admin@example.com'), false);
  });

  test('normalizeAdminInviteEmail trims and validates email addresses', () => {
    assert.equal(
      normalizeAdminInviteEmail('  ADMIN@Sub.Kanazawa-IT.ac.jp '),
      'admin@sub.kanazawa-it.ac.jp',
    );
    assert.equal(normalizeAdminInviteEmail('admin@example.com'), '');
    assert.equal(normalizeAdminInviteEmail(null), '');
  });

  test('buildAdminInviteDisplayName derives the local part', () => {
    assert.equal(buildAdminInviteDisplayName('alice@example.com'), 'alice');
    assert.equal(buildAdminInviteDisplayName('example.com'), 'example.com');
  });

  test('normalizeAdminUserAction and display name validate admin management inputs', () => {
    assert.equal(normalizeAdminUserAction('updateName'), 'updateName');
    assert.equal(normalizeAdminUserAction('suspend'), 'suspend');
    assert.equal(normalizeAdminUserAction('resume'), 'resume');
    assert.equal(normalizeAdminUserAction('revoke'), 'revoke');
    assert.equal(normalizeAdminUserAction('delete'), null);
    assert.equal(normalizeAdminDisplayName(' admin '), 'admin');
    assert.equal(normalizeAdminDisplayName(null), '');
  });

  test('buildAdminRecordCreatePayload and update payload preserve the expected shape', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');

    assert.deepEqual(
      buildAdminRecordCreatePayload({
        adminId: 'uid-1',
        email: 'admin@sub.kanazawa-it.ac.jp',
        displayName: 'admin',
        now,
      }),
      {
        adminId: 'uid-1',
        email: 'admin@sub.kanazawa-it.ac.jp',
        name: 'admin',
        isActive: true,
        isSuspended: false,
        createdAt: now,
        updatedAt: now,
      },
    );

    assert.deepEqual(
      buildAdminRecordUpdatePayload({
        email: 'admin@sub.kanazawa-it.ac.jp',
        displayName: 'admin',
        now,
      }),
      {
        email: 'admin@sub.kanazawa-it.ac.jp',
        name: 'admin',
        isActive: true,
        isSuspended: false,
        updatedAt: now,
      },
    );
  });

  test('buildAdminInviteLogPayload keeps invite log fields stable', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');

    assert.deepEqual(
      buildAdminInviteLogPayload({
        email: 'admin@sub.kanazawa-it.ac.jp',
        displayName: 'admin',
        invitedBy: 'owner@kanazawa-it.ac.jp',
        operation: 'created',
        uid: 'uid-1',
        now,
      }),
      {
        email: 'admin@sub.kanazawa-it.ac.jp',
        name: 'admin',
        invitedBy: 'owner@kanazawa-it.ac.jp',
        invitedAt: now,
        operation: 'created',
        uid: 'uid-1',
      },
    );
  });

  test('buildAdminUserView serializes admin records for the management page', () => {
    const view = buildAdminUserView('uid-1', {
      email: 'admin@sub.kanazawa-it.ac.jp',
      name: 'admin',
      isActive: true,
      createdAt: {
        toDate: () => new Date('2026-07-22T00:00:00.000Z'),
      },
      updatedAt: new Date('2026-07-22T01:00:00.000Z'),
    });

    assert.deepEqual(view, {
      adminId: 'uid-1',
      email: 'admin@sub.kanazawa-it.ac.jp',
      name: 'admin',
      isActive: true,
      isSuspended: false,
      createdAt: '2026-07-22T00:00:00.000Z',
      updatedAt: '2026-07-22T01:00:00.000Z',
    });
  });

  test('buildAdminUserView reflects auth suspension state', () => {
    const view = buildAdminUserView(
      'uid-1',
      {
        email: 'admin@sub.kanazawa-it.ac.jp',
        name: 'admin',
        isActive: false,
      },
      { disabled: true },
    );

    assert.equal(view.isActive, false);
    assert.equal(view.isSuspended, true);
  });
});
