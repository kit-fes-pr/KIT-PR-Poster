/** Identify Firestore quota failures without exposing provider internals to clients. */
export function isFirestoreQuotaExceeded(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = String(candidate.code ?? '').toUpperCase();
  if (code === '8' || code === 'RESOURCE_EXHAUSTED' || code === 'RESOURCE-EXHAUSTED') {
    return true;
  }

  const message = [
    typeof candidate.message === 'string' ? candidate.message : '',
    typeof candidate.details === 'string' ? candidate.details : '',
  ].join(' ');

  return /(?:quota exceeded|quota has been exceeded|resource exhausted|daily quota)/i.test(message);
}
