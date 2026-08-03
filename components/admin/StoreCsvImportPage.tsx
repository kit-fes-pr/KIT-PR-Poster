'use client';

import { useMemo, useState, type ChangeEvent } from 'react';
import { useRequireAdmin } from '@/lib/hooks/useRequireAdmin';
import { LoadingInline } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { buildCsvContent, downloadCsvFile } from '@/lib/utils/export/export';

type AddressCandidate = {
  label: string;
  address: string;
  latitude?: number;
  longitude?: number;
  source: 'saved' | 'geocoding' | 'csv';
};

type Area = { areaId: string; areaCode: string; areaName: string };
type PreviewRow = {
  rowIndex: number;
  rowNumber: number;
  storeName: string;
  year: number;
  status: 'completed' | 'failed';
  notes: string;
  csvArea: string;
  address: string;
  targetYearValid: boolean;
  matchedAreaCode: string | null;
  areaMatches: Area[];
  areaCandidates: Area[];
  addressCandidates: AddressCandidate[];
};
type PreviewEvent = {
  year: number;
  eventId: string;
  exists: boolean;
  eventName: string;
  distributionStartDate: string | null;
  distributionEndDate: string | null;
  availabilitySlots: string[];
};

type TeamOption = {
  teamId: string;
  teamCode: string;
  teamName: string;
  assignedArea: string;
  eventId: string;
  year: number;
  timeSlot: string;
};

type TeamAssignment = {
  teamId?: string;
  create?: boolean;
  timeSlot?: string;
};

type RowEdit = Pick<PreviewRow, 'storeName' | 'status' | 'notes'>;

function dateInputValue(value: string | null) {
  return value ? value.slice(0, 10) : '';
}

