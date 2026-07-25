'use client';

import { useCallback, useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { LoadingInline } from '@/components/ui/Loading';
import { ADMIN_EMAIL_PATTERN } from '@/lib/utils/admin/invites';
import { useRequireAdmin } from '@/lib/hooks/useRequireAdmin';
import { AdminInviteModal } from '@/components/admin/AdminInviteModal';
import { AdminInviteSuccessModal } from '@/components/admin/AdminInviteSuccessModal';
import { AdminUsersTable } from '@/components/admin/AdminUsersTable';
import { AdminUserSettingsModal } from '@/components/admin/AdminUserSettingsModal';
import type { AdminInviteSuccess, AdminUser } from '@/components/admin/admin-users';
import type { AdminUserAction } from '@/lib/utils/admin/invites';

export default function AdminInvitePage() {
  const { user, loading: authLoading } = useRequireAdmin();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<AdminUser | null>(null);
  const [editName, setEditName] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<AdminInviteSuccess | null>(null);

  const loadAdmins = useCallback(async () => {
    if (!user) return;

    try {
      setLoadingAdmins(true);
      setError('');
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/invites', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || '管理者ユーザー一覧の取得に失敗しました');
      }
      setAdmins(Array.isArray(data?.admins) ? data.admins : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '管理者ユーザー一覧の取得に失敗しました');
    } finally {
      setLoadingAdmins(false);
    }
  }, [user]);

  useEffect(() => {
    void loadAdmins();
  }, [loadAdmins]);

  const submitInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!user || !normalizedEmail) return;

    if (!ADMIN_EMAIL_PATTERN.test(normalizedEmail)) {
      setError('kanazawa-it.ac.jp のメールアドレスを入力してください');
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      const token = await user.getIdToken(true);
      const response = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || '招待に失敗しました');
      }

      let passwordResetSent = true;
      try {
        auth.languageCode = 'ja';
        await sendPasswordResetEmail(auth, normalizedEmail);
      } catch (sendError) {
        passwordResetSent = false;
        console.error('パスワード再設定メールの送信に失敗しました:', sendError);
      }

      setSuccess({
        ...(data?.invite || { email: normalizedEmail, operation: 'created' }),
        passwordResetSent,
      });
      setEmail('');
      setInviteModalOpen(false);
      await loadAdmins();
    } catch (err) {
      setError(err instanceof Error ? err.message : '招待に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const openAdminModal = (admin: AdminUser) => {
    setSelectedAdmin(admin);
    setEditName(admin.name || '');
    setError('');
  };

  const submitAdminAction = async (action: AdminUserAction, confirmationMessage?: string) => {
    if (!user || !selectedAdmin) return;
    if (confirmationMessage && !window.confirm(confirmationMessage)) return;

    try {
      setActionLoading(true);
      setError('');
      const token = await user.getIdToken(true);
      const response = await fetch('/api/admin/invites', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          adminId: selectedAdmin.adminId,
          action,
          name: editName,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || '管理者ユーザーの更新に失敗しました');
      }

      await loadAdmins();
      setSelectedAdmin(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '管理者ユーザーの更新に失敗しました');
    } finally {
      setActionLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingInline size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingInline size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div>
          <p className="text-sm font-medium text-gray-500">Admin</p>
          <h1 className="text-2xl font-semibold text-gray-900">管理者ユーザー管理</h1>
        </div>

        {error && !inviteModalOpen && !selectedAdmin && (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <AdminUsersTable
          admins={admins}
          loading={loadingAdmins}
          onRefresh={() => void loadAdmins()}
          onInvite={() => {
            setEmail('');
            setError('');
            setInviteModalOpen(true);
          }}
          onSelectAdmin={openAdminModal}
        />
      </div>

      <AdminInviteModal
        open={inviteModalOpen}
        email={email}
        error={error}
        submitting={submitting}
        onClose={() => setInviteModalOpen(false)}
        onEmailChange={setEmail}
        onSubmit={submitInvite}
      />

      <AdminUserSettingsModal
        admin={selectedAdmin}
        currentUserId={user.uid}
        editName={editName}
        error={error}
        loading={actionLoading}
        onClose={() => setSelectedAdmin(null)}
        onEditNameChange={setEditName}
        onAction={(action, confirmationMessage) =>
          void submitAdminAction(action, confirmationMessage)
        }
      />

      <AdminInviteSuccessModal success={success} onClose={() => setSuccess(null)} />
    </div>
  );
}
