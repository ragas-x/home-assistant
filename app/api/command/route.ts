import { NextResponse } from 'next/server';
import { parseCommand } from '@/lib/command-parser';
import { applyCommand, initializeStore } from '@/lib/store';

export async function POST(request: Request) {
  const body = (await request.json()) as { text?: string; now?: string };
  if (!body.text?.trim()) return NextResponse.json({ error: 'Say or type a command first.' }, { status: 400 });
  await initializeStore();
  const action = parseCommand(body.text, body.now ? new Date(body.now) : new Date());
  await applyCommand(action);
  return NextResponse.json(action);
}
