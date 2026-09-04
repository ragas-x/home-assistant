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

export type FamilyNoteRecord = {
  id: string;
  message: string;
  pinned: number;
  completed: number;
  created_at: string;
};

export type KitchenTimerRecord = {
  id: string;
  label: string;
  ends_at: string;
  completed: number;
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
    database.prepare(`CREATE TABLE IF NOT EXISTS family_notes (
      id TEXT PRIMARY KEY,
      message TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS kitchen_timers (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_reminders_due_at ON reminders(due_at)'),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_shopping_open ON shopping_items(completed) WHERE completed = 0'),
    database.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_meals_day_slot ON meals(day, slot)'),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_kitchen_timers_open ON kitchen_timers(completed, ends_at)'),
  ]);
  const noteColumns = await database.prepare("PRAGMA table_info('family_notes')").all<{ name: string }>();
  if (!noteColumns.results.some((column) => column.name === 'pinned')) {
    try {
      await database.prepare('ALTER TABLE family_notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0').run();
    } catch (error) {
      // Another request may have upgraded the shared database concurrently.
      const refreshedColumns = await database.prepare("PRAGMA table_info('family_notes')").all<{ name: string }>();
      if (!refreshedColumns.results.some((column) => column.name === 'pinned')) throw error;
    }
  }
  await database.batch([
    database.prepare('DROP INDEX IF EXISTS idx_family_notes_open'),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_family_notes_priority ON family_notes(completed, pinned DESC, created_at DESC)'),
  ]);
  await database.prepare('PRAGMA optimize').run();
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
  const [meals, shopping, reminders, notes, timers] = await Promise.all([
    database.prepare('SELECT * FROM meals WHERE day = ? ORDER BY CASE slot WHEN \'breakfast\' THEN 1 WHEN \'lunch\' THEN 2 ELSE 3 END').bind(day).all<MealRecord>(),
    database.prepare('SELECT * FROM shopping_items ORDER BY completed ASC, created_at DESC').all<ShoppingRecord>(),
    database.prepare('SELECT * FROM reminders ORDER BY completed ASC, due_at ASC').all<ReminderRecord>(),
    database.prepare('SELECT * FROM family_notes ORDER BY completed ASC, pinned DESC, created_at DESC').all<FamilyNoteRecord>(),
    database.prepare('SELECT * FROM kitchen_timers ORDER BY completed ASC, ends_at ASC').all<KitchenTimerRecord>(),
  ]);
  return { meals: meals.results, shopping: shopping.results, reminders: reminders.results, notes: notes.results, timers: timers.results };
}

export async function toggleRecord(resource: 'shopping' | 'reminder' | 'note' | 'timer', id: string, completed: boolean) {
  const table = resource === 'shopping' ? 'shopping_items' : resource === 'reminder' ? 'reminders' : resource === 'note' ? 'family_notes' : 'kitchen_timers';
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

export async function addFamilyNote(message: string) {
  await db().prepare('INSERT INTO family_notes (id, message, pinned, completed, created_at) VALUES (?, ?, 0, 0, ?)').bind(
    crypto.randomUUID(), message.trim(), new Date().toISOString(),
  ).run();
}

export async function setFamilyNotePinned(id: string, pinned: boolean) {
  await db().prepare('UPDATE family_notes SET pinned = ? WHERE id = ?').bind(pinned ? 1 : 0, id).run();
}

export async function startKitchenTimer(label: string, endsAt: string) {
  await db().prepare('INSERT INTO kitchen_timers (id, label, ends_at, completed, created_at) VALUES (?, ?, ?, 0, ?)').bind(
    crypto.randomUUID(), label.trim(), endsAt, new Date().toISOString(),
  ).run();
}

export async function applyCommand(action: CommandAction) {
  if (action.type === 'add_reminder') await addReminder(action.title, action.dueAt, action.recurrence);
  if (action.type === 'add_shopping') {
    for (const item of action.items) await addShopping(item);
  }
  if (action.type === 'set_meal') await setMeal(action.day, action.slot, action.dish);
  if (action.type === 'add_family_note') await addFamilyNote(action.message);
  if (action.type === 'start_timer') await startKitchenTimer(action.label, action.endsAt);
}
