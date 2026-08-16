import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const MOCK_YEAR = 2000;
const MOCK_KEY = 'mock-2000';
const EVENT_ID = 'kodai2000';
const FORM_ID = 'mock-form-2000';
const RESPONSE_COUNT = 70;
const areaDefinitions = [
  { areaCode: 'Ari-Tera', areaName: '有松・寺地', adjacentAreas: ['Hisa'] },
  { areaCode: 'Hisa', areaName: '久安', adjacentAreas: ['Ari-Tera'] },
  { areaCode: 'Kana', areaName: '金沢市役所', adjacentAreas: [] },
  { areaCode: 'Min', areaName: '三馬', adjacentAreas: ['Ou-mi'] },
  { areaCode: 'Nono', areaName: '野々市市役所', adjacentAreas: [] },
  { areaCode: 'Okyo', areaName: '御経塚', adjacentAreas: [] },
  { areaCode: 'Ou-ki', areaName: '扇ヶ丘北', adjacentAreas: ['Yoko'] },
  { areaCode: 'Ou-mi', areaName: '扇ヶ丘・三馬', adjacentAreas: ['Min', 'Taka'] },
  {
    areaCode: 'pr',
    areaName: 'PR',
    adjacentAreas: [],
    description: 'PR系で配布していた区域（主として銀行・郵便局）',
  },
  { areaCode: 'Taka', areaName: '高尾台', adjacentAreas: ['Ou-mi'] },
  { areaCode: 'Yoko', areaName: '横宮', adjacentAreas: ['Ou-ki'] },
];
const AREA_COUNT = areaDefinitions.length;
const distributionSlots = ['2000-09-03_am', '2000-09-03_pm', '2000-09-04_am', '2000-09-04_pm'];

process.env.FIREBASE_AUTH_EMULATOR_HOST ||= 'localhost:9099';
process.env.FIRESTORE_EMULATOR_HOST ||= 'localhost:8080';

const app = getApps().length ? getApps()[0] : initializeApp({ projectId: 'demo-kit-pr-poster' });
const db = getFirestore(app);

const slots = Array.from(
  { length: AREA_COUNT },
  (_, index) => distributionSlots[index % distributionSlots.length],
);

const now = new Date();
const areas = areaDefinitions.map((definition, index) => {
  const number = String(index + 1).padStart(2, '0');
  return {
    areaId: `${MOCK_KEY}-area-${number}`,
    areaCode: definition.areaCode,
    areaName: definition.areaName,
    description: definition.description || '',
    adjacentAreas: definition.adjacentAreas,
    mockKey: MOCK_KEY,
    createdAt: now,
    updatedAt: now,
  };
});

