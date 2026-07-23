'use client';

import { useCallback, useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { LoadingInline } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { ADMIN_EMAIL_PATTERN } from '@/lib/utils/admin/invites';
import { useRequireAdmin } from '@/lib/hooks/useRequireAdmin';

type AdminUser = {
  adminId: string;
  email: string;
  name: string;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export default function AdminInvitePage() {
  const { user, loading: authLoading } = useRequireAdmin();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{
    email: string;
    operation: 'created' | 'updated';
    passwordResetSent: boolean;
  } | null>(null);

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

        {error && !inviteModalOpen && (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => {
                setEmail('');
                setError('');
                setInviteModalOpen(true);
              }}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              管理者を招待
            </button>
            <button
              type="button"
              onClick={() => void loadAdmins()}
              disabled={loadingAdmins}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {loadingAdmins ? '更新中...' : '更新'}
            </button>
          </div>

          {loadingAdmins ? (
            <div className="py-8">
              <LoadingInline />
            </div>
          ) : admins.length === 0 ? (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              管理者ユーザーはまだ登録されていません。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">
                      メールアドレス
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">表示名</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">状態</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">更新日時</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {admins.map((admin) => (
                    <tr key={admin.adminId}>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                        {admin.email || '-'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                        {admin.name || '-'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                            admin.isActive
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {admin.isActive ? '有効' : '無効'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                        {admin.updatedAt ? new Date(admin.updatedAt).toLocaleString('ja-JP') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <Modal
        open={inviteModalOpen}
        onClose={() => {
          if (submitting) return;
          setInviteModalOpen(false);
        }}
        panelClassName="max-w-lg p-6"
      >
        <form onSubmit={submitInvite}>
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-gray-900">管理者を招待</h2>
            <p className="mt-1 text-sm text-gray-600">
              Firebase
              からパスワード再設定メールを送信します。初回はメール内リンクからパスワードを設定します。
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <label className="block text-sm font-medium text-gray-700">メールアドレス</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="example@sub.kanazawa-it.ac.jp"
            className="mt-1 block w-full rounded-md border border-gray-300 px-4 py-3 text-sm"
            autoFocus
          />

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setInviteModalOpen(false)}
              disabled={submitting}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={!email || submitting}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? '送信中...' : '招待メールを送信'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(success)} onClose={() => setSuccess(null)} panelClassName="max-w-md p-6">
        {success && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900">招待を送信しました</h2>
            <p className="mt-3 text-sm text-gray-600">
              {success.email} 宛の管理者登録は完了しました。
            </p>
            {!success.passwordResetSent && (
              <p className="mt-2 text-sm text-amber-700">
                パスワード再設定メールの送信には失敗しました。必要なら手動で再送してください。
              </p>
            )}
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSuccess(null)}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
              >
                閉じる
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
