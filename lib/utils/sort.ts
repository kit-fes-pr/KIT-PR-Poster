import { normalizeGrade } from './grade/grade';
import { generateKana } from '../kanaUtils';

const japaneseCollator = new Intl.Collator('ja');

export function compareJapaneseText(a: unknown, b: unknown): number {
  return japaneseCollator.compare(String(a ?? ''), String(b ?? ''));
}

export function compareGradeThenKanaThenName(
  a: { grade?: unknown; nameKana?: unknown; name?: unknown; responseId?: unknown },
  b: { grade?: unknown; nameKana?: unknown; name?: unknown; responseId?: unknown },
): number {
  const aGrade = normalizeGrade(a.grade);
  const bGrade = normalizeGrade(b.grade);
  if (aGrade !== bGrade) return aGrade - bGrade;

  const aSortName = generateKana(String(a.nameKana || a.name || ''));
  const bSortName = generateKana(String(b.nameKana || b.name || ''));
  const kanaCompare = compareJapaneseText(aSortName, bSortName);
  if (kanaCompare !== 0) return kanaCompare;

  const nameCompare = compareJapaneseText(a.name, b.name);
  if (nameCompare !== 0) return nameCompare;

  return compareJapaneseText(a.responseId, b.responseId);
}

export function sortByGradeThenKanaThenName<
  T extends { grade?: unknown; nameKana?: unknown; name?: unknown; responseId?: unknown },
>(items: T[]): T[] {
  return [...items].sort(compareGradeThenKanaThenName);
}
