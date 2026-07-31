'use client';

import { useRequireAdmin } from '@/lib/hooks/useRequireAdmin';
import { LoadingScreen } from '@/components/ui/Loading';
import { AdminProfileSettings } from '@/components/admin/AdminProfileSettings';

export default function AdminSettingsPage() {
  const { user, loading: authLoading } = useRequireAdmin();

  if (authLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <LoadingScreen />;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="text-sm font-medium text-gray-500">Admin</p>
        <h1 className="text-2xl font-semibold text-gray-900">アカウント設定</h1>
      </div>
      <AdminProfileSettings user={user} />
    </main>
  );
}
