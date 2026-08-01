'use client';

import { useParams } from 'next/navigation';
import { StoreCsvImportPage } from '@/components/admin/StoreCsvImportPage';

export default function YearStoreImportPage() {
  const params = useParams<{ year: string }>();
  const year = Number(params?.year);
  return <StoreCsvImportPage targetYear={Number.isInteger(year) ? year : undefined} />;
}
