export function getBrowserLocalStorage(): Storage | null {
  return typeof window !== 'undefined' ? window.localStorage : null;
}

export function getLocalStorageItem(key: string): string | null {
  return getBrowserLocalStorage()?.getItem(key) ?? null;
}

export function setLocalStorageItem(key: string, value: string) {
  getBrowserLocalStorage()?.setItem(key, value);
}

export function removeLocalStorageItem(key: string) {
  getBrowserLocalStorage()?.removeItem(key);
}
