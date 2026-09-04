import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const reminders = sqliteTable('reminders', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  dueAt: text('due_at').notNull(),
  recurrence: text('recurrence'),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
});

export const shoppingItems = sqliteTable('shopping_items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
});

export const meals = sqliteTable(
  'meals',
  {
    id: text('id').primaryKey(),
    day: text('day').notNull(),
    slot: text('slot', { enum: ['breakfast', 'lunch', 'dinner'] }).notNull(),
    dish: text('dish').notNull(),
    time: text('time').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('idx_meals_day_slot').on(table.day, table.slot)],
);

export const familyNotes = sqliteTable(
  'family_notes',
  {
    id: text('id').primaryKey(),
    message: text('message').notNull(),
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_family_notes_priority').on(table.completed, table.pinned, table.createdAt)],
);

export const kitchenTimers = sqliteTable(
  'kitchen_timers',
  {
    id: text('id').primaryKey(),
    label: text('label').notNull(),
    endsAt: text('ends_at').notNull(),
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_kitchen_timers_open').on(table.completed, table.endsAt)],
);
