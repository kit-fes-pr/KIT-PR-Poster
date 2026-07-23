import { Modal } from '@/components/ui/Modal';
import type { AdminInviteSuccess } from './admin-users';

type AdminInviteSuccessModalProps = {
  success: AdminInviteSuccess | null;
  onClose: () => void;
};

export function AdminInviteSuccessModal({ success, onClose }: AdminInviteSuccessModalProps) {
  return (
    <Modal open={Boolean(success)} onClose={onClose} panelClassName="max-w-md p-6">
      {success && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900">招待を送信しました</h2>
          <p className="mt-3 text-sm text-gray-600">
            {success.email} 宛の管理者登録は完了しました。
          </p>
          {!success.passwordResetSent && (
            <p className="mt-2 text-sm text-amber-700">
              パスワード再設定メールの送信には失敗しました。必要なら手動で再送してください。
            </p>
          )}
          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
