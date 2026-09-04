import panchangaData from '@/app/data/panchanga-2026.json';

export type PanchangaDay = {
  date: string;
  samvatsara: string;
  ayana: string;
  rutu: string;
  masa: string;
  paksha: string;
  tithi: string;
  vasara: string;
  nakshatra: string;
  yoga: string;
  karana: string;
  sunrise: string;
  sunset: string;
  observances: string[];
  quality: string;
  festivals: string[];
  aradhane: string;
  ekadashi: string;
};

export type PanchangaAlert = {
  date: string;
  daysAway: number;
  title: string;
  moreCount: number;
  isEkadashi: boolean;
};

export type PanchangaSnapshot = {
  today: PanchangaDay | null;
  alerts: PanchangaAlert[];
};

const TIME_ZONE = 'Asia/Kolkata';
const records = panchangaData as PanchangaDay[];
const byDate = new Map(records.map((record) => [record.date, record]));

function dateKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addDays(key: string, amount: number) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}

function shortFestivalName(value: string) {
  const headline = value.split(/\.\s+/)[0].trim();
  return headline.length > 72 ? `${headline.slice(0, 69).trim()}…` : headline;
}

export function getPanchangaSnapshot(now: Date): PanchangaSnapshot {
  const todayKey = dateKey(now);
  const today = byDate.get(todayKey) || null;
  const alerts: PanchangaAlert[] = [];

  for (let daysAway = 0; daysAway <= 5; daysAway += 1) {
    const key = addDays(todayKey, daysAway);
    const record = byDate.get(key);
    if (!record) continue;
    const names = [
      ...(record.ekadashi ? [`${record.ekadashi} Ekadashi`] : []),
      ...record.festivals.map(shortFestivalName),
    ].filter((name, index, all) => all.findIndex((candidate) => candidate.toLocaleLowerCase() === name.toLocaleLowerCase()) === index);
    if (!names.length) continue;
    alerts.push({
      date: key,
      daysAway,
      title: names[0],
      moreCount: Math.max(0, names.length - 1),
      isEkadashi: Boolean(record.ekadashi),
    });
  }

  return { today, alerts };
}
