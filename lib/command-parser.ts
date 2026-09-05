export type CommandAction =
  | { type: 'add_reminder'; title: string; dueAt: string; recurrence: string | null; confirmation: string }
  | { type: 'add_shopping'; items: string[]; confirmation: string }
  | { type: 'set_meal'; slot: 'breakfast' | 'lunch' | 'dinner'; dish: string; day: string; confirmation: string }
  | { type: 'add_family_note'; message: string; confirmation: string }
  | { type: 'start_timer'; label: string; endsAt: string; confirmation: string }
  | { type: 'unknown'; confirmation: string };

const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const INDIA_OFFSET_MINUTES = 330;

function indiaCalendarDate(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const number = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(number('year'), number('month') - 1, number('day')));
}

function atIndiaTime(calendarDate: Date, hour: number, minute: number) {
  return new Date(Date.UTC(calendarDate.getUTCFullYear(), calendarDate.getUTCMonth(), calendarDate.getUTCDate(), hour, minute) - INDIA_OFFSET_MINUTES * 60_000);
}

function titleCase(value: string) {
  return value.trim().replace(/\s+/g, ' ').replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function parseClock(text: string, fallback = 9) {
  const match = text.match(/(?:at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  let hour = match ? Number(match[1]) : fallback;
  const minute = match?.[2] ? Number(match[2]) : 0;
  const meridiem = match?.[3]?.toLowerCase();
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return { hour, minute };
}

function parseReminder(text: string, now: Date): CommandAction {
  const lower = text.toLowerCase();
  const { hour, minute } = parseClock(text);
  const calendarDate = indiaCalendarDate(now);
  let due: Date;
  let recurrence: string | null = null;
  const relative = lower.match(/(?:in\s+)?(\d+)\s+(minute|hour|day|week)s?\s+from\s+now|in\s+(\d+)\s+(minute|hour|day|week)s?/i);

  if (relative) {
    const amount = Number(relative[1] || relative[3]);
    const unit = relative[2] || relative[4];
    const multiplier = unit === 'minute' ? 60_000 : unit === 'hour' ? 3_600_000 : unit === 'week' ? 604_800_000 : 86_400_000;
    if (unit === 'minute' || unit === 'hour') due = new Date(now.getTime() + amount * multiplier);
    else {
      calendarDate.setUTCDate(calendarDate.getUTCDate() + amount * (unit === 'week' ? 7 : 1));
      due = atIndiaTime(calendarDate, hour, minute);
    }
  } else if (/day after tomorrow/i.test(lower)) {
    calendarDate.setUTCDate(calendarDate.getUTCDate() + 2);
    due = atIndiaTime(calendarDate, hour, minute);
  } else if (/tomorrow/i.test(lower)) {
    calendarDate.setUTCDate(calendarDate.getUTCDate() + 1);
    due = atIndiaTime(calendarDate, hour, minute);
  } else {
    const weekday = weekdays.findIndex((day) => new RegExp(`(?:next|every)\\s+${day}`, 'i').test(lower));
    if (weekday >= 0) calendarDate.setUTCDate(calendarDate.getUTCDate() + ((weekday - calendarDate.getUTCDay() + 7) % 7 || 7));
    due = atIndiaTime(calendarDate, hour, minute);
    if (due <= now && weekday < 0) {
      calendarDate.setUTCDate(calendarDate.getUTCDate() + 1);
      due = atIndiaTime(calendarDate, hour, minute);
    }
  }

  if (/every\s*day|everyday|daily/i.test(lower)) recurrence = 'DAILY';
  else if (/every\s+week|weekly/i.test(lower)) recurrence = 'WEEKLY';
  else {
    const recurringDay = weekdays.find((day) => new RegExp(`every\\s+${day}`, 'i').test(lower));
    if (recurringDay) recurrence = `WEEKLY:${recurringDay.toUpperCase()}`;
  }

  let title = text
    .replace(/^(please\s+)?(set\s+)?(?:a\s+)?reminder\s*/i, '')
    .replace(/^(please\s+)?remind\s+(me|us|everyone)\s*/i, '')
    .replace(/(?:in\s+)?\d+\s+(?:minute|hour|day|week)s?\s+from\s+now/gi, '')
    .replace(/in\s+\d+\s+(?:minute|hour|day|week)s?/gi, '')
    .replace(/\b(day after tomorrow|tomorrow|today|next\s+\w+|every\s*day|everyday|daily|weekly|every\s+\w+)\b/gi, '')
    .replace(/(?:at|@)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?/gi, '')
    .replace(/^\s*(to|for)\s+/i, '')
    .replace(/\s+(to|for)\s+/i, ' ')
    .trim();

  const forTail = text.match(/\bfor\s+(.+?)(?=\s+(?:at|in|tomorrow|every|next)\b|$)/i);
  const toTail = text.match(/\bto\s+(.+?)(?=\s+(?:at|in|tomorrow|every|next)\b|$)/i);
  if (forTail?.[1]) title = forTail[1];
  else if (toTail?.[1]) title = toTail[1];
  title = title.replace(/^do\s+/i, '').trim() || 'Household reminder';

  const when = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: recurrence ? undefined : 'short',
    day: recurrence ? undefined : 'numeric',
    month: recurrence ? undefined : 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(due);
  const cadence = recurrence === 'DAILY' ? `every day at ${when}` : recurrence?.startsWith('WEEKLY') ? `every week at ${when}` : `for ${when}`;

  return { type: 'add_reminder', title: titleCase(title), dueAt: due.toISOString(), recurrence, confirmation: `Done — I’ll remind you ${cadence}.` };
}

function parseTimer(text: string, now: Date): CommandAction | null {
  const duration = text.match(/(\d+(?:\.\d+)?)\s*(second|minute|hour)s?/i);
  if (!duration) return null;
  const amount = Number(duration[1]);
  const unit = duration[2].toLowerCase();
  const milliseconds = unit === 'second' ? amount * 1_000 : unit === 'hour' ? amount * 3_600_000 : amount * 60_000;
  if (!Number.isFinite(milliseconds) || milliseconds < 1_000 || milliseconds > 86_400_000) return null;

  const label = text
    .replace(/^(please\s+)?(start|set|begin)\s+(?:a\s+)?/i, '')
    .replace(/(?:for\s+)?\d+(?:\.\d+)?\s*(?:second|minute|hour)s?/i, '')
    .replace(/\btimer\b/gi, '')
    .replace(/^\s*(a|for|called|named)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Kitchen';
  const endsAt = new Date(now.getTime() + milliseconds).toISOString();
  const readableDuration = `${amount} ${unit}${amount === 1 ? '' : 's'}`;
  return { type: 'start_timer', label: titleCase(label), endsAt, confirmation: `${titleCase(label)} timer started for ${readableDuration}.` };
}

function parseFamilyNote(text: string): CommandAction | null {
  const message = text
    .replace(/^(please\s+)?(add|put|leave|write|post)\s+/i, '')
    .replace(/^(?:a\s+)?(?:family|household)\s+(?:note|message)\s*/i, '')
    .replace(/\s+(?:to|on)\s+(?:the\s+)?(?:family|household)\s+(?:board|notes?).*$/i, '')
    .replace(/^(that|saying)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!message) return null;
  return { type: 'add_family_note', message, confirmation: 'Added that to the family board.' };
}

export function parseCommand(text: string, now = new Date()): CommandAction {
  const clean = text.trim();
  const lower = clean.toLowerCase();
  if (/\btimer\b/i.test(lower)) {
    const timer = parseTimer(clean, now);
    if (timer) return timer;
  }

  if (/\b(?:family|household)\s+(?:board|note|message)s?\b|\bnote\b.*\b(?:family|everyone|home)\b/i.test(lower)) {
    const note = parseFamilyNote(clean);
    if (note) return note;
  }

  if (/\b(remind|reminder)\b/i.test(lower)) return parseReminder(clean, now);

  if (/\b(add|put|get|buy|need)\b.*\b(shopping|grocery|list)\b|\b(shopping|grocery)\s+list\b/i.test(lower)) {
    const payload = clean
      .replace(/^(please\s+)?(?:add|put|get|buy|include|(?:i|we)\s+need)\s+/i, '')
      .replace(/\s+(?:to|on|in)\s+(?:(?:my|our|the)\s+)?(?:shopping|grocery)\s+list.*$/i, '')
      .replace(/\s+(?:to|on|in)\s+(?:(?:my|our|the)\s+)?(?:shopping|grocery).*$/i, '')
      .replace(/\s+(?:shopping|grocery)\s+list\s*$/i, '')
      .replace(/^(the\s+)?(shopping|grocery)\s+list\s*/i, '')
      .replace(/\s+and\s+/gi, ',');
    const items = payload.split(',').map(titleCase).filter(Boolean);
    if (items.length) return { type: 'add_shopping', items, confirmation: `Added ${items.join(', ')} to shopping.` };
  }

  const mealMatch = lower.match(/\b(breakfast|lunch|dinner)\b/);
  if (mealMatch && /\b(set|plan|add|change|update|replace|having|have|make|is|serve|cook)\b/i.test(lower)) {
    const slot = mealMatch[1] as 'breakfast' | 'lunch' | 'dinner';
    const dayDate = indiaCalendarDate(now);
    if (/\b(?:the\s+)?day\s+after\s+tomorrow(?:['’]s)?\b/i.test(lower)) dayDate.setUTCDate(dayDate.getUTCDate() + 2);
    else if (/\btomorrow(?:['’]s)?\b/i.test(lower)) dayDate.setUTCDate(dayDate.getUTCDate() + 1);
    const day = dayDate.toISOString().slice(0, 10);
    const dish = clean
      .replace(/^please\s+/i, '')
      .replace(/^(?:set|plan|add|change|update|replace|make|serve|cook)\s+/i, '')
      .replace(/^we(?:'re| are)?\s+(?:having|have|making|serving|cooking)\s+/i, '')
      .replace(/^what(?:'s| is)\s+(?:planned\s+)?for\s+/i, '')
      .replace(new RegExp(`\\b${slot}\\b`, 'i'), '')
      .replace(/\b(?:the\s+)?day\s+after\s+tomorrow(?:['’]s)?\b/gi, '')
      .replace(/\b(?:today|tomorrow)(?:['’]s)?\b/gi, '')
      .replace(/^\s*(?:(?:is|to|as|for|will be|should be|add|set|change|update|plan|make)\s+)+/i, '')
      .replace(/\s+(?:is|to|as|for)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (dish) return { type: 'set_meal', slot, dish: titleCase(dish), day, confirmation: `${titleCase(slot)} is set to ${titleCase(dish)}.` };
  }

  return { type: 'unknown', confirmation: 'I can manage shopping, meals, reminders, kitchen timers, and family notes. Try “start a 12-minute rice timer.”' };
}
