import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
