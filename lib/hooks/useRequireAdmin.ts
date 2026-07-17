'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { useErrorRecovery } from '@/lib/utils/error-recovery';
import { removeLocalStorageItem, setLocalStorageItem } from '@/lib/utils/browser-storage';

interface UseRequireAdminOptions {
  onRedirect?: (path: string) => void;
}

export function useRequireAdmin(options: UseRequireAdminOptions = {}) {
  const router = useRouter();
  const { onRedirect } = options;
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { handleError, retryOperation } = useErrorRecovery();

  const handleRedirect = (path: string) => {
    if (onRedirect) {
      onRedirect(path);
    } else {
      router.replace(path);
    }
  };

  useEffect(() => {
    let isMounted = true;

    // onAuthStateChanged に一本化することで /api/auth/verify への重複リクエストを防ぐ。
    // Firebase Auth は IndexedDB のローカルキャッシュからユーザー情報を迅速に復元するため、
    // キャッシュトークンの即時検証を分ける必要はない。
    const verifyToken = async (token: string, currentUser: User) => {
      try {
        const response = await retryOperation(
          () =>
            fetch('/api/auth/verify', {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(5000),
            }),
          'require-admin-verify',
          { maxRetries: 2 },
        );

        if (!response.ok) {
          if (isMounted) {
            removeLocalStorageItem('authToken');
            handleRedirect('/admin/login');
          }
          return;
        }

        const data = await response.json();
        if (!data?.user?.isAdmin) {
          if (isMounted) {
            removeLocalStorageItem('authToken');
            handleRedirect('/admin/login');
          }
          return;
        }

        if (isMounted) {
          setLocalStorageItem('authToken', token);
          setUser(currentUser);
          setIsAdmin(true);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        const diagnosis = handleError(err, 'require-admin-verify');
        if (isMounted) {
          if (diagnosis.type === 'auth') {
            removeLocalStorageItem('authToken');
            handleRedirect('/admin/login');
          } else if (diagnosis.recoverable) {
            setError('認証の確認中にエラーが発生しました');
          } else {
            setError('システムエラーが発生しました');
          }
        }
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        if (isMounted) {
          setUser(null);
          setIsAdmin(false);
          removeLocalStorageItem('authToken');
          handleRedirect('/admin/login');
          setLoading(false);
        }
        return;
      }

      try {
        const token = await currentUser.getIdToken(true);
        await verifyToken(token, currentUser);
      } catch (err) {
        console.error('Failed to get token:', err);
        if (isMounted) {
          removeLocalStorageItem('authToken');
          handleRedirect('/admin/login');
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [router, onRedirect, handleError, retryOperation]);

  return { user, loading, authLoading: loading, isAdmin, error };
}
