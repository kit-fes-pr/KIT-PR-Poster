import { Modal } from '@/components/ui/Modal';

type AdminInviteModalProps = {
  open: boolean;
  email: string;
  error: string;
  submitting: boolean;
  onClose: () => void;
  onEmailChange: (email: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function AdminInviteModal({
  open,
  email,
  error,
  submitting,
  onClose,
  onEmailChange,
  onSubmit,
}: AdminInviteModalProps) {
  return (
    <Modal
      open={open}
      onClose={() => {
        if (submitting) return;
        onClose();
      }}
      panelClassName="max-w-lg p-6"
    >
      <form onSubmit={onSubmit}>
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-gray-900">管理者を招待</h2>
          <p className="mt-1 text-sm text-gray-600">
            Firebase
            からパスワード再設定メールを送信します。初回はメール内リンクからパスワードを設定します。
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <label className="block text-sm font-medium text-gray-700">メールアドレス</label>
        <input
          type="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          placeholder="example@sub.kanazawa-it.ac.jp"
          className="mt-1 block w-full rounded-md border border-gray-300 px-4 py-3 text-sm"
          autoFocus
        />

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={!email || submitting}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? '送信中...' : '招待メールを送信'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
