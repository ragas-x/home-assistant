import { env } from 'cloudflare:workers';
import type { CommandAction } from './command-parser';

export type ReminderRecord = {
  id: string;
  title: string;
  due_at: string;
  recurrence: string | null;
  completed: number;
  created_at: string;
};

export type ShoppingRecord = {
  id: string;
  name: string;
  completed: number;
  created_at: string;
};

export type MealRecord = {
  id: string;
  day: string;
  slot: 'breakfast' | 'lunch' | 'dinner';
  dish: string;
  time: string;
  created_at: string;
};

function db() {
  if (!env.DB) throw new Error('The household database is not available.');
  return env.DB;
}

export async function initializeStore() {
  const database = db();
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      due_at TEXT NOT NULL,
      recurrence TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS shopping_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS meals (
      id TEXT PRIMARY KEY,
      day TEXT NOT NULL,
      slot TEXT NOT NULL,
      dish TEXT NOT NULL,
      time TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_reminders_due_at ON reminders(due_at)'),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_shopping_open ON shopping_items(completed) WHERE completed = 0'),
    database.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_meals_day_slot ON meals(day, slot)'),
  ]);
}

export async function seedStore(day: string) {
  const database = db();
  const count = await database.prepare('SELECT COUNT(*) AS count FROM meals').first<{ count: number }>();
  if (Number(count?.count || 0) > 0) return;
  const now = new Date().toISOString();
  const inTwoHours = new Date(Date.now() + 2 * 3_600_000).toISOString();
  const tonight = new Date(Date.now() + 5 * 3_600_000).toISOString();
  await database.batch([
    database.prepare('INSERT INTO meals (id, day, slot, dish, time, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), day, 'breakfast', 'Poha, fruit & chai', '8:30 AM', now),
    database.prepare('INSERT INTO meals (id, day, slot, dish, time, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), day, 'lunch', 'Rajma chawal & kachumber', '1:15 PM', now),
    database.prepare('INSERT INTO meals (id, day, slot, dish, time, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), day, 'dinner', 'Palak paneer & roti', '8:00 PM', now),
    database.prepare('INSERT INTO shopping_items (id, name, completed, created_at) VALUES (?, ?, 0, ?)').bind(crypto.randomUUID(), 'Coriander', now),
    database.prepare('INSERT INTO shopping_items (id, name, completed, created_at) VALUES (?, ?, 0, ?)').bind(crypto.randomUUID(), 'Dahi', now),
    database.prepare('INSERT INTO shopping_items (id, name, completed, created_at) VALUES (?, ?, 0, ?)').bind(crypto.randomUUID(), 'Atta', now),
    database.prepare('INSERT INTO shopping_items (id, name, completed, created_at) VALUES (?, ?, 0, ?)').bind(crypto.randomUUID(), 'Milk', now),
    database.prepare('INSERT INTO shopping_items (id, name, completed, created_at) VALUES (?, ?, 0, ?)').bind(crypto.randomUUID(), 'Green chillies', now),
    database.prepare('INSERT INTO reminders (id, title, due_at, recurrence, completed, created_at) VALUES (?, ?, ?, ?, 0, ?)').bind(crypto.randomUUID(), 'Soak rajma for tomorrow', inTwoHours, null, now),
    database.prepare('INSERT INTO reminders (id, title, due_at, recurrence, completed, created_at) VALUES (?, ?, ?, ?, 0, ?)').bind(crypto.randomUUID(), 'Take evening medicine', tonight, 'DAILY', now),
  ]);
}

export async function getDashboard(day: string) {
  const database = db();
  const [meals, shopping, reminders] = await Promise.all([
    database.prepare('SELECT * FROM meals WHERE day = ? ORDER BY CASE slot WHEN \'breakfast\' THEN 1 WHEN \'lunch\' THEN 2 ELSE 3 END').bind(day).all<MealRecord>(),
    database.prepare('SELECT * FROM shopping_items ORDER BY completed ASC, created_at DESC').all<ShoppingRecord>(),
    database.prepare('SELECT * FROM reminders ORDER BY completed ASC, due_at ASC').all<ReminderRecord>(),
  ]);
  return { meals: meals.results, shopping: shopping.results, reminders: reminders.results };
}

export async function toggleRecord(resource: 'shopping' | 'reminder', id: string, completed: boolean) {
  const table = resource === 'shopping' ? 'shopping_items' : 'reminders';
  await db().prepare(`UPDATE ${table} SET completed = ? WHERE id = ?`).bind(completed ? 1 : 0, id).run();
}

export async function addShopping(name: string) {
  await db().prepare('INSERT INTO shopping_items (id, name, completed, created_at) VALUES (?, ?, 0, ?)').bind(crypto.randomUUID(), name.trim(), new Date().toISOString()).run();
}

export async function setMeal(day: string, slot: string, dish: string, time?: string) {
  const defaultTime = slot === 'breakfast' ? '8:30 AM' : slot === 'lunch' ? '1:15 PM' : '8:00 PM';
  await db().prepare(`INSERT INTO meals (id, day, slot, dish, time, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(day, slot) DO UPDATE SET dish = excluded.dish, time = excluded.time`).bind(
    crypto.randomUUID(), day, slot, dish.trim(), time || defaultTime, new Date().toISOString(),
  ).run();
}

export async function addReminder(title: string, dueAt: string, recurrence: string | null) {
  await db().prepare('INSERT INTO reminders (id, title, due_at, recurrence, completed, created_at) VALUES (?, ?, ?, ?, 0, ?)').bind(
    crypto.randomUUID(), title.trim(), dueAt, recurrence, new Date().toISOString(),
  ).run();
}

export async function applyCommand(action: CommandAction) {
  if (action.type === 'add_reminder') await addReminder(action.title, action.dueAt, action.recurrence);
  if (action.type === 'add_shopping') {
    for (const item of action.items) await addShopping(item);
  }
  if (action.type === 'set_meal') await setMeal(action.day, action.slot, action.dish);
}
