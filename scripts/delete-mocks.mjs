import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const MOCK_YEAR = 2000;
const MOCK_KEY = 'mock-2000';
const EVENT_ID = 'kodai2000';

process.env.FIREBASE_AUTH_EMULATOR_HOST ||= 'localhost:9099';
process.env.FIRESTORE_EMULATOR_HOST ||= 'localhost:8080';

const app = getApps().length ? getApps()[0] : initializeApp({ projectId: 'demo-kit-pr-poster' });
const db = getFirestore(app);

async function deleteRefs(refs) {
  const uniqueRefs = [...new Map(refs.map((ref) => [ref.path, ref])).values()];
  for (let index = 0; index < uniqueRefs.length; index += 400) {
    const batch = db.batch();
    uniqueRefs.slice(index, index + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
  return uniqueRefs.length;
}

async function queryRefs(query) {
  const snapshot = await query.get();
  return snapshot.docs.map((doc) => doc.ref);
}

async function queryDocs(query) {
  const snapshot = await query.get();
  return snapshot.docs;
}

async function deleteFormResponses(formRefs) {
  const responseRefs = [];
  for (const formRef of formRefs) {
    responseRefs.push(...(await formRef.collection('responses').listDocuments()));
  }
  return deleteRefs(responseRefs);
}

const eventDocs = await queryDocs(
  db.collection('distributionEvents').where('year', '==', MOCK_YEAR),
);
const eventIds = [...new Set([EVENT_ID, ...eventDocs.map((doc) => doc.id)])];

const [teamByYear, teamByEvent, mockTeams] = await Promise.all([
  queryDocs(db.collection('teams').where('year', '==', MOCK_YEAR)),
  queryDocs(db.collection('teams').where('eventId', 'in', eventIds.slice(0, 10))),
  queryDocs(db.collection('teams').where('mockKey', '==', MOCK_KEY)),
]);
const teamDocs = [...teamByYear, ...teamByEvent, ...mockTeams];
const teamRefs = [...new Map(teamDocs.map((doc) => [doc.id, doc.ref])).values()];
const teamCodes = new Set(teamDocs.map((doc) => doc.data().teamCode).filter(Boolean));

const [formByYear, formByEvent, mockForms] = await Promise.all([
  queryDocs(db.collection('forms').where('year', '==', MOCK_YEAR)),
  queryDocs(db.collection('forms').where('eventId', 'in', eventIds.slice(0, 10))),
  queryDocs(db.collection('forms').where('mockKey', '==', MOCK_KEY)),
]);
const formDocs = [...formByYear, ...formByEvent, ...mockForms];
const formRefs = [...new Map(formDocs.map((doc) => [doc.id, doc.ref])).values()];
const formIds = [...new Set(formDocs.map((doc) => doc.id))];

const [assignmentByYear, assignmentByForm] = await Promise.all([
  queryRefs(db.collection('assignments').where('year', '==', MOCK_YEAR)),
  formIds.length
    ? queryRefs(db.collection('assignments').where('formId', 'in', formIds.slice(0, 10)))
    : [],
]);

const storeDocs = await queryDocs(db.collection('stores'));
const storeRefs = storeDocs
  .filter((doc) => {
    const data = doc.data();
    return (
      eventIds.includes(data.eventId) ||
      teamCodes.has(data.distributedBy) ||
      teamCodes.has(data.createdByTeamCode)
    );
  })
  .map((doc) => doc.ref);

const mockAreaRefs = await queryRefs(db.collection('areas').where('mockKey', '==', MOCK_KEY));
const linkedMockAreaRefs = [];
for (const teamRef of teamRefs) {
  const teamDoc = await teamRef.get();
  const areaId = teamDoc.data()?.areaId;
  if (typeof areaId === 'string' && areaId.startsWith(`${MOCK_KEY}-`)) {
    linkedMockAreaRefs.push(db.collection('areas').doc(areaId));
  }
}

const deleted = {
  responses: await deleteFormResponses(formRefs),
  assignments: await deleteRefs([...assignmentByYear, ...assignmentByForm]),
  stores: await deleteRefs(storeRefs),
  forms: await deleteRefs(formRefs),
  teams: await deleteRefs(teamRefs),
  areas: await deleteRefs([...mockAreaRefs, ...linkedMockAreaRefs]),
  events: await deleteRefs(
    await queryRefs(db.collection('distributionEvents').where('year', '==', MOCK_YEAR)),
  ),
};

console.log(JSON.stringify({ success: true, year: MOCK_YEAR, deleted }, null, 2));
