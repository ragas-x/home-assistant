import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const sourcePath = process.argv[2];
const outputPath = resolve('app/data/panchanga-2026.json');

if (!sourcePath) throw new Error('Pass the source Panchanga JSON path as the first argument.');

function clean(value) {
  return String(value || '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,{2,}/g, ',')
    .replace(/^[,;\s]+|[,;\s]+$/g, '')
    .trim();
}

function splitTopLevel(value) {
  const text = clean(value);
  if (!text) return [];
  const parts = [];
  let current = '';
  let depth = 0;
  for (const character of text) {
    if (character === '(' || character === '[') depth += 1;
    if (character === ')' || character === ']') depth = Math.max(0, depth - 1);
    if ((character === ',' || character === ';') && depth === 0) {
      if (clean(current)) parts.push(clean(current));
      current = '';
    } else {
      current += character;
    }
  }
  if (clean(current)) parts.push(clean(current));
  return [...new Set(parts)];
}

function score(entry) {
  return Object.values(entry).reduce((total, value) => total + clean(value).length, 0);
}

const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const byDate = new Map();

for (const entry of source) {
  const date = `${entry.year}-${String(entry.month).padStart(2, '0')}-${String(entry.date).padStart(2, '0')}`;
  const existing = byDate.get(date);
  if (!existing || score(entry) >= score(existing)) byDate.set(date, entry);
}

const cleaned = [...byDate.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([date, entry]) => ({
    date,
    samvatsara: clean(entry.samvatsara),
    ayana: clean(entry.ayana),
    rutu: clean(entry.rutu),
    masa: clean(entry.masa),
    paksha: clean(entry.paksha),
    tithi: clean(entry.tithi),
    vasara: clean(entry.vasara),
    nakshatra: clean(entry.nakshatra),
    yoga: clean(entry.yoga),
    karana: clean(entry.karana),
    sunrise: clean(entry.sunrise),
    sunset: clean(entry.sunset),
    observances: splitTopLevel(entry.vishesha),
    quality: clean(entry.shubhaAshubha),
    festivals: splitTopLevel(entry.festivals),
    aradhane: clean(entry.aradhane),
    ekadashi: clean(entry.ekadashi),
  }));

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(cleaned)}\n`, 'utf8');
console.log(`Wrote ${cleaned.length} unique days to ${outputPath}`);
