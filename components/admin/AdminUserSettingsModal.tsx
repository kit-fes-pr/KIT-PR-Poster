import { Modal } from '@/components/ui/Modal';
import type { AdminUser } from './admin-users';
import type { AdminUserAction } from '@/lib/utils/admin/invites';

type AdminUserSettingsModalProps = {
  admin: AdminUser | null;
  currentUserId: string;
  editName: string;
  error: string;
  loading: boolean;
  onClose: () => void;
  onEditNameChange: (name: string) => void;
  onAction: (action: AdminUserAction, confirmationMessage?: string) => void;
};

function getStatusLabel(admin: AdminUser) {
  if (admin.isSuspended) return '一時停止';
  if (admin.isActive) return '有効';
  return '権限なし';
}

export function AdminUserSettingsModal({
  admin,
  currentUserId,
  editName,
  error,
  loading,
  onClose,
  onEditNameChange,
  onAction,
}: AdminUserSettingsModalProps) {
  return (
    <Modal
      open={Boolean(admin)}
      onClose={() => {
        if (loading) return;
        onClose();
      }}
      panelClassName="max-w-lg p-6"
    >
      {admin && (
        <div>
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-gray-900">管理者ユーザー設定</h2>
            <p className="mt-1 text-sm text-gray-600">{admin.email || '-'}</p>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <label className="block text-sm font-medium text-gray-700">表示名</label>
          <input
            type="text"
            value={editName}
            onChange={(event) => onEditNameChange(event.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-4 py-3 text-sm"
          />

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="text-gray-500">状態</div>
              <div className="mt-1 font-medium text-gray-900">{getStatusLabel(admin)}</div>
            </div>
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="text-gray-500">更新日時</div>
              <div className="mt-1 font-medium text-gray-900">
                {admin.updatedAt ? new Date(admin.updatedAt).toLocaleString('ja-JP') : '-'}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap justify-between gap-2">
            <button
              type="button"
              onClick={() =>
                onAction('revoke', 'このユーザーの管理者権限を剥奪します。実行しますか？')
              }
              disabled={loading || admin.adminId === currentUserId || !admin.isActive}
              className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              権限を剥奪
            </button>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  onAction(
                    admin.isSuspended ? 'resume' : 'suspend',
                    admin.isSuspended ? undefined : 'このユーザーを一時停止します。実行しますか？',
                  )
                }
                disabled={loading || admin.adminId === currentUserId || !admin.isActive}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {admin.isSuspended ? '再開' : '一時停止'}
              </button>
              <button
                type="button"
                onClick={() => onAction('updateName')}
                disabled={loading || !editName.trim()}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? '保存中...' : '表示名を保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
