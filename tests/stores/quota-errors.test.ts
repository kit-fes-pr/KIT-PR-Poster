import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { isFirestoreQuotaExceeded } from '../../lib/utils/stores/quota-errors';

describe('Firestore quota error handling', () => {
  test('recognizes Firestore gRPC quota code 8', () => {
    assert.equal(isFirestoreQuotaExceeded({ code: 8 }), true);
  });

  test('recognizes Firebase client resource-exhausted codes', () => {
    assert.equal(isFirestoreQuotaExceeded({ code: 'resource-exhausted' }), true);
    assert.equal(isFirestoreQuotaExceeded({ code: 'RESOURCE_EXHAUSTED' }), true);
  });

  test('recognizes quota wording', () => {
    assert.equal(isFirestoreQuotaExceeded(new Error('Quota exceeded.')), true);
  });

  test('does not misreport unrelated errors', () => {
    assert.equal(isFirestoreQuotaExceeded({ code: 'PERMISSION_DENIED' }), false);
    assert.equal(isFirestoreQuotaExceeded(new Error('Network unavailable')), false);
    assert.equal(isFirestoreQuotaExceeded(null), false);
  });
});
