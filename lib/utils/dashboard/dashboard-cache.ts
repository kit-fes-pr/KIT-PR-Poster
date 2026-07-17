import { mutate } from 'swr';

export interface DashboardTeam {
  teamId: string;
  teamCode: string;
  teamName: string;
  timeSlot?: string;
  assignedArea: string;
  assignedAreaName?: string;
  memberCount?: number;
  validStartDate?: string;
  validEndDate?: string;
}

export interface ProgressiveDashboardCache {
  cacheVersion?: number;
  minimalData: {
    event: {
      id: string;
      eventName: string;
      year: number;
      distributionStartDate?: string;
      distributionEndDate?: string;
    } | null;
    stats?: {
      totalTeams: number;
      totalMembers: number;
      totalResponses?: number;
      availableResponses?: number;
      totalAreas?: number;
      isMinimal?: boolean;
      loadedTeams?: number;
    };
    performance: {
      responseTime: number;
      dataFreshnessTime: string;
      isMinimalResponse?: boolean;
    };
    teams?: DashboardTeam[];
    progressive?: {
      progress: number;
      hasMore: boolean;
      isLoading: boolean;
    };
  } | null;
  progressiveTeams: DashboardTeam[];
  loadingProgress: number;
  totalExpected: number;
  hasMore: boolean;
  cachedAt: number;
}

const DASHBOARD_CACHE_PREFIX = 'kitpr_dashboard_cache_';
const DASHBOARD_CACHE_VERSION = 4;

function getKey(year: number) {
  return `${DASHBOARD_CACHE_PREFIX}${year}`;
}

export function readDashboardCache(year: number): ProgressiveDashboardCache | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(getKey(year));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as ProgressiveDashboardCache;
    if (parsed.cacheVersion !== DASHBOARD_CACHE_VERSION) {
      clearDashboardCache(year);
      return null;
    }

    if (!parsed?.cachedAt || Date.now() - parsed.cachedAt > 30 * 60 * 1000) {
      clearDashboardCache(year);
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn('ダッシュボードキャッシュ読込失敗:', error);
    return null;
  }
}

export function writeDashboardCache(
  year: number,
  cache: Omit<ProgressiveDashboardCache, 'cachedAt'>,
): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(
      getKey(year),
      JSON.stringify({
        ...cache,
        cacheVersion: DASHBOARD_CACHE_VERSION,
        cachedAt: Date.now(),
      }),
    );
  } catch (error) {
    console.warn('ダッシュボードキャッシュ保存失敗:', error);
  }
}

export function clearDashboardCache(year: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(getKey(year));
    // SWRキャッシュをその年度に絞って無効化
    mutate(
      (key) => typeof key === 'string' && key.includes(`/api/admin/dashboard/${year}`),
      undefined,
      { revalidate: true },
    );
  } catch (error) {
    console.warn('ダッシュボードキャッシュ削除失敗:', error);
  }
}

export function clearAllDashboardCaches(): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(DASHBOARD_CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));

    // SWRキャッシュをワイルドカードで無効化
    mutate((key) => typeof key === 'string' && key.includes('/api/admin/dashboard/'), undefined, {
      revalidate: true,
    });
  } catch (error) {
    console.warn('ダッシュボードキャッシュの一括削除失敗:', error);
  }
}
