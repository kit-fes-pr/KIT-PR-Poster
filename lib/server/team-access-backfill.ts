import { buildMissingTeamAccessWindowPatch } from '@/lib/utils/team/team-access';

type TeamDocSnapshot = {
  ref: FirebaseFirestore.DocumentReference;
  data: () => Record<string, unknown>;
};

export async function backfillMissingTeamAccessWindows(
  docs: TeamDocSnapshot[],
  options: {
    batchFactory: () => FirebaseFirestore.WriteBatch;
  },
) {
  let batch = options.batchFactory();
  let updateCount = 0;
  let writesInBatch = 0;

  for (const doc of docs) {
    const data = doc.data();
    const patch = buildMissingTeamAccessWindowPatch(data);
    if (!patch) continue;

    batch.update(doc.ref, patch);
    updateCount++;
    writesInBatch++;

    if (writesInBatch >= 450) {
      await batch.commit();
      batch = options.batchFactory();
      writesInBatch = 0;
    }
  }

  if (writesInBatch > 0) {
    await batch.commit();
  }

  return updateCount;
}