const teams = areas.map((area, index) => {
  const number = String(index + 1).padStart(2, '0');
  return {
    teamId: `${MOCK_KEY}-team-${number}`,
    teamCode: `${MOCK_KEY}-${area.areaCode}`,
    teamName: `${area.areaName}配布班`,
    timeSlot: slots[index],
    areaId: area.areaId,
    assignedArea: area.areaCode,
    adjacentAreas: area.adjacentAreas,
    eventId: EVENT_ID,
    year: MOCK_YEAR,
    isActive: true,
    requiresCar: index % 3 === 0,
    maxMembers: 12,
    mockKey: MOCK_KEY,
    validStartDate: `${slots[index].slice(0, 10)}T08:00:00+09:00`,
    validEndDate: `${slots[index].slice(0, 10)}T21:00:00+09:00`,
    accessWindowVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
});

const event = {
  eventId: EVENT_ID,
  eventName: '動作確認テスト',
  distributionStartDate: '2000-09-03',
  distributionEndDate: '2000-09-04',
  distributionAvailabilitySlots: distributionSlots,
  distributionTimeZone: 'Asia/Tokyo',
  year: MOCK_YEAR,
  isActive: true,
  mockKey: MOCK_KEY,
  createdAt: now,
  updatedAt: now,
};

const fields = [
  {
    fieldId: 'availability',
    type: 'checkbox',
    label: '参加可能な配布枠',
    required: true,
    options: [...distributionSlots, 'unavailable'],
    order: 0,
  },
  {
    fieldId: 'carUsage',
    type: 'radio',
    label: '自動車を使用できますか',
    required: true,
    options: ['運転できる', '免許はあるが運転しない', '免許を持っていない'],
    order: 1,
  },
  { fieldId: 'remarks', type: 'textarea', label: '備考', required: false, order: 2 },
];

const form = {
  formId: FORM_ID,
  title: '動作確認テスト参加フォーム',
  description: 'make mocks によるフォーム・回答データの動作確認用フォーム',
  isActive: true,
  eventId: EVENT_ID,
  year: MOCK_YEAR,
  fields,
  createdBy: 'make-mocks',
  mockKey: MOCK_KEY,
  responseCount: RESPONSE_COUNT,
  createdAt: now,
  updatedAt: now,
};

function buildResponse(index) {
  const grade = (index % 4) + 1;
  const section = grade === 4 ? '4年' : ['企画系', '技術系', '警備系', 'Web系', 'PR系'][index % 5];
  const availability =
    index % 5 === 0
      ? slots.slice(0, 4)
      : index % 3 === 0
        ? [slots[index % slots.length]]
        : [slots[index % slots.length], slots[(index + 1) % slots.length]];
  const carUsage =
    index % 4 === 0
      ? '運転できる'
      : index % 3 === 0
        ? '免許はあるが運転しない'
        : '免許を持っていない';
  const id = String(index + 1).padStart(3, '0');
  const responseId = `${MOCK_KEY}-response-${id}`;
  const name = `動作確認　${id}`;
  const nameKana = `ドウサカクニン　${id}`;
  const submittedAt = new Date(Date.UTC(2000, 4, 1, 0, index, 0));

  return {
    responseId,
    formId: FORM_ID,
    answers: [
      { fieldId: 'availability', value: availability },
      { fieldId: 'carUsage', value: carUsage },
      { fieldId: 'remarks', value: index % 2 === 0 ? '複数条件テスト' : '' },
    ],
    participantData: {
      name,
      nameKana,
      section,
      grade,
      availableSlots: availability,
    },
    submitterInfo: { name, email: `mock-${index + 1}@example.test` },
    editToken: `${MOCK_KEY}-edit-${id}`,
    submittedAt,
    updatedAt: submittedAt,
  };
}

function validateMockParticipant(response) {
  const participant = response.participantData;
  if (participant.name.split('　').filter(Boolean).length < 2) {
    throw new Error(`名前の姓・名分離に失敗: ${participant.name}`);
  }
  if (participant.nameKana.split('　').filter(Boolean).length < 2) {
    throw new Error(`ふりがなの姓・名分離に失敗: ${participant.nameKana}`);
  }
  if (!participant.section || (participant.grade === 4 && participant.section !== '4年')) {
    throw new Error(`所属セクションが不正: ${participant.grade}年 / ${participant.section}`);
  }
  if (participant.grade < 1 || participant.grade > 4) {
    throw new Error(`学年が不正: ${participant.grade}`);
  }
  if (
    !participant.availableSlots.length ||
    !participant.availableSlots.every((slot) => distributionSlots.includes(slot))
  ) {
    throw new Error(`配布枠が不正: ${participant.availableSlots.join(',')}`);
  }
}

async function commitWrites(writes) {
  for (let index = 0; index < writes.length; index += 400) {
    const batch = db.batch();
    writes.slice(index, index + 400).forEach(({ ref, data }) => batch.set(ref, data));
    await batch.commit();
  }
}

const writes = [
  { ref: db.collection('distributionEvents').doc(EVENT_ID), data: event },
  ...areas.map((area) => ({ ref: db.collection('areas').doc(area.areaId), data: area })),
  ...teams.map((team) => ({ ref: db.collection('teams').doc(team.teamId), data: team })),
  { ref: db.collection('forms').doc(FORM_ID), data: form },
  ...Array.from({ length: RESPONSE_COUNT }, (_, index) => {
    const response = buildResponse(index);
    validateMockParticipant(response);
    return {
      ref: db.collection('forms').doc(FORM_ID).collection('responses').doc(response.responseId),
      data: response,
    };
  }),
];

await commitWrites(writes);
console.log(
  JSON.stringify(
    {
      success: true,
      eventId: EVENT_ID,
      eventName: event.eventName,
      year: MOCK_YEAR,
      areas: areas.length,
      teams: teams.length,
      forms: 1,
      responses: RESPONSE_COUNT,
    },
    null,
    2,
  ),
);
