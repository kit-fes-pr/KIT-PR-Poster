export const ADMIN_EMAIL_PATTERN = /^[^\s@]+@(?:[^\s@]+\.)*kanazawa-it\.ac\.jp$/i;

export function normalizeAdminInviteEmail(email: unknown): string {
  if (typeof email !== 'string') return '';
  const normalized = email.trim().toLowerCase();
  return ADMIN_EMAIL_PATTERN.test(normalized) ? normalized : '';
}

export function buildAdminInviteDisplayName(email: string): string {
  return email.split('@')[0] || '';
}

export function buildAdminRecordUpdatePayload(params: {
  email: string;
  displayName: string;
  now: Date;
}): {
  adminId?: string;
  email: string;
  name: string;
  isActive: true;
  isSuspended: false;
  updatedAt: Date;
} {
  return {
    email: params.email,
    name: params.displayName,
    isActive: true,
    isSuspended: false,
    updatedAt: params.now,
  };
}

export type AdminUserAction = 'updateName' | 'suspend' | 'resume' | 'revoke';

export function normalizeAdminUserAction(value: unknown): AdminUserAction | null {
  if (value === 'updateName' || value === 'suspend' || value === 'resume' || value === 'revoke') {
    return value;
  }
  return null;
}

export function normalizeAdminDisplayName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function buildAdminRecordCreatePayload(params: {
  adminId: string;
  email: string;
  displayName: string;
  now: Date;
}) {
  return {
    adminId: params.adminId,
    email: params.email,
    name: params.displayName,
    isActive: true,
    isSuspended: false,
    createdAt: params.now,
    updatedAt: params.now,
  };
}

export function buildAdminInviteLogPayload(params: {
  email: string;
  displayName: string;
  invitedBy: string;
  operation: 'created' | 'updated';
  uid: string;
  now: Date;
}) {
  return {
    email: params.email,
    name: params.displayName,
    invitedBy: params.invitedBy,
    invitedAt: params.now,
    operation: params.operation,
    uid: params.uid,
  };
}

function serializeAdminDateValue(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    const date = (value as { toDate: () => Date }).toDate();
    return date instanceof Date ? date.toISOString() : null;
  }
  if (typeof value === 'string') return value;
  return null;
}

export function buildAdminUserView(
  id: string,
  data: Record<string, unknown>,
  authUser?: { email?: string; displayName?: string; disabled?: boolean },
) {
  return {
    adminId: typeof data.adminId === 'string' && data.adminId ? data.adminId : id,
    email: typeof data.email === 'string' ? data.email : authUser?.email || '',
    name: typeof data.name === 'string' ? data.name : authUser?.displayName || '',
    isActive: data.isActive !== false,
    isSuspended: data.isSuspended === true || authUser?.disabled === true,
    createdAt: serializeAdminDateValue(data.createdAt),
    updatedAt: serializeAdminDateValue(data.updatedAt),
  };
}
