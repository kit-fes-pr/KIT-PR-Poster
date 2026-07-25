export type AdminUser = {
  adminId: string;
  email: string;
  name: string;
  isActive: boolean;
  isSuspended: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AdminInviteSuccess = {
  email: string;
  operation: 'created' | 'updated';
  passwordResetSent: boolean;
};