export function StoreCsvImportPage({ targetYear }: { targetYear?: number }) {
  const { user, loading: authLoading } = useRequireAdmin();
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [availableTeams, setAvailableTeams] = useState<TeamOption[]>([]);
  const [rowEdits, setRowEdits] = useState<Record<string, RowEdit>>({});
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
  const [teamAssignmentModalOpen, setTeamAssignmentModalOpen] = useState(false);
  const [teamAssignments, setTeamAssignments] = useState<Record<string, TeamAssignment>>({});

  const groupedRows = useMemo(() => {
    return rows.reduce<Record<string, PreviewRow[]>>((groups, row) => {
      (groups[row.csvArea] ||= []).push(row);
      return groups;
    }, {});
  }, [rows]);

  const hasRowError = (rowNumber: number) => errors.join('\n').includes(`${rowNumber}行目:`);
  const hasAreaError = (csvArea: string) => errors.some((error) => error.startsWith(`${csvArea}:`));

  const teamGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        year: number;
        csvArea: string;
        areaCode: string;
        event: PreviewEvent | undefined;
      }
    >();
    rows.forEach((row) => {
      const areaCode = areaAssignments[row.csvArea] || '';
      const key = `${row.year}:${areaCode}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          year: row.year,
          csvArea: row.csvArea,
          areaCode,
          event: events.find((event) => event.year === row.year),
        });
      }
    });
    return [...groups.values()].map((group) => ({
      ...group,
      teams: availableTeams.filter(
        (team) =>
          team.year === group.year &&
          team.eventId === group.event?.eventId &&
          team.assignedArea === group.areaCode,
      ),
    }));
  }, [areaAssignments, availableTeams, events, rows]);

  const openAddressModal = (row: PreviewRow) => {
    setAddressModalRow(row);
    setManualAddress(addressSelections[String(row.rowIndex)]?.address || '');
  };

  const updateAddressSelection = (row: PreviewRow, candidate: AddressCandidate) => {
    setAddressSelections((current) => ({ ...current, [String(row.rowIndex)]: candidate }));
    setAddressModalRow(null);
  };

  const updateRowEdit = (row: PreviewRow, update: Partial<RowEdit>) => {
    setRowEdits((current) => ({
      ...current,
      [String(row.rowIndex)]: {
        storeName: current[String(row.rowIndex)]?.storeName ?? row.storeName,
        status: current[String(row.rowIndex)]?.status ?? row.status,
        notes: current[String(row.rowIndex)]?.notes ?? row.notes,
        ...update,
      },
    }));
  };

  const removeRow = (row: PreviewRow) => {
    setRows((current) => current.filter((currentRow) => currentRow.rowIndex !== row.rowIndex));
    setRowEdits((current) => {
      const next = { ...current };
      delete next[String(row.rowIndex)];
      return next;
    });
    setAddressSelections((current) => {
      const next = { ...current };
      delete next[String(row.rowIndex)];
      return next;
    });
  };

  const saveManualAddress = (row: PreviewRow) => {
    const address = manualAddress.trim();
    if (!address) return;
    const matchingCandidate = row.addressCandidates.find(
      (candidate) => candidate.address === address,
    );
    setAddressSelections((current) => ({
      ...current,
      [String(row.rowIndex)]: matchingCandidate || { address },
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
      if (!response.ok) {
        const apiErrors = Array.isArray(data?.errors)
          ? data.errors
          : [data?.error || 'CSVの確認に失敗しました'];
        throw new Error(apiErrors.join('\n'));
      }

      const nextRows = Array.isArray(data?.rows) ? (data.rows as PreviewRow[]) : [];
      const nextEvents = Array.isArray(data?.events) ? (data.events as PreviewEvent[]) : [];
      const nextTeams = Array.isArray(data?.teams) ? (data.teams as TeamOption[]) : [];
      setRows(nextRows);
      setEvents(nextEvents);
      setAvailableTeams(nextTeams);
      setTeamAssignments({});
      setRowEdits(
        Object.fromEntries(
          nextRows.map((row) => [
            String(row.rowIndex),
            { storeName: row.storeName, status: row.status, notes: row.notes },
          ]),
        ),
      );
      setAreaAssignments(
        nextRows.reduce<Record<string, string>>((assignments, row) => {
          if (!(row.csvArea in assignments)) assignments[row.csvArea] = row.matchedAreaCode || '';
          return assignments;
        }, {}),
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
      setErrors(
        error instanceof Error
          ? error.message.split('\n').filter(Boolean)
          : ['CSVの確認に失敗しました'],
      );
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
      const effectiveAreaAssignments = rows.reduce<Record<string, string>>((assignments, row) => {
        if (!(row.csvArea in assignments)) {
          assignments[row.csvArea] = areaAssignments[row.csvArea] || row.matchedAreaCode || '';
        }
        return assignments;
      }, {});
      const effectiveAddressSelections = rows.reduce<
        Record<string, AddressCandidate | { address: string }>
      >((selections, row) => {
        const selected =
          addressSelections[String(row.rowIndex)] ||
          row.addressCandidates[0] ||
          (row.address ? { address: row.address } : undefined);
        if (selected) selections[String(row.rowIndex)] = selected;
        return selections;
      }, {});
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/store-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'import',
          csv,
          targetYear,
          areaAssignments: effectiveAreaAssignments,
          addressSelections: effectiveAddressSelections,
          rowOverrides: rowEdits,
          teamAssignments,
          eventDates,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const apiErrors = Array.isArray(data?.errors)
          ? data.errors
          : [data?.error || 'CSVの登録に失敗しました'];
        throw new Error(apiErrors.join('\n'));
      }
      setMessage(`${data.imported}件の店舗を登録しました。`);
      setRows([]);
      setRowEdits({});
      setCsv('');
      setFileName('');
      setEventDateModalOpen(false);
      setTeamAssignmentModalOpen(false);
    } catch (error) {
      setErrors(
        error instanceof Error
          ? error.message.split('\n').filter(Boolean)
          : ['CSVの登録に失敗しました'],
      );
    } finally {
      setImporting(false);
    }
  };

  const openTeamAssignmentModal = () => {
    setTeamAssignments((current) => {
      const next = { ...current };
      teamGroups.forEach((group) => {
        if (next[group.key]) return;
        const existingTeam = group.teams[0];
        next[group.key] = existingTeam
          ? { teamId: existingTeam.teamId, create: false }
          : { create: true, timeSlot: group.event?.availabilitySlots[0] || '' };
      });
      return next;
    });
    setTeamAssignmentModalOpen(true);
  };

  const downloadTemplate = () => {
    const headers = [['店舗名', '住所', '配布年度', '配布可否', '備考', '配布地域']];
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
          配布可否の「可」は配布済み、「否」は配布不可として登録します。
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
              className={`rounded-2xl border p-6 shadow-sm ${hasAreaError(csvArea) ? 'border-red-400 bg-red-50/40' : 'border-gray-200 bg-white'}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold text-gray-900">CSV配布地域: {csvArea}</h2>
                <span className="text-sm text-gray-500">{areaRows.length}件</span>
              </div>
              {hasAreaError(csvArea) && (
                <p className="mt-2 text-sm font-medium text-red-700">
                  このCSV配布地域のシステム配布区域を選択してください。
                </p>
              )}
              <label className="mt-4 block max-w-md text-sm font-medium text-gray-700">
                システム配布区域
                <select
                  value={areaAssignments[csvArea] || ''}
                  onChange={(e) =>
                    setAreaAssignments((current) => ({
                      ...current,
                      [csvArea]: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">選択してください</option>
                  {areaRows[0].areaCandidates.map((area) => (
                    <option key={area.areaCode} value={area.areaCode}>
                      {area.areaCode} / {area.areaName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500">
                      <th className="px-3 py-2">店舗名・備考</th>
                      <th className="px-3 py-2">状態</th>
                      <th className="px-3 py-2">住所候補</th>
                      <th className="px-3 py-2">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {areaRows.map((row) => {
                      const address = addressSelections[String(row.rowIndex)];
                      const edit = rowEdits[String(row.rowIndex)] || {
                        storeName: row.storeName,
                        status: row.status,
                        notes: row.notes,
                      };
                      return (
                        <tr
                          key={row.rowIndex}
                          className={hasRowError(row.rowNumber) ? 'bg-red-50' : undefined}
                        >
                          <td className="px-3 py-3 font-medium text-gray-900">
                            <input
                              value={edit.storeName}
                              onChange={(e) => updateRowEdit(row, { storeName: e.target.value })}
                              aria-label={`${row.rowNumber}行目の店舗名`}
                              aria-invalid={hasRowError(row.rowNumber)}
                              className="min-w-52 rounded-md border border-gray-300 px-2 py-2 text-sm font-medium"
                            />
                            <input
                              value={edit.notes}
                              onChange={(e) => updateRowEdit(row, { notes: e.target.value })}
                              aria-label={`${row.rowNumber}行目の備考`}
                              placeholder="備考なし"
                              className="mt-2 min-w-52 rounded-md border border-gray-300 px-2 py-2 text-xs font-normal"
                            />
                            <div className="mt-1 text-xs font-normal text-gray-500">
                              {row.year}年度
                            </div>
                            {hasRowError(row.rowNumber) && (
                              <span className="mt-2 inline-block rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white">
                                要確認（{row.rowNumber}行目）
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <select
                              value={edit.status}
                              onChange={(e) =>
                                updateRowEdit(row, {
                                  status: e.target.value as RowEdit['status'],
                                })
                              }
                              aria-label={`${row.rowNumber}行目の配布可否`}
                              className="rounded-md border border-gray-300 px-2 py-2 text-sm"
                            >
                              <option value="completed">可</option>
                              <option value="failed">否</option>
                            </select>
                          </td>
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => openAddressModal(row)}
                              className={`max-w-xs rounded-md border px-3 py-2 text-left text-sm ${hasRowError(row.rowNumber) ? 'border-red-400 bg-red-100 text-red-900' : address?.address ? 'border-green-300 bg-green-50 text-green-800' : 'border-amber-300 bg-amber-50 text-amber-900'}`}
                            >
                              {address?.address || '住所候補を確認'}
                            </button>
                            {hasRowError(row.rowNumber) && (
                              <p className="mt-1 text-xs font-medium text-red-700">
                                この行の確認が必要です
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => removeRow(row)}
                              className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                            >
                              削除
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
            onClick={openTeamAssignmentModal}
            disabled={importing || rows.length === 0}
            className="rounded-md bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importing ? '登録中...' : `${rows.length}件を確認してインポート`}
          </button>
        </section>
      )}

      <Modal
        open={teamAssignmentModalOpen}
        onClose={() => setTeamAssignmentModalOpen(false)}
        panelClassName="max-w-3xl p-6"
      >
        <h2 className="text-lg font-semibold text-gray-900">店舗のチーム割り当てを確認</h2>
        <p className="mt-1 text-sm text-gray-600">
          年度・システム配布区域ごとに、店舗を割り当てるチームを確認してください。チームがない区域は自動作成します。
        </p>
        {errors.length > 0 && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <p className="font-semibold">設定を反映できませんでした</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {errors.map((error, index) => (
                <li key={`${error}-${index}`}>{error}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-5 space-y-4">
          {teamGroups.map((group) => {
            const assignment = teamAssignments[group.key] || {};
            const eventSlots = group.event?.availabilitySlots || [];
            return (
              <div key={group.key} className="rounded-md border border-gray-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-900">
                      {group.year}年度 / CSV配布地域: {group.csvArea}
                    </p>
                    <p className="text-sm text-gray-500">
                      システム配布区域: {group.areaCode || '未選択'}
                    </p>
                  </div>
                  <span className="text-sm text-gray-500">
                    {
                      rows.filter(
                        (row) =>
                          row.year === group.year &&
                          areaAssignments[row.csvArea] === group.areaCode,
                      ).length
                    }
                    件
                  </span>
                </div>
                {group.teams.length > 0 ? (
                  <label className="mt-4 block text-sm font-medium text-gray-700">
                    割り当て先チーム
                    <select
                      value={assignment.create ? '__create__' : assignment.teamId || ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        setTeamAssignments((current) => ({
                          ...current,
                          [group.key]:
                            value === '__create__'
                              ? { create: true, timeSlot: eventSlots[0] || '' }
                              : { teamId: value, create: false },
                        }));
                      }}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    >
                      {group.teams.map((team) => (
                        <option key={team.teamId} value={team.teamId}>
                          {team.teamName} ({team.teamCode}) / {team.timeSlot}
                        </option>
                      ))}
                      <option value="__create__">新しいチームを自動作成</option>
                    </select>
                  </label>
                ) : (
                  <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                    この区域のチームはありません。チームを自動作成します。
                  </p>
                )}
                {(group.teams.length === 0 || assignment.create) && (
                  <label className="mt-3 block text-sm font-medium text-gray-700">
                    自動作成するチームの配布枠
                    <select
                      value={assignment.timeSlot || eventSlots[0] || ''}
                      onChange={(event) =>
                        setTeamAssignments((current) => ({
                          ...current,
                          [group.key]: { create: true, timeSlot: event.target.value },
                        }))
                      }
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">配布枠を選択してください</option>
                      {eventSlots.map((slot) => (
                        <option key={slot} value={slot}>
                          {slot}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setTeamAssignmentModalOpen(false)}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            戻る
          </button>
          <button
            type="button"
            onClick={() => void importStores()}
            disabled={importing}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importing ? '登録中...' : '設定してインポート'}
          </button>
        </div>
      </Modal>

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
                    key={`${candidate.address}-${candidate.latitude ?? ''}-${candidate.longitude ?? ''}`}
                    type="button"
                    onClick={() => updateAddressSelection(addressModalRow, candidate)}
                    className={`block w-full rounded-md border p-3 text-left text-sm ${selected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'}`}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {selected ? '選択中: ' : ''}
                        {candidate.address}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${candidate.source === 'saved' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}
                      >
                        {candidate.source === 'saved'
                          ? '保存済み'
                          : candidate.source === 'csv'
                            ? 'CSV入力'
                            : '検索候補'}
                      </span>
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
