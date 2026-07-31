'use client';

import { useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Modal } from '@/components/ui/Modal';
import { StorePlacePicker } from '@/components/dashboard/StorePlacePicker';
import { StoreFormData } from '@/types';
import { authenticatedFetch } from '@/lib/utils/auth-fetcher';

type StoreCreateModalProps = {
  open: boolean;
  year?: number;
  initialPlace?: {
    name: string;
    address: string;
    latitude?: number;
    longitude?: number;
  } | null;
  showPlacePicker?: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function toOptionalNumber(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function StoreCreateModal({
  open,
  year,
  initialPlace,
  showPlacePicker = true,
  onClose,
  onSaved,
}: StoreCreateModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<StoreFormData>({
    defaultValues: {
      distributionStatus: 'pending',
      distributedCount: 0,
      requiresPosterPickup: false,
    },
  });

  const watchStatus = watch('distributionStatus');

  useEffect(() => {
    if (!open || !initialPlace) return;
    reset({
      storeName: initialPlace.name,
      address: initialPlace.address,
      latitude: initialPlace.latitude,
      longitude: initialPlace.longitude,
      distributionStatus: 'pending',
      distributedCount: 0,
      requiresPosterPickup: false,
    });
  }, [initialPlace, open, reset]);

  const applySelectedPlace = useCallback(
    (place: { name: string; address: string; latitude?: number; longitude?: number }) => {
      setValue('storeName', place.name, { shouldDirty: true, shouldValidate: true });
      setValue('address', place.address, { shouldDirty: true, shouldValidate: true });
      if (typeof place.latitude === 'number') {
        setValue('latitude', place.latitude, { shouldDirty: true, shouldValidate: true });
      }
      if (typeof place.longitude === 'number') {
        setValue('longitude', place.longitude, { shouldDirty: true, shouldValidate: true });
      }
    },
    [setValue],
  );

  const submitStore = async (data: StoreFormData) => {
    const params = year ? `?year=${encodeURIComponent(String(year))}` : '';
    try {
      const response = await authenticatedFetch(`/api/stores${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          latitude: toOptionalNumber(data.latitude),
          longitude: toOptionalNumber(data.longitude),
          distributedCount:
            data.distributionStatus === 'completed' ? Number(data.distributedCount || 0) : 0,
          requiresPosterPickup:
            data.distributionStatus === 'completed' && data.requiresPosterPickup === true,
          failureReason: data.distributionStatus === 'failed' ? data.failureReason : undefined,
          notes: data.notes,
        }),
      });
      if (response.ok) {
        reset();
        onClose();
        onSaved();
        return;
      }
      const error = await response.json();
      alert(error.error || '店舗の登録に失敗しました');
    } catch (error) {
      console.error('エラー内容:', error);
      alert('店舗の登録に失敗しました');
    }
  };

  return (
    <Modal open={open} onClose={onClose} panelClassName="max-w-3xl p-6">
      <div className="w-full">
        <h2 className="mb-4 text-lg font-medium">新規店舗を追加</h2>
        <form className="space-y-4" onSubmit={handleSubmit(submitStore)}>
          {showPlacePicker && <StorePlacePicker onSelectPlace={applySelectedPlace} />}
          <input type="hidden" {...register('latitude', { valueAsNumber: true })} />
          <input type="hidden" {...register('longitude', { valueAsNumber: true })} />
          <div>
            <label className="block text-sm font-medium text-gray-700">店名</label>
            <input
              type="text"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              {...register('storeName', { required: '店名は必須です' })}
            />
            {errors.storeName && (
              <p className="text-sm text-red-600">{String(errors.storeName.message)}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">住所</label>
            <input
              type="text"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              {...register('address', { required: '住所は必須です' })}
            />
            {errors.address && (
              <p className="text-sm text-red-600">{String(errors.address.message)}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">配布状態</label>
            <select
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              {...register('distributionStatus', { required: true })}
            >
              <option value="pending">未配布</option>
              <option value="completed">配布完了</option>
              <option value="failed">配布不可</option>
            </select>
          </div>
          {watchStatus === 'completed' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700">配布枚数</label>
                <input
                  type="number"
                  min={1}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                  {...register('distributedCount', {
                    required: '配布枚数は必須です',
                    min: { value: 1, message: '1以上を入力してください' },
                  })}
                />
                {errors.distributedCount && (
                  <p className="text-sm text-red-600">{String(errors.distributedCount.message)}</p>
                )}
              </div>
              <label className="flex items-start gap-3 rounded-md border border-gray-200 p-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600"
                  {...register('requiresPosterPickup')}
                />
                <span className="block text-sm font-medium text-gray-900">
                  工大祭終了後にポスター回収が必要
                </span>
              </label>
            </>
          )}
          {watchStatus === 'failed' && (
            <div>
              <label className="block text-sm font-medium text-gray-700">配布不可理由</label>
              <select
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                {...register('failureReason', { required: '理由を選択してください' })}
              >
                <option value="absent">不在</option>
                <option value="refused">断られた</option>
                <option value="closed">閉店</option>
                <option value="other">その他</option>
              </select>
              {errors.failureReason && (
                <p className="text-sm text-red-600">{String(errors.failureReason.message)}</p>
              )}
            </div>
          )}
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded bg-gray-200 px-4 py-2 text-gray-800"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"
            >
              {isSubmitting ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
