'use client';

import { useEffect, useRef } from 'react';
import { useSWRConfig } from 'swr';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, WhereFilterOp } from 'firebase/firestore';

interface RealtimeOptions {
  enabled?: boolean;
  collection: string;
  filters?: Array<{ field: string; operator: WhereFilterOp; value: unknown }>;
  swrKeys?: string[]; // 更新時に再検証するSWRキー
}

export function useRealtimeUpdates({
  enabled = true,
  collection: collectionName,
  filters = [],
  swrKeys = [],
}: RealtimeOptions) {
  const { mutate } = useSWRConfig();
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Callers often create new array literals on every render. Comparing them by
  // reference causes unsubscribe/subscribe loops and unnecessary Firestore reads.
  // Re-subscribe only when the actual query configuration changes.
  const filtersKey = JSON.stringify(filters);
  const swrKeysKey = JSON.stringify(swrKeys);

  useEffect(() => {
    if (!enabled) return;

    try {
      const stableFilters = JSON.parse(filtersKey) as RealtimeOptions['filters'];
      const stableSWRKeys = JSON.parse(swrKeysKey) as string[];
      let q = query(collection(db, collectionName));

      // フィルタを適用
      stableFilters?.forEach((filter) => {
        q = query(q, where(filter.field, filter.operator, filter.value));
      });

      // 更新日時でソート
      q = query(q, orderBy('updatedAt', 'desc'));

      // リアルタイムリスナーを設定
      unsubscribeRef.current = onSnapshot(
        q,
        (snapshot) => {
          let hasChanges = false;

          snapshot.docChanges().forEach((change) => {
            if (
              change.type === 'added' ||
              change.type === 'modified' ||
              change.type === 'removed'
            ) {
              hasChanges = true;
            }
          });

          if (hasChanges) {
            console.log(`リアルタイム更新検出: ${collectionName}`);

            // 関連するSWRキャッシュを無効化
            stableSWRKeys.forEach((key) => {
              mutate(key);
            });

            // 汎用的なキーも無効化
            mutate((key) => typeof key === 'string' && key.includes(collectionName));
          }
        },
        (error) => {
          console.error('リアルタイム更新エラー:', error);
          // エラー時は5秒後にSWRを再検証
          setTimeout(() => {
            stableSWRKeys.forEach((key) => mutate(key));
          }, 5000);
        },
      );

      console.log(`リアルタイム更新開始: ${collectionName}`);
    } catch (error) {
      console.error('リアルタイムリスナー設定エラー:', error);
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
        console.log(`リアルタイム更新停止: ${collectionName}`);
      }
    };
  }, [enabled, collectionName, filtersKey, swrKeysKey, mutate]);

  return {
    isListening: !!unsubscribeRef.current,
  };
}

// チーム専用のリアルタイムHook
export function useTeamRealtimeUpdates(year?: number, enabled = true) {
  const filters = year ? [{ field: 'year', operator: '==' as WhereFilterOp, value: year }] : [];
  const swrKeys = year
    ? [
        `/api/admin/teams?year=${year}`,
        `/api/admin/teams/incremental?year=${year}`,
        `/api/admin/current-year-total?year=${year}&includeStores=1`,
      ]
    : [];

  return useRealtimeUpdates({
    enabled,
    collection: 'teams',
    filters,
    swrKeys,
  });
}

// イベント専用のリアルタイムHook
export function useEventRealtimeUpdates(enabled = true) {
  return useRealtimeUpdates({
    enabled,
    collection: 'events',
    swrKeys: ['/api/admin/events', '/api/admin/events/latest'],
  });
}
