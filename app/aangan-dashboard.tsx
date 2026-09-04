'use client';

import { SyntheticEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  CloudSun,
  LoaderCircle,
  Mic,
  MoonStar,
  Plus,
  Repeat2,
  Send,
  ShoppingBasket,
  Sparkles,
  Sunrise,
  UtensilsCrossed,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { PanchangaSnapshot } from '@/lib/panchanga';

type Meal = { id: string; day: string; slot: 'breakfast' | 'lunch' | 'dinner'; dish: string; time: string };
type ShoppingItem = { id: string; name: string; completed: number };
type Reminder = { id: string; title: string; due_at: string; recurrence: string | null; completed: number };
type DashboardData = { meals: Meal[]; shopping: ShoppingItem[]; reminders: Reminder[] };

type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: () => void;
  onend: () => void;
  onerror: () => void;
  onresult: (event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void;
  start: () => void;
};

type TranscriptionResponse = { text?: string; error?: string; code?: string };

const HOUSEHOLD_TIME_ZONE = 'Asia/Kolkata';

function createStarterData(initialNow: string): DashboardData {
  const timestamp = new Date(initialNow).getTime();
  return {
    meals: [
      { id: 'breakfast', day: '', slot: 'breakfast', dish: 'Poha, fruit & chai', time: '8:30 AM' },
      { id: 'lunch', day: '', slot: 'lunch', dish: 'Rajma chawal & kachumber', time: '1:15 PM' },
      { id: 'dinner', day: '', slot: 'dinner', dish: 'Palak paneer & roti', time: '8:00 PM' },
    ],
    shopping: ['Coriander', 'Dahi', 'Atta', 'Milk', 'Green chillies'].map((name, index) => ({ id: `item-${index}`, name, completed: 0 })),
    reminders: [
      { id: 'reminder-1', title: 'Soak rajma for tomorrow', due_at: new Date(timestamp + 2 * 3_600_000).toISOString(), recurrence: null, completed: 0 },
      { id: 'reminder-2', title: 'Take evening medicine', due_at: new Date(timestamp + 5 * 3_600_000).toISOString(), recurrence: 'DAILY', completed: 0 },
    ],
  };
}

const mealTone = { breakfast: 'sun', lunch: 'leaf', dinner: 'plum' } as const;
const mealLabels = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
const examples = [
  'Remind me 10 days from now to book the gas cylinder',
  'Remind me every day at 7 PM to water the tulsi',
  'Add dahi and coriander to the shopping list',
];

function localDay(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: HOUSEHOLD_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function formatReminder(reminder: Reminder) {
  const date = new Date(reminder.due_at);
  const time = date.toLocaleTimeString('en-IN', { timeZone: HOUSEHOLD_TIME_ZONE, hour: 'numeric', minute: '2-digit' });
  if (reminder.recurrence === 'DAILY') return `Every day · ${time}`;
  if (reminder.recurrence?.startsWith('WEEKLY')) return `Every week · ${time}`;
  return date.toLocaleString('en-IN', { timeZone: HOUSEHOLD_TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export default function KitchenDashboard({ initialNow, panchanga }: { initialNow: string; panchanga: PanchangaSnapshot }) {
  const renderDate = useMemo(() => new Date(initialNow), [initialNow]);
  const [mode, setMode] = useState<'kitchen' | 'manage'>('kitchen');
  const [data, setData] = useState<DashboardData>(() => createStarterData(initialNow));
  const [commandOpen, setCommandOpen] = useState(false);
  const [command, setCommand] = useState('');
  const [commandStatus, setCommandStatus] = useState('');
  const [processing, setProcessing] = useState(false);
  const [listItem, setListItem] = useState('');
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [mealDish, setMealDish] = useState('');
  const [listening, setListening] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const voiceTimeoutRef = useRef<number | null>(null);
  const voiceCancelledRef = useRef(false);
  const today = useMemo(() => localDay(renderDate), [renderDate]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/dashboard?day=${today}`, { cache: 'no-store' });
      if (response.ok) setData((await response.json()) as DashboardData);
    } catch {
      setCommandStatus('The dashboard is offline. Your current view is still available.');
    }
  }, [today]);

  useEffect(() => {
    void fetch(`/api/dashboard?day=${today}`, { cache: 'no-store' })
      .then(async (response) => {
        if (response.ok) setData((await response.json()) as DashboardData);
      })
      .catch(() => setCommandStatus('The dashboard is offline. Your current view is still available.'));
  }, [today]);

  async function mutate(payload: Record<string, unknown>) {
    const response = await fetch('/api/dashboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Could not save that change.');
    await refresh();
  }

  async function runCommand(text: string) {
    if (!text.trim()) return;
    setProcessing(true);
    setCommandStatus('Understanding…');
    try {
      const response = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, now: new Date().toISOString() }),
      });
      const result = (await response.json()) as { confirmation?: string; type?: string; error?: string };
      if (!response.ok) throw new Error(result.error || 'I could not do that.');
      setCommandStatus(result.confirmation || 'Done.');
      if (result.type !== 'unknown') {
        setCommand('');
        await refresh();
      }
    } catch (error) {
      setCommandStatus(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setProcessing(false);
    }
  }

  function clearVoiceTimeout() {
    if (voiceTimeoutRef.current !== null) {
      window.clearTimeout(voiceTimeoutRef.current);
      voiceTimeoutRef.current = null;
    }
  }

  function releaseMicrophone() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    clearVoiceTimeout();
    setListening(false);
  }

  function stopVoice(cancelled = false) {
    voiceCancelledRef.current = cancelled;
    clearVoiceTimeout();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      if (!cancelled) setCommandStatus('Transcribing…');
      recorder.stop();
      return;
    }
    releaseMicrophone();
  }

  function beginNativeVoice() {
    const voiceWindow = window as unknown as {
      SpeechRecognition?: new () => RecognitionLike;
      webkitSpeechRecognition?: new () => RecognitionLike;
    };
    const Constructor = voiceWindow.SpeechRecognition || voiceWindow.webkitSpeechRecognition;
    if (!Constructor) {
      setCommandStatus('Voice capture is unavailable in this browser. You can still type the request below.');
      return;
    }
    const recognition = new Constructor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-IN';
    recognition.onstart = () => { setListening(true); setCommandStatus('Listening…'); };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => { setListening(false); setCommandStatus('Safari could not capture that. Check microphone permission and try again.'); };
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript || '';
      setCommand(transcript);
      void runCommand(transcript);
    };
    recognition.start();
  }

  async function transcribeRecording(audio: Blob, extension: string) {
    if (!audio.size) {
      setCommandStatus('I did not receive any audio. Tap the microphone and try again.');
      return;
    }

    setCommandStatus('Transcribing…');
    try {
      const payload = new FormData();
      payload.append('audio', audio, `voice-command.${extension}`);
      const response = await fetch('/api/transcribe', { method: 'POST', body: payload });
      const result = (await response.json()) as TranscriptionResponse;
      if (!response.ok) throw new Error(result.error || 'I could not transcribe that audio.');

      const transcript = result.text?.trim() || '';
      if (!transcript) throw new Error('I could not hear any words. Please try again.');
      setCommand(transcript);
      await runCommand(transcript);
    } catch (error) {
      setCommandStatus(error instanceof Error ? error.message : 'Voice transcription failed.');
    }
  }

  async function beginVoice() {
    setCommandOpen(true);

    if (recorderRef.current?.state === 'recording') {
      stopVoice();
      return;
    }

    setCommandStatus('');
    voiceCancelledRef.current = false;

    if (!window.isSecureContext) {
      setCommandStatus('The iPad microphone requires HTTPS. Open this dashboard through an HTTPS address, then try again.');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      beginNativeVoice();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const mimeType = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
        .find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        releaseMicrophone();
        setCommandStatus('The microphone stopped unexpectedly. Reload the page and try again.');
      };
      recorder.onstop = () => {
        const cancelled = voiceCancelledRef.current;
        const recordingType = recorder.mimeType || mimeType || 'audio/webm';
        const extension = recordingType.includes('mp4') ? 'm4a' : recordingType.includes('wav') ? 'wav' : 'webm';
        const audio = new Blob(chunks, { type: recordingType });
        releaseMicrophone();
        if (!cancelled) void transcribeRecording(audio, extension);
      };

      recorder.start(250);
      setListening(true);
      setCommandStatus('Listening… tap the microphone when you are done.');
      voiceTimeoutRef.current = window.setTimeout(() => stopVoice(), 12_000);
    } catch (error) {
      releaseMicrophone();
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotAllowedError') {
        setCommandStatus('Microphone access is blocked. Allow it for this website in Safari, then try again.');
      } else if (name === 'NotReadableError') {
        setCommandStatus('The iPad microphone is busy. Close other audio apps, reload this page, and try again.');
      } else {
        setCommandStatus('I could not open the microphone. Reload the page and try again.');
      }
    }
  }

  function setCommandDialogOpen(open: boolean) {
    setCommandOpen(open);
    if (!open && listening) stopVoice(true);
  }

  async function toggle(resource: 'shopping' | 'reminder', id: string, completed: boolean) {
    setData((current) => ({
      ...current,
      [resource === 'shopping' ? 'shopping' : 'reminders']:
        current[resource === 'shopping' ? 'shopping' : 'reminders'].map((item) => item.id === id ? { ...item, completed: completed ? 1 : 0 } : item),
    }));
    try { await mutate({ op: 'toggle', resource, id, completed }); } catch { await refresh(); }
  }

  async function submitListItem(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!listItem.trim()) return;
    const name = listItem;
    setListItem('');
    await mutate({ op: 'addShopping', name });
  }

  function openMeal(meal: Meal) {
    setEditingMeal(meal);
    setMealDish(meal.dish);
  }

  async function saveMeal(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingMeal || !mealDish.trim()) return;
    await mutate({ op: 'setMeal', day: today, slot: editingMeal.slot, dish: mealDish, time: editingMeal.time });
    setEditingMeal(null);
  }

  const dateLabel = new Intl.DateTimeFormat('en-IN', {
    timeZone: HOUSEHOLD_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(renderDate);
  const householdHour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: HOUSEHOLD_TIME_ZONE,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(renderDate));
  const greeting = householdHour < 12 ? 'Good morning' : householdHour < 17 ? 'Good afternoon' : 'Good evening';
  const openShopping = data.shopping.filter((item) => !item.completed);
  const openReminders = data.reminders.filter((item) => !item.completed);

  return (
    <main className={`min-h-screen bg-background text-foreground ${mode === 'kitchen' ? 'kitchen-mode' : ''}`}>
      <header className="kitchen-header sticky top-0 z-30 grid h-[68px] grid-cols-[1fr_auto_1fr] items-center border-b border-border/60 bg-background/88 px-5 backdrop-blur-xl lg:px-7">
        <div className="flex min-w-0 items-center gap-2.5 text-muted-foreground">
          <CalendarDays className="size-[17px] shrink-0 text-primary/80" />
          <span className="hidden truncate text-[12px] font-semibold sm:block">{dateLabel}</span>
        </div>

        <nav aria-label="Dashboard view" className="flex h-11 items-center gap-1 rounded-full bg-secondary/80 p-1">
          <button onClick={() => setMode('kitchen')} aria-current={mode === 'kitchen' ? 'page' : undefined} className={`inline-flex h-9 min-w-[84px] items-center justify-center rounded-full px-4 pt-px text-[12px] font-semibold leading-none transition-colors ${mode === 'kitchen' ? 'bg-card text-foreground ring-1 ring-border/50' : 'text-muted-foreground hover:text-foreground'}`}>Kitchen</button>
          <button onClick={() => setMode('manage')} aria-current={mode === 'manage' ? 'page' : undefined} className={`inline-flex h-9 min-w-[84px] items-center justify-center rounded-full px-4 pt-px text-[12px] font-semibold leading-none transition-colors ${mode === 'manage' ? 'bg-card text-foreground ring-1 ring-border/50' : 'text-muted-foreground hover:text-foreground'}`}>Manage</button>
        </nav>

        <div className="flex items-center justify-self-end gap-2 text-[12px] font-semibold text-muted-foreground">
          <CloudSun className="size-[17px] text-primary/80" />
          <span>29°<span className="hidden md:inline"> · Bellary</span></span>
        </div>
      </header>

      {mode === 'kitchen' ? (
        <KitchenView
          data={data}
          dateLabel={dateLabel}
          greeting={greeting}
          openShopping={openShopping}
          openReminders={openReminders}
          panchanga={panchanga}
          onVoice={beginVoice}
          onManage={() => setMode('manage')}
          onMeal={openMeal}
          onToggle={toggle}
        />
      ) : (
        <ManageView
          data={data}
          openShopping={openShopping}
          openReminders={openReminders}
          listItem={listItem}
          onListItem={setListItem}
          onAddList={submitListItem}
          onVoice={beginVoice}
          onMeal={openMeal}
          onToggle={toggle}
        />
      )}

      <button onClick={() => void beginVoice()} className={`floating-voice-button ${listening ? 'is-listening' : ''}`} aria-label={listening ? 'Stop listening' : 'Speak a command'}><Mic className="size-5" /></button>

      <Dialog open={commandOpen} onOpenChange={setCommandDialogOpen}>
        <DialogContent className="max-w-[560px] gap-0 overflow-hidden rounded-[26px] border-border bg-card p-0 shadow-2xl">
          <div className="bg-[#2d3434] p-6 text-white sm:p-7">
            <DialogHeader>
              <div className="mb-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.13em] text-white/55"><span className={`size-2 rounded-full ${listening ? 'animate-pulse bg-[#b9dce2]' : 'bg-white/30'}`} /> Voice command</div>
              <DialogTitle className="font-display text-[30px] font-semibold tracking-[-0.035em]">What does the home need?</DialogTitle>
              <DialogDescription className="text-white/55">Speak naturally. I understand relative dates and repeating schedules.</DialogDescription>
            </DialogHeader>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); void runCommand(command); }} className="p-5 sm:p-6">
            <div className="flex gap-2">
              <Input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Remind me every day at 7 PM…" className="h-12 rounded-xl bg-background px-4 text-[14px]" />
              <Button type="button" onClick={() => void beginVoice()} variant="outline" className={`size-12 rounded-xl ${listening ? 'border-primary bg-secondary text-primary' : ''}`} aria-label={listening ? 'Stop listening' : 'Listen'}><Mic className="size-[18px]" /></Button>
              <Button type="submit" disabled={!command.trim() || processing} className="size-12 rounded-xl" aria-label="Run command">{processing ? <LoaderCircle className="animate-spin" /> : <Send />}</Button>
            </div>
            {commandStatus && <output className="mt-4 block rounded-xl bg-secondary px-4 py-3 text-[13px] font-medium leading-relaxed text-secondary-foreground">{commandStatus}</output>}
            <div className="mt-5">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Try saying</p>
              <div className="space-y-2">
                {examples.map((example) => <button key={example} type="button" onClick={() => setCommand(example)} className="block w-full rounded-xl border border-border/70 px-3 py-2.5 text-left text-[12px] font-medium transition-colors hover:bg-secondary">“{example}”</button>)}
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingMeal)} onOpenChange={(open) => !open && setEditingMeal(null)}>
        <DialogContent className="rounded-[24px] p-6 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-semibold">Change {editingMeal ? mealLabels[editingMeal.slot].toLowerCase() : 'meal'}</DialogTitle>
            <DialogDescription>Keep the plan simple enough to read at a glance.</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveMeal}>
            <Input value={mealDish} onChange={(event) => setMealDish(event.target.value)} className="mt-2 h-12 rounded-xl px-4" placeholder="What are you having?" />
            <DialogFooter className="mt-6 -mx-6 -mb-6 px-6 py-4">
              <Button type="submit" className="h-10 rounded-xl px-5">Save meal</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function KitchenView({ data, dateLabel, greeting, openShopping, openReminders, panchanga, onVoice, onManage, onMeal, onToggle }: {
  data: DashboardData; dateLabel: string; greeting: string; openShopping: ShoppingItem[]; openReminders: Reminder[]; panchanga: PanchangaSnapshot;
  onVoice: () => void; onManage: () => void; onMeal: (meal: Meal) => void;
  onToggle: (resource: 'shopping' | 'reminder', id: string, completed: boolean) => void;
}) {
  return (
    <div className="kitchen-view mx-auto grid max-w-[1500px] gap-4 p-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(290px,.78fr)] lg:p-5">
      <section className="min-w-0">
        <div className="kitchen-greeting mb-4 flex items-end justify-between px-1">
          <div>
            <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-primary">{dateLabel}</p>
            <h1 className="font-display text-[clamp(32px,3.6vw,48px)] font-semibold leading-[1.04] tracking-[-0.045em]">{greeting}, home.</h1>
          </div>
          <p className="hidden pb-1 text-right text-sm leading-relaxed text-muted-foreground md:block">Everything that matters,<br />at a glance.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {data.meals.map((meal, index) => (
            <article key={meal.id} className={`meal-card meal-${mealTone[meal.slot]} group`}>
              <div className="flex items-center justify-between">
                <span className="meal-icon"><UtensilsCrossed className="size-4" /></span>
                {index === 0 && <span className="rounded-full bg-white/55 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]">Next</span>}
              </div>
              <div className="meal-card-content mt-7">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] opacity-65">{mealLabels[meal.slot]} · {meal.time}</p>
                <h2 className="meal-card-title mt-1.5 font-display text-[21px] font-semibold leading-[1.12] tracking-[-0.025em]">{meal.dish}</h2>
              </div>
              <button onClick={() => onMeal(meal)} className="meal-card-change mt-3 flex items-center gap-1 text-[12px] font-semibold opacity-60 transition-opacity group-hover:opacity-100">Change <ChevronRight className="size-3.5" /></button>
            </article>
          ))}
        </div>

        <div className="secondary-grid mt-4 grid gap-4 md:grid-cols-[1.15fr_.85fr]">
          <article className="surface-card">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2.5"><span className="section-icon"><Bell className="size-4" /></span><h2 className="font-display text-xl font-semibold tracking-[-0.025em]">Coming up</h2></div>
              <Button onClick={onVoice} variant="ghost" size="sm" className="rounded-full text-muted-foreground"><Plus /> Add</Button>
            </div>
            <div className="divide-y divide-border/70">
              {openReminders.slice(0, 3).map((reminder) => (
                <div key={reminder.id} className="grid grid-cols-[1fr_auto] items-center gap-3 py-3.5">
                  <div><p className="text-[14px] font-semibold">{reminder.title}</p><p className="mt-1 text-[11px] font-medium text-primary">{formatReminder(reminder)}</p></div>
                  <button onClick={() => onToggle('reminder', reminder.id, true)} aria-label={`Complete ${reminder.title}`} className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"><Check className="size-4" /></button>
                </div>
              ))}
              {!openReminders.length && <p className="py-8 text-center text-sm text-muted-foreground">Nothing else needs your attention.</p>}
            </div>
          </article>

          <article className="surface-card">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5"><span className="section-icon"><ShoppingBasket className="size-4" /></span><h2 className="font-display text-xl font-semibold tracking-[-0.025em]">Shopping</h2></div>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold text-secondary-foreground">{openShopping.length} left</span>
            </div>
            <div className="space-y-1">
              {openShopping.slice(0, 3).map((item) => (
                <button key={item.id} onClick={() => onToggle('shopping', item.id, true)} className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left text-sm font-medium hover:text-primary"><span className="grid size-[19px] place-items-center rounded-md border-[1.5px] border-border bg-background" />{item.name}</button>
              ))}
            </div>
            <button onClick={onManage} className="mt-3 flex items-center gap-1 text-[12px] font-bold text-primary">View full list <ChevronRight className="size-3.5" /></button>
          </article>
        </div>
      </section>

      <aside className="min-w-0">
        <PanchangaCard snapshot={panchanga} />
      </aside>
    </div>
  );
}

function PanchangaCard({ snapshot }: { snapshot: PanchangaSnapshot }) {
  const { today, alerts } = snapshot;
  if (!today) {
    return (
      <article className="panchanga-card">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-full bg-white/55 text-[#65777a]"><MoonStar className="size-5" /></span>
          <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#65777a]">Panchanga · Bellary</p><p className="mt-1 text-sm font-semibold">No calendar data for this date</p></div>
        </div>
      </article>
    );
  }

  const observances = [...today.observances, ...(today.aradhane ? [today.aradhane] : [])];
  const visibleAlerts = alerts.slice(0, 2);

  return (
    <article className="panchanga-card">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#65777a]">Panchanga · Bellary</p>
          <h2 lang="kn" className="mt-2 truncate font-display text-[31px] font-bold leading-[1.15] tracking-[-0.015em]" title={today.tithi}>{today.tithi}</h2>
          <p lang="kn" className="mt-1.5 truncate text-sm font-semibold text-[#5f6462]" title={`${today.masa} · ${today.rutu} · ${today.paksha}`}>{today.masa} · {today.rutu} · {today.paksha}</p>
        </div>
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/60 text-[#65777a]"><MoonStar className="size-5" /></span>
      </div>

      <p lang="kn" className="mt-3 truncate text-[9px] font-medium text-[#737875]/80" title={`${today.samvatsara} · ${today.ayana} · ${today.vasara}`}>
        {today.samvatsara} · {today.ayana} · {today.vasara}
      </p>

      {visibleAlerts.length > 0 && (
        <div className="mt-4 space-y-2">
          {visibleAlerts.map((alert) => (
            <div key={`${alert.date}-${alert.title}`} className={`festival-alert ${alert.daysAway === 0 ? 'festival-alert-today' : ''}`}>
              <span className="festival-alert-icon"><Sparkles className="size-3.5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#76674e]">{alert.daysAway === 0 ? 'Today' : `In ${alert.daysAway} day${alert.daysAway === 1 ? '' : 's'}`}</p>
                <p className="truncate text-[12px] font-bold text-[#3f3b33]">{alert.title}{alert.moreCount ? ` · +${alert.moreCount} more` : ''}</p>
              </div>
              {alert.isEkadashi && <span className="rounded-full bg-white/55 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-[#6b624f]">Ekadashi</span>}
            </div>
          ))}
          {alerts.length > visibleAlerts.length && <p className="px-1 text-[9px] font-semibold text-[#767976]">+{alerts.length - visibleAlerts.length} more within five days</p>}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[#858781]/20 pt-4">
        <PanchangaFact label="Nakshatra" value={today.nakshatra} />
        <PanchangaFact label="Yoga" value={today.yoga} />
        <PanchangaFact label="Karana" value={today.karana} />
        <PanchangaFact label="Dina phala" value={today.quality || '—'} />
      </div>

      {observances.length > 0 && (
        <div className="mt-4 rounded-xl bg-white/45 px-3 py-2.5" title={observances.join(' · ')}>
          <p className="text-[9px] font-bold uppercase tracking-[0.11em] text-[#727570]">Today’s observances</p>
          <p lang="kn" className="mt-1 line-clamp-2 text-[11px] font-semibold leading-relaxed text-[#555a57]">
            {observances.slice(0, 2).join(' · ')}{observances.length > 2 ? ` · +${observances.length - 2} more` : ''}
          </p>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/55 px-3 py-2.5 text-[11px] font-semibold text-[#626866]"><Sunrise className="size-4" /> Sunrise {today.sunrise} · Sunset {today.sunset}</div>
    </article>
  );
}

function PanchangaFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#6d7777]/75">{label}</p>
      <p lang="kn" className="mt-1 truncate text-[12px] font-semibold" title={value}>{value}</p>
    </div>
  );
}

function ManageView({ data, openShopping, openReminders, listItem, onListItem, onAddList, onVoice, onMeal, onToggle }: {
  data: DashboardData; openShopping: ShoppingItem[]; openReminders: Reminder[]; listItem: string;
  onListItem: (value: string) => void; onAddList: (event: SyntheticEvent<HTMLFormElement>) => void; onVoice: () => void;
  onMeal: (meal: Meal) => void; onToggle: (resource: 'shopping' | 'reminder', id: string, completed: boolean) => void;
}) {
  return (
    <div className="mx-auto max-w-[1180px] p-5 pb-24 lg:p-9">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="mb-1 text-[11px] font-bold uppercase tracking-[0.13em] text-primary">Household manager</p><h1 className="font-display text-[clamp(34px,5vw,52px)] font-semibold tracking-[-0.045em]">Keep today in rhythm.</h1></div>
        <Button onClick={onVoice} className="h-11 rounded-full px-5"><Mic /> Voice command</Button>
      </div>

      <button onClick={onVoice} className="mb-5 flex w-full items-center gap-4 rounded-[22px] bg-[#2d3434] p-5 text-left text-white shadow-lg transition-transform hover:-translate-y-0.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#b9dce2] text-[#30474d]"><Sparkles className="size-5" /></span>
        <span className="min-w-0 flex-1"><span className="block font-display text-xl">Make a change in plain language</span><span className="mt-0.5 block truncate text-[12px] text-white/50">Try “remind me 10 days from now to book the gas cylinder”</span></span>
        <ChevronRight className="size-5 text-white/35" />
      </button>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="surface-card !p-5 sm:!p-6">
          <div className="mb-5 flex items-center gap-3"><span className="section-icon"><UtensilsCrossed className="size-4" /></span><div><h2 className="font-display text-[22px] font-semibold">Today’s meals</h2><p className="text-[11px] text-muted-foreground">Tap any meal to change it</p></div></div>
          <div className="space-y-2">
            {data.meals.map((meal) => (
              <button key={meal.id} onClick={() => onMeal(meal)} className="flex w-full items-center gap-4 rounded-2xl border border-border/70 bg-background/50 p-4 text-left transition-colors hover:border-primary/40">
                <span className={`size-3 rounded-full meal-dot-${mealTone[meal.slot]}`} />
                <span className="min-w-0 flex-1"><span className="block text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{mealLabels[meal.slot]} · {meal.time}</span><span className="mt-1 block truncate text-sm font-semibold">{meal.dish}</span></span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>

        <section className="surface-card !p-5 sm:!p-6">
          <div className="mb-5 flex items-center justify-between"><div className="flex items-center gap-3"><span className="section-icon"><ShoppingBasket className="size-4" /></span><div><h2 className="font-display text-[22px] font-semibold">Shopping list</h2><p className="text-[11px] text-muted-foreground">{openShopping.length} items left</p></div></div></div>
          <form onSubmit={onAddList} className="mb-3 flex gap-2"><Input value={listItem} onChange={(event) => onListItem(event.target.value)} placeholder="Add an item" className="h-10 rounded-xl px-3" /><Button type="submit" disabled={!listItem.trim()} className="size-10 rounded-xl" aria-label="Add item"><Plus /></Button></form>
          <div className="max-h-[260px] space-y-1 overflow-auto pr-1">
            {data.shopping.map((item) => (
              <button key={item.id} onClick={() => onToggle('shopping', item.id, !item.completed)} className={`flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left text-sm font-medium hover:bg-secondary/60 ${item.completed ? 'text-muted-foreground line-through' : ''}`}>
                <span className={`grid size-5 place-items-center rounded-md border ${item.completed ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'}`}>{item.completed ? <Check className="size-3.5" /> : null}</span>{item.name}
              </button>
            ))}
          </div>
        </section>

        <section className="surface-card !p-5 sm:!p-6 lg:col-span-2">
          <div className="mb-5 flex items-center justify-between"><div className="flex items-center gap-3"><span className="section-icon"><CalendarDays className="size-4" /></span><div><h2 className="font-display text-[22px] font-semibold">Reminders</h2><p className="text-[11px] text-muted-foreground">One-time and repeating, understood naturally</p></div></div><Button onClick={onVoice} variant="outline" size="sm" className="rounded-full"><Plus /> Add naturally</Button></div>
          <div className="grid gap-2 md:grid-cols-2">
            {openReminders.map((reminder) => (
              <div key={reminder.id} className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/50 p-4">
                <button onClick={() => onToggle('reminder', reminder.id, true)} aria-label={`Complete ${reminder.title}`} className="grid size-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground hover:border-primary hover:text-primary"><Check className="size-4" /></button>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{reminder.title}</p><p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-primary">{reminder.recurrence ? <Repeat2 className="size-3" /> : <Bell className="size-3" />}{formatReminder(reminder)}</p></div>
              </div>
            ))}
          </div>
          {!openReminders.length && <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No active reminders. The day is clear.</div>}
        </section>
      </div>
    </div>
  );
}
