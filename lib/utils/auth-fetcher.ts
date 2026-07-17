'use client';

import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { setLocalStorageItem } from '@/lib/utils/browser-storage';

function waitForCurrentUser() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);

  return new Promise<User | null>((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

export async function getFreshAuthToken(forceRefresh = false) {
  const user = await waitForCurrentUser();
  if (!user) throw new Error('認証が必要です');

  const token = await user.getIdToken(forceRefresh);
  setLocalStorageItem('authToken', token);
  return token;
}

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = await getFreshAuthToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);

  let response = await fetch(input, { ...init, headers });
  if (response.status !== 401) return response;

  const refreshedToken = await getFreshAuthToken(true);
  headers.set('Authorization', `Bearer ${refreshedToken}`);
  response = await fetch(input, { ...init, headers });
  return response;
}

export async function fetcherAuth(url: string) {
  const response = await authenticatedFetch(url);
  if (!response.ok) throw new Error('認証が必要です');
  return response.json();
}
