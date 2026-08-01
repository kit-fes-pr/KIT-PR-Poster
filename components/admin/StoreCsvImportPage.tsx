'use client';

import { useMemo, useState, type ChangeEvent } from 'react';
import { useRequireAdmin } from '@/lib/hooks/useRequireAdmin';
import { LoadingInline } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { buildCsvContent, downloadCsvFile } from '@/lib/utils/export/export';

type AddressCandidate = {
  label: string;
  address: string;
  latitude: number;
  longitude: number;
};

type Area = { areaId: string; areaCode: string; areaName: string };
type PreviewRow = {
  rowIndex: number;
  rowNumber: number;
  storeName: string;
  year: number;
  status: 'pending' | 'failed';
  notes: string;
  csvArea: string;
  targetYearValid: boolean;
  matchedAreaCode: string | null;
  areaMatches: Area[];
  areaCandidates: Area[];
  addressCandidates: AddressCandidate[];
};
type PreviewEvent = {
  year: number;
  exists: boolean;
  eventName: string;
  distributionStartDate: string | null;
  distributionEndDate: string | null;
};

function dateInputValue(value: string | null) {
  return value ? value.slice(0, 10) : '';
}

export function StoreCsvImportPage({ targetYear }: { targetYear?: number }) {
  const { user, loading: authLoading } = useRequireAdmin();
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [events, setEvents] = useState<PreviewEvent[]>([]);
  const [areaAssignments, setAreaAssignments] = useState<Record<string, string>>({});
  const [addressSelections, setAddressSelections] = useState<
    Record<string, AddressCandidate | { address: string }>
  >({});
  const [eventDates, setEventDates] = useState<
    Record<string, { startDate: string; endDate: string }>
  >({});
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [addressModalRow, setAddressModalRow] = useState<PreviewRow | null>(null);
  const [manualAddress, setManualAddress] = useState('');
  const [eventDateModalOpen, setEventDateModalOpen] = useState(false);

  const groupedRows = useMemo(() => {
    return rows.reduce<Record<string, PreviewRow[]>>((groups, row) => {
      (groups[row.csvArea] ||= []).push(row);
      return groups;
    }, {});
  }, [rows]);

  const openAddressModal = (row: PreviewRow) => {
    setAddressModalRow(row);
    setManualAddress(addressSelections[String(row.rowIndex)]?.address || '');
  };

  const updateAddressSelection = (row: PreviewRow, candidate: AddressCandidate) => {
    setAddressSelections((current) => ({ ...current, [row.rowIndex]: candidate }));
    setAddressModalRow(null);
  };

  const saveManualAddress = (row: PreviewRow) => {
    const address = manualAddress.trim();
    if (!address) return;
    const matchingCandidate = row.addressCandidates.find(
      (candidate) => candidate.address === address,
    );
    setAddressSelections((current) => ({
      ...current,
      [row.rowIndex]: matchingCandidate || { address },
    }));
    setAddressModalRow(null);
  };

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setCsv(await file.text());
    setRows([]);
    setErrors([]);
    setMessage('');
  };

  const preview = async () => {
    if (!user || !csv) return;
    try {
      setLoading(true);
      setErrors([]);
      setMessage('店舗名から住所候補を検索しています。件数により時間がかかります。');
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/store-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'preview', csv, targetYear }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(data?.errors?.join('\n') || data?.error || 'CSVの確認に失敗しました');

      const nextRows = Array.isArray(data?.rows) ? (data.rows as PreviewRow[]) : [];
      const nextEvents = Array.isArray(data?.events) ? (data.events as PreviewEvent[]) : [];
      setRows(nextRows);
      setEvents(nextEvents);
      setAreaAssignments(
        Object.fromEntries(
          nextRows.map((row) => [String(row.rowIndex), row.matchedAreaCode || '']),
        ),
      );
      setAddressSelections(
        Object.fromEntries(
          nextRows
            .filter((row) => row.addressCandidates[0])
            .map((row) => [String(row.rowIndex), row.addressCandidates[0]]),
        ),
      );
      setEventDates(
        Object.fromEntries(
          nextEvents.map((event) => [
            String(event.year),
            {
              startDate: dateInputValue(event.distributionStartDate),
              endDate: dateInputValue(event.distributionEndDate),
            },
          ]),
        ),
      );
      setEventDateModalOpen(nextEvents.some((event) => !event.exists));
      setErrors(Array.isArray(data?.errors) ? data.errors : []);
      setMessage(`${nextRows.length}件を読み込みました。区域と住所候補を確認してください。`);
    } catch (error) {
      setRows([]);
      setErrors([error instanceof Error ? error.message : 'CSVの確認に失敗しました']);
      setMessage('');
    } finally {
      setLoading(false);
    }
  };

  const importStores = async () => {
    if (!user || rows.length === 0) return;
    try {
      setImporting(true);
      setErrors([]);
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/store-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'import',
          csv,
          targetYear,
          areaAssignments,
          addressSelections,
          eventDates,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(data?.errors?.join('\n') || data?.error || 'CSVの登録に失敗しました');
      setMessage(`${data.imported}件の店舗を登録しました。`);
      setRows([]);
      setCsv('');
      setFileName('');
      setEventDateModalOpen(false);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'CSVの登録に失敗しました']);
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const headers = [['店舗名', '配布年度', '配布可否', '備考', '配布地域']];
    const suffix = targetYear ? `_${targetYear}` : '';
    downloadCsvFile(`店舗インポートテンプレート${suffix}.csv`, buildCsvContent(headers));
  };

  if (authLoading || !user) {
    return <LoadingInline size="lg" />;
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="text-sm font-medium text-gray-500">店舗管理</p>
        <h1 className="text-2xl font-semibold text-gray-900">
          {targetYear ? `${targetYear}年度 店舗CSVインポート` : '店舗CSV一括インポート'}
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          店舗名,配布年度,配布可否,備考,配布地域
          のCSVを読み込みます。配布可否の「可」は未配布、「否」は配布不可として登録します。
        </p>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <label htmlFor="store-csv-file" className="block text-sm font-medium text-gray-700">
              CSVファイル
            </label>
            <input
              id="store-csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void readFile(event)}
              className="mt-2 block w-full text-sm text-gray-700"
            />
            {fileName && <p className="mt-1 text-xs text-gray-500">{fileName}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadTemplate}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              CSVテンプレートをダウンロード
            </button>
            <button
              type="button"
              onClick={() => void preview()}
              disabled={!csv || loading}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? '確認中...' : 'CSVを確認'}
            </button>
          </div>
        </div>
      </section>

      {message && (
        <p className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-700">{message}</p>
      )}
      {errors.length > 0 && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">確認が必要な項目</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {errors.map((error, index) => (
              <li key={`${error}-${index}`}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {events.some((event) => !event.exists) && (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="font-semibold text-amber-900">未作成の年度イベント</h2>
          <p className="mt-1 text-sm text-amber-800">
            配布開始日・終了日を指定すると、基本設定でイベントを作成します。
          </p>
          <button
            type="button"
            onClick={() => setEventDateModalOpen(true)}
            className="mt-4 rounded-md border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100"
          >
            配布日を設定
          </button>
        </section>
      )}

      <Modal
        open={eventDateModalOpen}
        onClose={() => setEventDateModalOpen(false)}
        panelClassName="max-w-2xl p-6"
      >
        <h2 className="text-lg font-semibold text-gray-900">配布日を指定</h2>
        <p className="mt-1 text-sm text-gray-600">
          未作成の年度イベントに使用する配布開始日と終了日を指定してください。
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {events
            .filter((event) => !event.exists)
            .map((event) => (
              <div key={event.year} className="rounded-md border border-gray-200 p-4">
                <p className="text-sm font-semibold text-gray-900">{event.year}年度</p>
                <label className="mt-3 block text-xs font-medium text-gray-600">
                  配布開始日
                  <input
                    type="date"
                    value={eventDates[String(event.year)]?.startDate || ''}
                    onChange={(e) =>
                      setEventDates((current) => ({
                        ...current,
                        [event.year]: {
                          ...(current[String(event.year)] || { endDate: '' }),
                          startDate: e.target.value,
                        },
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="mt-3 block text-xs font-medium text-gray-600">
                  配布終了日
                  <input
                    type="date"
                    value={eventDates[String(event.year)]?.endDate || ''}
                    onChange={(e) =>
                      setEventDates((current) => ({
                        ...current,
                        [event.year]: {
                          ...(current[String(event.year)] || { startDate: '' }),
                          endDate: e.target.value,
                        },
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>
            ))}
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={() => setEventDateModalOpen(false)}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            設定を反映
          </button>
        </div>
      </Modal>

      {Object.keys(groupedRows).length > 0 && (
        <section className="mt-6 space-y-6">
          {Object.entries(groupedRows).map(([csvArea, areaRows]) => (
            <div
              key={csvArea}
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold text-gray-900">CSV配布地域: {csvArea}</h2>
                <span className="text-sm text-gray-500">{areaRows.length}件</span>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500">
                      <th className="px-3 py-2">店舗名</th>
                      <th className="px-3 py-2">状態</th>
                      <th className="px-3 py-2">システム区域</th>
                      <th className="px-3 py-2">住所候補</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {areaRows.map((row) => {
                      const address = addressSelections[String(row.rowIndex)];
                      return (
                        <tr key={row.rowIndex}>
                          <td className="px-3 py-3 font-medium text-gray-900">
                            {row.storeName}
                            <div className="text-xs font-normal text-gray-500">
                              {row.year}年度 / {row.notes || '備考なし'}
                            </div>
                          </td>
                          <td className="px-3 py-3">{row.status === 'pending' ? '可' : '否'}</td>
                          <td className="px-3 py-3">
                            <select
                              value={areaAssignments[String(row.rowIndex)] || ''}
                              onChange={(e) =>
                                setAreaAssignments((current) => ({
                                  ...current,
                                  [row.rowIndex]: e.target.value,
                                }))
                              }
                              className="min-w-40 rounded-md border border-gray-300 px-2 py-2 text-sm"
                            >
                              <option value="">選択してください</option>
                              {row.areaCandidates.map((area) => (
                                <option key={area.areaCode} value={area.areaCode}>
                                  {area.areaCode} / {area.areaName}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => openAddressModal(row)}
                              className={`max-w-xs rounded-md border px-3 py-2 text-left text-sm ${address?.address ? 'border-green-300 bg-green-50 text-green-800' : 'border-amber-300 bg-amber-50 text-amber-900'}`}
                            >
                              {address?.address || '住所候補を確認'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => void importStores()}
            disabled={importing || rows.length === 0}
            className="rounded-md bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importing ? '登録中...' : `${rows.length}件をインポート`}
          </button>
        </section>
      )}

      <Modal
        open={Boolean(addressModalRow)}
        onClose={() => setAddressModalRow(null)}
        panelClassName="max-w-2xl p-6"
      >
        {addressModalRow && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900">住所候補を確認</h2>
            <p className="mt-1 text-sm text-gray-600">
              {addressModalRow.storeName}の候補から正しい住所を選択してください。
            </p>
            <div className="mt-4 space-y-2">
              {addressModalRow.addressCandidates.length === 0 && (
                <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                  候補が見つかりませんでした。住所を手入力して登録してください。
                </p>
              )}
              {addressModalRow.addressCandidates.map((candidate) => {
                const selected =
                  addressSelections[String(addressModalRow.rowIndex)]?.address ===
                  candidate.address;
                return (
                  <button
                    key={`${candidate.latitude}-${candidate.longitude}`}
                    type="button"
                    onClick={() => updateAddressSelection(addressModalRow, candidate)}
                    className={`block w-full rounded-md border p-3 text-left text-sm ${selected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'}`}
                  >
                    <span className="font-medium">
                      {selected ? '選択中: ' : ''}
                      {candidate.address}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-5">
              <label
                htmlFor={`manual-address-${addressModalRow.rowIndex}`}
                className="block text-sm font-medium text-gray-700"
              >
                住所を手入力
              </label>
              <input
                id={`manual-address-${addressModalRow.rowIndex}`}
                type="text"
                value={manualAddress}
                onChange={(event) => setManualAddress(event.target.value)}
                placeholder="石川県金沢市..."
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddressModalRow(null)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700"
              >
                閉じる
              </button>
              <button
                type="button"
                onClick={() => saveManualAddress(addressModalRow)}
                disabled={!manualAddress.trim()}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                この住所で登録
              </button>
            </div>
          </div>
        )}
      </Modal>
    </main>
  );
}
