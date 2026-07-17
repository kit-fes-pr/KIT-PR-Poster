'use client';

import { useEffect, useMemo } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { LocalCacheManager, createIncrementalFetcher, optimizedSWRConfig } from '@/lib/utils/cache';
import { useTeamRealtimeUpdates } from '@/lib/hooks/useRealtimeData';
import { LoadingInline } from '@/components/ui/Loading';
import { formatTeamAccessPeriod } from '@/lib/utils/team/team-access';

// シングルトンインスタンス
const cacheManager = new LocalCacheManager();
const incrementalFetcher = createIncrementalFetcher(cacheManager);

interface OptimizedTeamManagerProps {
  year: number;
  isAdmin: boolean;
  onTeamUpdate?: (
    teams: Array<{
      teamId: string;
      teamCode: string;
      teamName: string;
      assignedArea: string;
      assignedAreaName?: string;
    }>,
  ) => void;
}

export default function OptimizedTeamManager({
  year,
  isAdmin,
  onTeamUpdate,
}: OptimizedTeamManagerProps) {
  const { mutate } = useSWRConfig();

  // リアルタイム更新を有効化
  const { isListening } = useTeamRealtimeUpdates(year, isAdmin);

  // 差分取得でチームデータを取得
  const {
    data: teams,
    error,
    isLoading,
    mutate: mutateTeams,
  } = useSWR(isAdmin ? `/api/admin/teams?year=${year}` : null, incrementalFetcher, {
    ...optimizedSWRConfig,
    onSuccess: (data) => {
      const teams = Array.isArray(data) ? data : [];
      console.log(`チームデータ取得成功 (${teams.length}件)`);
      onTeamUpdate?.(teams);
    },
    onError: (error) => {
      console.error('チームデータ取得エラー:', error);
      // キャッシュをクリアして次回フル取得
      cacheManager.removeCache(`admin_teams_incremental_year_${year}`);
    },
  });

  // ソートされたチーム一覧
  const sortedTeams = useMemo(() => {
    if (!teams || !Array.isArray(teams)) return [];

    return [...teams].sort((a, b) => {
      const codeA = String(a.teamCode || '').toLowerCase();
      const codeB = String(b.teamCode || '').toLowerCase();

      // AM、PMの順序を定義
      const getOrderPriority = (code: string) => {
        if (code.includes('am')) return 1;
        if (code.includes('pm')) return 2;
        return 3;
      };

      const priorityA = getOrderPriority(codeA);
      const priorityB = getOrderPriority(codeB);

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      return codeA.localeCompare(codeB);
    });
  }, [teams]);

  // 手動更新機能
  const forceRefresh = async () => {
    const cacheKey = `admin_teams_incremental_year_${year}`;
    cacheManager.removeCache(cacheKey);
    await mutateTeams();
    mutate(cacheKey); // SWR cache invalidation
  };

  // 定期的なキャッシュクリーンアップ
  useEffect(() => {
    const cleanup = setInterval(
      () => {
        // 古いキャッシュを削除（デバッグ用）
        console.log('キャッシュクリーンアップ実行');
      },
      5 * 60 * 1000,
    ); // 5分間隔

    return () => clearInterval(cleanup);
  }, []);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <h3 className="text-red-800 font-medium">データ取得エラー</h3>
        <p className="text-red-600 text-sm mt-1">{error.message}</p>
        <button
          onClick={forceRefresh}
          className="mt-2 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
        >
          再試行
        </button>
      </div>
    );
  }

  if (isLoading && !teams) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
        <LoadingInline className="text-blue-800" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* チーム一覧 */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 border-b border-gray-200">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            チーム一覧 ({sortedTeams.length}件)
          </h3>
          {isListening && <p className="mt-1 text-sm text-green-600">リアルタイム更新が有効です</p>}
        </div>

        {sortedTeams.length === 0 ? (
          <div className="text-center py-8 text-gray-500">チームが登録されていません</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    チームコード
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    チーム名
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    配置エリア
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    アクセス期間
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    最終更新
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedTeams.map((team) => (
                  <tr key={team.teamId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {team.teamCode}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {team.teamName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {team.assignedAreaName || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatTeamAccessPeriod(team)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {(() => {
                        try {
                          const date = team.updatedAt ? new Date(team.updatedAt) : null;
                          return date ? date.toLocaleDateString('ja-JP') : '-';
                        } catch {
                          return '-';
                        }
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
