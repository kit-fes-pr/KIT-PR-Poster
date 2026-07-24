import { LoadingInline } from '@/components/ui/Loading';
import type { AdminUser } from './admin-users';

type AdminUsersTableProps = {
  admins: AdminUser[];
  loading: boolean;
  onRefresh: () => void;
  onInvite: () => void;
  onSelectAdmin: (admin: AdminUser) => void;
};

function getAdminStatus(admin: AdminUser) {
  if (admin.isSuspended) {
    return {
      label: '一時停止',
      className: 'bg-amber-50 text-amber-700',
    };
  }
  if (admin.isActive) {
    return {
      label: '有効',
      className: 'bg-emerald-50 text-emerald-700',
    };
  }
  return {
    label: '権限なし',
    className: 'bg-gray-100 text-gray-600',
  };
}

export function AdminUsersTable({
  admins,
  loading,
  onRefresh,
  onInvite,
  onSelectAdmin,
}: AdminUsersTableProps) {
  return (
    <section className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onInvite}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          管理者を招待
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? '更新中...' : '更新'}
        </button>
      </div>

      {loading ? (
        <div className="py-8">
          <LoadingInline />
        </div>
      ) : admins.length === 0 ? (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          管理者ユーザーはまだ登録されていません。
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">メールアドレス</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">表示名</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">状態</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">更新日時</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {admins.map((admin) => {
                const status = getAdminStatus(admin);
                return (
                  <tr
                    key={admin.adminId}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectAdmin(admin)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelectAdmin(admin);
                      }
                    }}
                    className="cursor-pointer hover:bg-gray-50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                      {admin.email || '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                      {admin.name || '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                      {admin.updatedAt ? new Date(admin.updatedAt).toLocaleString('ja-JP') : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
