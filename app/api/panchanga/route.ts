import { NextResponse } from 'next/server';
import { getPanchangaMonth, getPanchangaSnapshotForDate } from '@/lib/panchanga';

const DATE_PATTERN = /^2026-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$/;
const MONTH_PATTERN = /^2026-(0[1-9]|1[0-2])$/;

export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams;
  const date = parameters.get('date');
  const month = parameters.get('month');
  if (date && DATE_PATTERN.test(date)) return NextResponse.json(getPanchangaSnapshotForDate(date));
  if (month && MONTH_PATTERN.test(month)) return NextResponse.json(getPanchangaMonth(month));
  return NextResponse.json({ error: 'Use a valid 2026 date or month.' }, { status: 400 });
}
