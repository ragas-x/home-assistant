import { env } from 'cloudflare:workers';
import type { CommandAction } from './command-parser';

export type ReminderRecord = { id: string; title: string; due_at: string; recurrence: string | null; completed: number; created_at: string };
export type ShoppingRecord = { id: string; name: string; completed: number; created_at: string };
export type MealRecord = { id: string; day: string; slot: 'breakfast' | 'lunch' | 'dinner'; dish: string; time: string; created_at: string };
export type FamilyNoteRecord = { id: string; message: string; pinned: number; completed: number; created_at: string };
export type KitchenTimerRecord = { id: string; label: string; ends_at: string; completed: number; created_at: string };

type SupabaseRow = Record<string, unknown>;
type SupabaseEnv = { SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string };

const TABLES = {
  meals: 'kitchen_dashboard_meals',
  shopping: 'kitchen_dashboard_shopping_items',
  reminder: 'kitchen_dashboard_reminders',
  note: 'kitchen_dashboard_family_notes',
  timer: 'kitchen_dashboard_timers',
} as const;

function config() {
  const runtime = env as unknown as SupabaseEnv;
  const url = runtime.SUPABASE_URL?.replace(/\/$/, '');
  const key = runtime.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  return { url, key };
}

async function request<T>(resource: string, init: RequestInit = {}): Promise<T> {
  const { url, key } = config();
  const headers = new Headers(init.headers);
  headers.set('apikey', key);
  headers.set('Authorization', `Bearer ${key}`);
  headers.set('Content-Type', 'application/json');
  const response = await fetch(`${url}/rest/v1/${resource}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${detail || response.statusText}`);
  }
  if (response.status === 204 || response.headers.get('content-length') === '0') return undefined as T;
  return response.json() as Promise<T>;
}

function normalize<T extends SupabaseRow>(rows: T[]) {
  return rows.map((row) => ({
    ...row,
    ...(typeof row.completed === 'boolean' ? { completed: row.completed ? 1 : 0 } : {}),
    ...(typeof row.pinned === 'boolean' ? { pinned: row.pinned ? 1 : 0 } : {}),
  }));
}

export async function initializeStore() { config(); }

export async function getDashboard(day: string) {
  const [meals, shopping, reminders, notes, timers] = await Promise.all([
    request<MealRecord[]>(`${TABLES.meals}?select=*&day=eq.${encodeURIComponent(day)}`),
    request<ShoppingRecord[]>(`${TABLES.shopping}?select=*&order=completed.asc,created_at.desc`),
    request<ReminderRecord[]>(`${TABLES.reminder}?select=*&order=completed.asc,due_at.asc`),
    request<FamilyNoteRecord[]>(`${TABLES.note}?select=*&order=completed.asc,pinned.desc,created_at.desc`),
    request<KitchenTimerRecord[]>(`${TABLES.timer}?select=*&order=completed.asc,ends_at.asc`),
  ]);
  const slotOrder = { breakfast: 0, lunch: 1, dinner: 2 };
  meals.sort((a, b) => slotOrder[a.slot] - slotOrder[b.slot]);
  return {
    meals: normalize(meals) as MealRecord[], shopping: normalize(shopping) as ShoppingRecord[],
    reminders: normalize(reminders) as ReminderRecord[], notes: normalize(notes) as FamilyNoteRecord[],
    timers: normalize(timers) as KitchenTimerRecord[],
  };
}

export async function toggleRecord(resource: 'shopping' | 'reminder' | 'note' | 'timer', id: string, completed: boolean) {
  await request(`${TABLES[resource]}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ completed }) });
}

export async function addShopping(name: string) {
  await request(TABLES.shopping, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ id: crypto.randomUUID(), name: name.trim(), completed: false, created_at: new Date().toISOString() }) });
}

export async function setMeal(day: string, slot: string, dish: string, time?: string) {
  const defaultTime = slot === 'breakfast' ? '8:30 AM' : slot === 'lunch' ? '1:15 PM' : '8:00 PM';
  await request(`${TABLES.meals}?on_conflict=day,slot`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: crypto.randomUUID(), day, slot, dish: dish.trim(), time: time || defaultTime, created_at: new Date().toISOString() }) });
}

export async function addReminder(title: string, dueAt: string, recurrence: string | null) {
  await request(TABLES.reminder, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ id: crypto.randomUUID(), title: title.trim(), due_at: dueAt, recurrence, completed: false, created_at: new Date().toISOString() }) });
}

export async function acknowledgeReminder(id: string) {
  const rows = await request<ReminderRecord[]>(`${TABLES.reminder}?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  const reminder = rows[0];
  if (!reminder) return;
  if (!reminder.recurrence) {
    await request(`${TABLES.reminder}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ completed: true }) });
    return;
  }
  const intervalDays = reminder.recurrence === 'DAILY' ? 1 : 7;
  const next = new Date(reminder.due_at);
  const now = Date.now();
  do next.setUTCDate(next.getUTCDate() + intervalDays); while (next.getTime() <= now);
  await request(`${TABLES.reminder}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ due_at: next.toISOString(), completed: false }) });
}

export async function snoozeReminder(id: string, minutes = 10) {
  const safeMinutes = Math.min(1_440, Math.max(1, Math.round(minutes)));
  await request(`${TABLES.reminder}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ due_at: new Date(Date.now() + safeMinutes * 60_000).toISOString(), completed: false }) });
}

export async function addFamilyNote(message: string) {
  await request(TABLES.note, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ id: crypto.randomUUID(), message: message.trim(), pinned: false, completed: false, created_at: new Date().toISOString() }) });
}

export async function setFamilyNotePinned(id: string, pinned: boolean) {
  await request(`${TABLES.note}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ pinned }) });
}

export async function startKitchenTimer(label: string, endsAt: string) {
  await request(TABLES.timer, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ id: crypto.randomUUID(), label: label.trim(), ends_at: endsAt, completed: false, created_at: new Date().toISOString() }) });
}

export async function applyCommand(action: CommandAction) {
  if (action.type === 'add_reminder') await addReminder(action.title, action.dueAt, action.recurrence);
  if (action.type === 'add_shopping') await Promise.all(action.items.map((item) => addShopping(item)));
  if (action.type === 'set_meal') await setMeal(action.day, action.slot, action.dish);
  if (action.type === 'add_family_note') await addFamilyNote(action.message);
  if (action.type === 'start_timer') await startKitchenTimer(action.label, action.endsAt);
}
