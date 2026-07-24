'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, User } from 'firebase/auth';
import { AdminLoginFormData } from '@/types';
import { LoadingScreen, LoadingButtonLabel } from '@/components/ui/Loading';
import { ADMIN_EMAIL_PATTERN } from '@/lib/utils/admin/invites';

export default function AdminLogin() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const shouldRecordLoginRef = useRef(false);

  const clearAuthState = async () => {
    try {
      await signOut(auth);
    } catch (signOutError) {
      console.error('サインアウトエラー:', signOutError);
    } finally {
      localStorage.removeItem('authToken');
      setUser(null);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);

      if (currentUser) {
        try {
          const idToken = await currentUser.getIdToken();
          const response = await fetch(
            shouldRecordLoginRef.current ? '/api/auth/verify?recordLogin=1' : '/api/auth/verify',
            {
              headers: { Authorization: `Bearer ${idToken}` },
            },
          );
          shouldRecordLoginRef.current = false;

          if (response.ok) {
            const data = await response.json();
            if (data?.user?.isAdmin) {
              localStorage.setItem('authToken', idToken);
              router.replace('/admin');
            } else {
              setError('管理者権限がありません');
              await clearAuthState();
            }
          } else {
            setError('認証に失敗しました');
            await clearAuthState();
          }
        } catch (authError) {
          shouldRecordLoginRef.current = false;
          console.error('認証チェックエラー:', authError);
          setError('認証チェックに失敗しました');
          await clearAuthState();
        }
      }
    });

    return () => unsubscribe();
  }, [router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AdminLoginFormData>();

  const onSubmit = async (data: AdminLoginFormData) => {
    setIsLoading(true);
    setError('');

    try {
      shouldRecordLoginRef.current = true;
      await signInWithEmailAndPassword(auth, data.email, data.password);
    } catch (error) {
      shouldRecordLoginRef.current = false;
      console.error('エラー内容:', error);
      setError('ログインに失敗しました');
      await clearAuthState();
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return <LoadingScreen />;
  }

  if (user) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">管理者ログイン</h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          kanazawa-it.ac.jp のメールアドレスでログインしてください
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                メールアドレス
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  type="email"
                  placeholder="example@sub.kanazawa-it.ac.jp"
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  {...register('email', {
                    required: 'メールアドレスを入力してください',
                    pattern: {
                      value: ADMIN_EMAIL_PATTERN,
                      message: 'kanazawa-it.ac.jp のメールアドレスを入力してください',
                    },
                  })}
                />
              </div>
              {errors.email && <p className="mt-2 text-sm text-red-600">{errors.email.message}</p>}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                パスワード
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  type="password"
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  {...register('password', {
                    required: 'パスワードを入力してください',
                    minLength: {
                      value: 6,
                      message: 'パスワードは6文字以上で入力してください',
                    },
                  })}
                />
              </div>
              {errors.password && (
                <p className="mt-2 text-sm text-red-600">{errors.password.message}</p>
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
        </div>
        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-50 text-gray-500">または</span>
            </div>
          </div>

          <div className="mt-6">
            <Link
              href="/"
              className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              ← ログインコード入力画面に戻る
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
