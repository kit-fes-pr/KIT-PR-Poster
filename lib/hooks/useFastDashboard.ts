'use client';

import { mutate as swrMutate } from 'swr';
import { DashboardTeam, writeDashboardCache } from '@/lib/utils/dashboard/dashboard-cache';
import { getLocalStorageItem } from '@/lib/utils/browser-storage';

// プリロード機能
export function preloadDashboard(year: number) {
  const token = getLocalStorageItem('authToken');
  if (!token || !year) return;

  const minimalKey = `/api/admin/dashboard/${year}/minimal`;
  const progressiveKey = `/api/admin/dashboard/${year}/progressive?offset=0&limit=10&includeMembers=true`;

  // バックグラウンドで最小限のデータだけ先に取得
  Promise.allSettled([
    fetch(minimalKey, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((res) => (res.ok ? res.json() : null)),
    fetch(progressiveKey, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((res) => (res.ok ? res.json() : null)),
  ])
    .then((results) => {
      const minimalResult = results[0].status === 'fulfilled' ? results[0].value : null;
      const progressiveResult = results[1].status === 'fulfilled' ? results[1].value : null;

      if (minimalResult) {
        swrMutate(minimalKey, minimalResult, false);
      }
      if (minimalResult) {
        const totalTeams = Number(
          (minimalResult as { stats?: { totalTeams?: number } }).stats?.totalTeams || 0,
        );
        const progressiveTeams = Array.isArray(
          (progressiveResult as { teams?: DashboardTeam[] } | null)?.teams,
        )
          ? ((progressiveResult as { teams?: DashboardTeam[] } | null)?.teams as DashboardTeam[])
          : [];
        writeDashboardCache(year, {
          minimalData: minimalResult,
          progressiveTeams,
          loadingProgress:
            totalTeams > 0 ? Math.min(100, (progressiveTeams.length / totalTeams) * 100) : 0,
          totalExpected: totalTeams,
          hasMore: Boolean(
            (progressiveResult as { pagination?: { hasMore?: boolean } } | null)?.pagination
              ?.hasMore,
          ),
        });
      }
      console.log(`📦 年度${year}のダッシュボードデータをプリロードしました`);
    })
    .catch((err) => {
      console.warn('プリロード失敗:', err);
    });
}
