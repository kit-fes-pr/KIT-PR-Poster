'use client';

import { useEffect, useState } from 'react';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
  type User,
} from 'firebase/auth';

type AdminProfileSettingsProps = {
  user: User;
  onNameSaved: (name: string) => void;
};

export function AdminProfileSettings({ user, onNameSaved }: AdminProfileSettingsProps) {
  const [name, setName] = useState(user.displayName || '');
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setName(user.displayName || '');
  }, [user]);

  const saveName = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName) {
      setError('表示名を入力してください');
      setMessage('');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setMessage('');
      const token = await user.getIdToken(true);
      const response = await fetch('/api/admin/invites', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          adminId: user.uid,
          action: 'updateName',
          name: nextName,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || '表示名の保存に失敗しました');
      }

      await updateProfile(user, { displayName: nextName });
      setName(nextName);
      onNameSaved(nextName);
      setMessage('表示名を保存しました');
    } catch (err) {
      setError(err instanceof Error ? err.message : '表示名の保存に失敗しました');
      setMessage('');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user.email) {
      setError('メールアドレスが取得できません');
      setMessage('');
      return;
    }
    if (newPassword.length < 6) {
      setError('新しいパスワードは6文字以上で入力してください');
      setMessage('');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('新しいパスワードと確認入力が一致しません');
      setMessage('');
      return;
    }

    try {
      setPasswordSaving(true);
      setError('');
      setMessage('');
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage('パスワードを変更しました');
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
      const errorMessage =
        code === 'auth/invalid-credential' || code === 'auth/wrong-password'
          ? '現在のパスワードが正しくありません'
          : code === 'auth/requires-recent-login'
            ? '安全のため、いったんログアウトしてから再度ログインしてください'
            : code === 'auth/weak-password'
              ? '新しいパスワードが弱すぎます。6文字以上で設定してください'
              : 'パスワードの変更に失敗しました';
      setError(errorMessage);
      setMessage('');
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
      <div className="mb-6">
        <p className="text-sm font-medium text-indigo-600">アカウント設定</p>
        <h2 className="mt-1 text-xl font-semibold text-gray-900">管理者情報</h2>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {message}
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <form className="space-y-3" onSubmit={saveName}>
          <div>
            <label htmlFor="admin-display-name" className="block text-sm font-medium text-gray-700">
              表示名
            </label>
            <input
              id="admin-display-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? '保存中...' : '表示名を保存'}
          </button>
        </form>

        <div>
          <div>
            <span className="block text-sm font-medium text-gray-700">メールアドレス</span>
            <p className="mt-1 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {user.email || '-'}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 border-t border-gray-200 pt-6">
        <h3 className="text-base font-semibold text-gray-900">パスワード変更</h3>
        <p className="mt-1 text-sm text-gray-600">現在のパスワードを確認してから変更します。</p>
        <form className="mt-4 grid gap-4 md:grid-cols-3" onSubmit={changePassword}>
          <div>
            <label
              htmlFor="admin-current-password"
              className="block text-sm font-medium text-gray-700"
            >
              現在のパスワード
            </label>
            <input
              id="admin-current-password"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="admin-new-password" className="block text-sm font-medium text-gray-700">
              新しいパスワード
            </label>
            <input
              id="admin-new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="admin-confirm-password"
              className="block text-sm font-medium text-gray-700"
            >
              新しいパスワード（確認）
            </label>
            <input
              id="admin-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={passwordSaving}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {passwordSaving ? '変更中...' : 'パスワードを変更'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
