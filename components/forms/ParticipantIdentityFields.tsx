'use client';

type ParticipantIdentityFieldsProps = {
  name: string;
  nameKana: string;
  grade: string;
  section: string;
  onNameChange: (value: string) => void;
  onNameKanaChange: (value: string) => void;
  onGradeChange: (value: string) => void;
  onSectionChange: (value: string) => void;
  nameError?: string;
  nameKanaError?: string;
  gradeError?: string;
  sectionError?: string;
  sectionDisabled?: boolean;
  className?: string;
};

const sectionOptions = ['企画系', '技術系', '警備系', 'Web系', 'PR系'];

export function ParticipantIdentityFields({
  name,
  nameKana,
  grade,
  section,
  onNameChange,
  onNameKanaChange,
  onGradeChange,
  onSectionChange,
  nameError,
  nameKanaError,
  gradeError,
  sectionError,
  sectionDisabled = false,
  className = '',
}: ParticipantIdentityFieldsProps) {
  const options = grade === '4' ? ['4年'] : sectionOptions;

  return (
    <div className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${className}`}>
      <div>
        <label className="block text-sm font-medium text-gray-700">お名前 *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="mt-1 block w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-indigo-500"
        />
        {nameError && <p className="mt-1 text-sm text-red-600">{nameError}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">ふりがな *</label>
        <input
          type="text"
          value={nameKana}
          onChange={(e) => onNameKanaChange(e.target.value)}
          className="mt-1 block w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-indigo-500"
        />
        {nameKanaError && <p className="mt-1 text-sm text-red-600">{nameKanaError}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">学年 *</label>
        <select
          value={grade}
          onChange={(e) => onGradeChange(e.target.value)}
          className="mt-1 block w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-indigo-500"
        >
          <option value="">選択してください</option>
          <option value="1">1年生</option>
          <option value="2">2年生</option>
          <option value="3">3年生</option>
          <option value="4">4年生</option>
        </select>
        {gradeError && <p className="mt-1 text-sm text-red-600">{gradeError}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">所属セクション *</label>
        <select
          value={section}
          onChange={(e) => onSectionChange(e.target.value)}
          disabled={sectionDisabled || grade === '4'}
          className="mt-1 block w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-indigo-500 disabled:bg-gray-100"
        >
          <option value="">選択してください</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {sectionError && <p className="mt-1 text-sm text-red-600">{sectionError}</p>}
      </div>
    </div>
  );
}
