import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'audio/mp3',
  'audio/mp4',
  'audio/mpeg',
  'audio/m4a',
  'audio/wav',
  'audio/webm',
  'video/mp4',
]);

function openAiApiKey() {
  return env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
}

export async function POST(request: Request) {
  const apiKey = openAiApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Voice transcription is not configured yet. Add OPENAI_API_KEY to the server environment.', code: 'VOICE_NOT_CONFIGURED' },
      { status: 503 },
    );
  }

  const body = await request.formData();
  const audio = body.get('audio');
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: 'No microphone audio was received.' }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'That recording is too long. Keep voice commands under 12 seconds.' }, { status: 413 });
  }
  if (audio.type && !ALLOWED_TYPES.has(audio.type.split(';')[0])) {
    return NextResponse.json({ error: 'This browser recorded an unsupported audio format.' }, { status: 415 });
  }

  const transcription = new FormData();
  transcription.append('file', audio, audio.name || 'voice-command.webm');
  transcription.append('model', 'gpt-4o-mini-transcribe');
  transcription.append(
    'prompt',
    'A short household command in Indian English, Hindi, Hinglish, or Kannada. Preserve Indian food, grocery, festival, and family names accurately.',
  );

  try {
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: transcription,
    });
    const result = (await response.json()) as { text?: string; error?: { message?: string } };
    if (!response.ok) {
      return NextResponse.json(
        { error: result.error?.message || 'The transcription service could not process that recording.' },
        { status: response.status >= 500 ? 502 : response.status },
      );
    }
    return NextResponse.json({ text: result.text?.trim() || '' });
  } catch {
    return NextResponse.json({ error: 'The transcription service is unreachable. Try again in a moment.' }, { status: 502 });
  }
}
