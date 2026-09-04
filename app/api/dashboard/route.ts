import { NextResponse } from 'next/server';
import { addFamilyNote, addReminder, addShopping, getDashboard, initializeStore, seedStore, setFamilyNotePinned, setMeal, startKitchenTimer, toggleRecord } from '@/lib/store';

export async function GET(request: Request) {
  const day = new URL(request.url).searchParams.get('day') || new Date().toISOString().slice(0, 10);
  await initializeStore();
  await seedStore(day);
  return NextResponse.json(await getDashboard(day));
}

export async function POST(request: Request) {
  await initializeStore();
  const body = (await request.json()) as Record<string, unknown>;
  if (body.op === 'toggle' && typeof body.id === 'string' && (body.resource === 'shopping' || body.resource === 'reminder' || body.resource === 'note' || body.resource === 'timer')) {
    await toggleRecord(body.resource, body.id, Boolean(body.completed));
  } else if (body.op === 'addShopping' && typeof body.name === 'string') {
    await addShopping(body.name);
  } else if (body.op === 'setMeal' && typeof body.day === 'string' && typeof body.slot === 'string' && typeof body.dish === 'string') {
    await setMeal(body.day, body.slot, body.dish, typeof body.time === 'string' ? body.time : undefined);
  } else if (body.op === 'addReminder' && typeof body.title === 'string' && typeof body.dueAt === 'string') {
    await addReminder(body.title, body.dueAt, typeof body.recurrence === 'string' ? body.recurrence : null);
  } else if (body.op === 'addFamilyNote' && typeof body.message === 'string') {
    await addFamilyNote(body.message);
  } else if (body.op === 'pinFamilyNote' && typeof body.id === 'string') {
    await setFamilyNotePinned(body.id, Boolean(body.pinned));
  } else if (body.op === 'startTimer' && typeof body.label === 'string' && typeof body.endsAt === 'string') {
    await startKitchenTimer(body.label, body.endsAt);
  } else {
    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
