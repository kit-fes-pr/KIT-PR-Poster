'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { LoginFormData } from '@/types';
import { LoadingButtonLabel } from '@/components/ui/Loading';

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>();

  const resolveDashboardPath = (result: { teamData?: { year?: unknown } }) => {
    const year =
      typeof result.teamData?.year === 'number'
        ? result.teamData.year
        : typeof result.teamData?.year === 'string' && /^\d{4}$/.test(result.teamData.year)
          ? Number(result.teamData.year)
          : null;
    return year ? `/${year}` : '/';
  };

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/team-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (response.ok) {
        try {
          const { auth } = await import('@/lib/firebase');
          const { signInWithEmailAndPassword, getIdToken } = await import('firebase/auth');

          if (result.tempEmail && result.tempPassword) {
            const cred = await signInWithEmailAndPassword(
              auth,
              result.tempEmail,
              result.tempPassword,
            );
            const idToken = await getIdToken(cred.user);
            localStorage.setItem('authToken', idToken);
            router.replace(resolveDashboardPath(result));
            return;
          }

          // フォールバック: 旧仕様（カスタムトークン）
          if (result.customToken) {
            const { signInWithCustomToken } = await import('firebase/auth');
            const cred = await signInWithCustomToken(auth, result.customToken);
            const idToken = await getIdToken(cred.user);
            localStorage.setItem('authToken', idToken);
            router.replace(resolveDashboardPath(result));
            return;
          }

          setError('認証情報の取得に失敗しました');
        } catch (authError) {
          console.error('Authentication failed:', authError);
          setError('認証に失敗しました');
        }
      } else {
        setError(result.error || 'ログインに失敗しました');
      }
    } catch (error) {
      console.error('エラー内容:', error);
      setError('ログインに失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          工大祭ポスター配布管理システム
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">ログインコードを入力してください</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <label htmlFor="teamCode" className="block text-sm font-medium text-gray-700">
                ログインコード
              </label>
              <div className="mt-1">
                <input
                  id="teamCode"
                  type="text"
                  placeholder="例: AM1-2025"
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  {...register('teamCode', {
                    required: 'ログインコードを入力してください',
                  })}
                />
              </div>
              {errors.teamCode && (
                <p className="mt-2 text-sm text-red-600">{errors.teamCode.message}</p>
              )}
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="text-sm text-red-700">{error}</div>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {isLoading ? <LoadingButtonLabel /> : 'ログイン'}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">または</span>
              </div>
            </div>

            <div className="mt-6">
              <Link
                href="/admin/login"
                className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                管理者ログイン
              </Link>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-xs text-gray-500">
              <p className="mb-2">注意事項:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>ログインコードは配布日のみ有効です</li>
                <li>各班に割り当てられたコードを使用してください</li>
                <li>問題がある場合は管理者にお問い合わせください</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
