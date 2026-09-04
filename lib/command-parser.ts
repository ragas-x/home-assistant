export type CommandAction =
  | { type: 'add_reminder'; title: string; dueAt: string; recurrence: string | null; confirmation: string }
  | { type: 'add_shopping'; items: string[]; confirmation: string }
  | { type: 'set_meal'; slot: 'breakfast' | 'lunch' | 'dinner'; dish: string; day: string; confirmation: string }
  | { type: 'add_family_note'; message: string; confirmation: string }
  | { type: 'start_timer'; label: string; endsAt: string; confirmation: string }
  | { type: 'unknown'; confirmation: string };

const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

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
  const due = new Date(now);
  due.setSeconds(0, 0);
  let recurrence: string | null = null;
  const relative = lower.match(/(?:in\s+)?(\d+)\s+(minute|hour|day|week)s?\s+from\s+now|in\s+(\d+)\s+(minute|hour|day|week)s?/i);

  if (relative) {
    const amount = Number(relative[1] || relative[3]);
    const unit = relative[2] || relative[4];
    const multiplier = unit === 'minute' ? 60_000 : unit === 'hour' ? 3_600_000 : unit === 'week' ? 604_800_000 : 86_400_000;
    due.setTime(now.getTime() + amount * multiplier);
    if (unit === 'day' || unit === 'week') due.setHours(hour, minute, 0, 0);
  } else if (/day after tomorrow/i.test(lower)) {
    due.setDate(due.getDate() + 2);
    due.setHours(hour, minute, 0, 0);
  } else if (/tomorrow/i.test(lower)) {
    due.setDate(due.getDate() + 1);
    due.setHours(hour, minute, 0, 0);
  } else {
    const weekday = weekdays.findIndex((day) => new RegExp(`(?:next|every)\\s+${day}`, 'i').test(lower));
    if (weekday >= 0) due.setDate(due.getDate() + ((weekday - due.getDay() + 7) % 7 || 7));
    due.setHours(hour, minute, 0, 0);
    if (due <= now && weekday < 0) due.setDate(due.getDate() + 1);
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
      .replace(/^(please\s+)?(add|put|get|buy|we need)\s+/i, '')
      .replace(/\s+(to|on|in)\s+(the\s+)?(shopping|grocery)\s+list.*$/i, '')
      .replace(/^(the\s+)?(shopping|grocery)\s+list\s*/i, '')
      .replace(/\s+and\s+/gi, ',');
    const items = payload.split(',').map(titleCase).filter(Boolean);
    if (items.length) return { type: 'add_shopping', items, confirmation: `Added ${items.join(', ')} to shopping.` };
  }

  const mealMatch = lower.match(/\b(breakfast|lunch|dinner)\b/);
  if (mealMatch && /\b(set|plan|having|have|make|is)\b/i.test(lower)) {
    const slot = mealMatch[1] as 'breakfast' | 'lunch' | 'dinner';
    const dayDate = new Date(now);
    if (/tomorrow/i.test(lower)) dayDate.setDate(dayDate.getDate() + 1);
    const day = dayDate.toISOString().slice(0, 10);
    const dish = clean
      .replace(/^(please\s+)?(set|plan|we(?:'re| are)?\s+having|we\s+have|make)\s+/i, '')
      .replace(new RegExp(`\\b${slot}\\b`, 'i'), '')
      .replace(/\b(today|tomorrow)\b/gi, '')
      .replace(/^(is|to|as|for)\s+/i, '')
      .replace(/\s+(is|to|as|for)\s+/i, ' ')
      .trim();
    if (dish) return { type: 'set_meal', slot, dish: titleCase(dish), day, confirmation: `${titleCase(slot)} is set to ${titleCase(dish)}.` };
  }

  return { type: 'unknown', confirmation: 'I can manage shopping, meals, reminders, kitchen timers, and family notes. Try “start a 12-minute rice timer.”' };
}
