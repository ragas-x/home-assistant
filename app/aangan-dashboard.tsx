'use client';

import { SyntheticEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BellRing,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronRight,
  CloudSun,
  LoaderCircle,
  MessageSquareText,
  Mic,
  MoonStar,
  Pencil,
  Pin,
  Plus,
  Repeat2,
  Send,
  ShoppingBasket,
  Sparkles,
  Sunrise,
  Sun,
  TimerReset,
  UtensilsCrossed,
  Volume2,
  X,
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
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import type { PanchangaMonthDay, PanchangaSnapshot } from '@/lib/panchanga';

type Meal = { id: string; day: string; slot: 'breakfast' | 'lunch' | 'dinner'; dish: string; time: string };
type ShoppingItem = { id: string; name: string; completed: number };
type Reminder = { id: string; title: string; due_at: string; recurrence: string | null; completed: number };
type FamilyNote = { id: string; message: string; pinned: number; completed: number; created_at: string };
type KitchenTimer = { id: string; label: string; ends_at: string; completed: number; created_at: string };
type DashboardData = { meals: Meal[]; shopping: ShoppingItem[]; reminders: Reminder[]; notes: FamilyNote[]; timers: KitchenTimer[] };
type ToggleResource = 'shopping' | 'reminder' | 'note' | 'timer';
type EditableEntry = { kind: 'shopping' | 'reminder' | 'note'; id: string; value: string; dueAt?: string };

type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: () => void;
  onend: () => void;
  onerror: (event: { error: string }) => void;
  onresult: (event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

const HOUSEHOLD_TIME_ZONE = 'Asia/Kolkata';

function createEmptyData(): DashboardData {
  return {
    meals: [],
    shopping: [],
    reminders: [],
    notes: [],
    timers: [],
  };
}

const mealTone = { breakfast: 'sun', lunch: 'leaf', dinner: 'plum' } as const;
const mealLabels = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
const examples = [
  'Remind me 10 days from now to book the gas cylinder',
  'Remind me every day at 7 PM to water the tulsi',
  'Add dahi and coriander to the shopping list',
  'Change lunch to lemon rice',
  'Start a 12-minute rice timer',
  'Add a family note that Amma will be late',
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

function indiaDateTimeToIso(day: string, time: string) {
  const [year, month, date] = day.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, date, hour, minute) - 330 * 60_000).toISOString();
}

function formatReminder(reminder: Reminder) {
  const date = new Date(reminder.due_at);
  const time = date.toLocaleTimeString('en-IN', { timeZone: HOUSEHOLD_TIME_ZONE, hour: 'numeric', minute: '2-digit' });
  if (reminder.recurrence === 'DAILY') return `Every day · ${time}`;
  if (reminder.recurrence?.startsWith('WEEKLY')) return `Every week · ${time}`;
  return date.toLocaleString('en-IN', { timeZone: HOUSEHOLD_TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function formatTimerRemaining(endsAt: string, now: number) {
  const remaining = Math.max(0, new Date(endsAt).getTime() - now);
  if (remaining === 0) return 'Done';
  const totalSeconds = Math.ceil(remaining / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function shiftDateKey(key: string, days: number) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function makeUtcDate(year: number, month: number, day = 1) {
  return new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00Z`);
}

export default function KitchenDashboard({ initialNow, panchanga }: { initialNow: string; panchanga: PanchangaSnapshot }) {
  const renderDate = useMemo(() => new Date(initialNow), [initialNow]);
  const [mode, setMode] = useState<'kitchen' | 'manage'>('kitchen');
  const [darkMode, setDarkMode] = useState(false);
  const [data, setData] = useState<DashboardData>(createEmptyData);
  const [commandOpen, setCommandOpen] = useState(false);
  const [command, setCommand] = useState('');
  const [commandStatus, setCommandStatus] = useState('');
  const [processing, setProcessing] = useState(false);
  const [listItem, setListItem] = useState('');
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [mealDish, setMealDish] = useState('');
  const [editingEntry, setEditingEntry] = useState<EditableEntry | null>(null);
  const [entryValue, setEntryValue] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [entryTime, setEntryTime] = useState('');
  const [familyNote, setFamilyNote] = useState('');
  const [timerLabel, setTimerLabel] = useState('');
  const [timerMinutes, setTimerMinutes] = useState('10');
  const [listening, setListening] = useState(false);
  const [voiceLevels, setVoiceLevels] = useState(() => Array.from({ length: 15 }, () => 0.12));
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [reminderActionPending, setReminderActionPending] = useState(false);
  const [clockNow, setClockNow] = useState(() => renderDate.getTime());
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const voiceTranscriptRef = useRef('');
  const voiceTimeoutRef = useRef<number | null>(null);
  const voiceCancelledRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const voiceAudioContextRef = useRef<AudioContext | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceAnimationRef = useRef<number | null>(null);
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

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const saved = window.localStorage.getItem('home-theme');
      const dark = saved ? saved === 'dark' : media.matches;
      document.documentElement.classList.toggle('dark', dark);
      setDarkMode(dark);
    };
    applyTheme();
    media.addEventListener?.('change', applyTheme);
    return () => media.removeEventListener?.('change', applyTheme);
  }, []);

  function toggleDarkMode(checked: boolean) {
    window.localStorage.setItem('home-theme', checked ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', checked);
    setDarkMode(checked);
  }

  const playReminderChime = useCallback(() => {
    const context = audioContextRef.current;
    if (!context || context.state === 'closed') return;
    void context.resume().then(() => {
      const start = context.currentTime;
      [0, 0.22].forEach((offset, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = index === 0 ? 659.25 : 783.99;
        gain.gain.setValueAtTime(0.0001, start + offset);
        gain.gain.exponentialRampToValueAtTime(0.16, start + offset + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.3);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start + offset);
        oscillator.stop(start + offset + 0.32);
      });
    });
  }, []);

  function enableReminderSound() {
    const AudioContextConstructor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      setCommandStatus('Reminder sounds are unavailable in this browser.');
      return;
    }
    const context = audioContextRef.current ?? new AudioContextConstructor();
    audioContextRef.current = context;
    void context.resume().then(() => {
      setSoundEnabled(true);
      playReminderChime();
    });
  }

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

  function stopVoiceVisualizer() {
    if (voiceAnimationRef.current !== null) window.cancelAnimationFrame(voiceAnimationRef.current);
    voiceAnimationRef.current = null;
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current = null;
    const context = voiceAudioContextRef.current;
    voiceAudioContextRef.current = null;
    if (context && context.state !== 'closed') void context.close();
    setVoiceLevels(Array.from({ length: 15 }, () => 0.12));
  }

  async function startVoiceVisualizer() {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!recognitionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const AudioContextConstructor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) return;
      const context = new AudioContextConstructor();
      const analyser = context.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.72;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.frequencyBinCount);
      voiceStreamRef.current = stream;
      voiceAudioContextRef.current = context;
      const draw = () => {
        analyser.getByteFrequencyData(samples);
        setVoiceLevels((current) => current.map((_, index) => {
          const sampleIndex = Math.min(samples.length - 1, Math.floor(index * samples.length / current.length));
          return Math.max(0.1, Math.min(1, (samples[sampleIndex] || 0) / 150));
        }));
        voiceAnimationRef.current = window.requestAnimationFrame(draw);
      };
      draw();
    } catch {
      // Speech recognition can still work when Safari does not expose a parallel audio stream.
    }
  }

  function stopVoice(cancelled = false) {
    voiceCancelledRef.current = cancelled;
    clearVoiceTimeout();
    const recognition = recognitionRef.current;
    if (recognition) {
      if (cancelled) recognition.abort();
      else {
        setCommandStatus('Finishing…');
        recognition.stop();
      }
      return;
    }
    setListening(false);
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
    recognition.interimResults = true;
    recognition.lang = 'en-IN';
    recognitionRef.current = recognition;
    voiceTranscriptRef.current = '';
    voiceCancelledRef.current = false;
    recognition.onstart = () => {
      setListening(true);
      void startVoiceVisualizer();
      setCommandStatus('Listening… tap the microphone when you are done.');
      voiceTimeoutRef.current = window.setTimeout(() => stopVoice(), 12_000);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      clearVoiceTimeout();
      stopVoiceVisualizer();
      setListening(false);
      if (voiceCancelledRef.current) return;
      const transcript = voiceTranscriptRef.current.trim();
      if (transcript) void runCommand(transcript);
      else setCommandStatus('I did not catch that. Tap the microphone and try again.');
    };
    recognition.onerror = (event) => {
      voiceCancelledRef.current = true;
      recognitionRef.current = null;
      clearVoiceTimeout();
      stopVoiceVisualizer();
      setListening(false);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setCommandStatus('Microphone or speech recognition is blocked. Allow both for this website in Safari settings.');
      } else if (event.error === 'no-speech') {
        setCommandStatus('I did not hear anything. Tap the microphone and try again.');
      } else if (event.error === 'network') {
        setCommandStatus('Safari speech recognition needs a network connection. Check Wi-Fi and try again.');
      } else {
        setCommandStatus('Safari could not recognise that. Please try again or type the command.');
      }
    };
    recognition.onresult = (event) => {
      let transcript = '';
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += `${event.results[index]?.[0]?.transcript || ''} `;
      }
      transcript = transcript.trim();
      voiceTranscriptRef.current = transcript;
      setCommand(transcript);
    };
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setCommandStatus('Speech recognition could not start. Reload the page and try again.');
    }
  }

  function beginVoice() {
    setCommandOpen(true);

    if (recognitionRef.current) {
      stopVoice();
      return;
    }

    setCommandStatus('');
    voiceCancelledRef.current = false;

    if (!window.isSecureContext) {
      setCommandStatus('The iPad microphone requires HTTPS. Open this dashboard through an HTTPS address, then try again.');
      return;
    }

    beginNativeVoice();
  }

  function setCommandDialogOpen(open: boolean) {
    setCommandOpen(open);
    if (!open && recognitionRef.current) stopVoice(true);
  }

  async function toggle(resource: ToggleResource, id: string, completed: boolean) {
    setData((current) => {
      const value = completed ? 1 : 0;
      if (resource === 'shopping') return { ...current, shopping: current.shopping.map((item) => item.id === id ? { ...item, completed: value } : item) };
      if (resource === 'reminder') return { ...current, reminders: current.reminders.map((item) => item.id === id ? { ...item, completed: value } : item) };
      if (resource === 'note') return { ...current, notes: current.notes.map((item) => item.id === id ? { ...item, completed: value } : item) };
      return { ...current, timers: current.timers.map((item) => item.id === id ? { ...item, completed: value } : item) };
    });
    try { await mutate({ op: 'toggle', resource, id, completed }); } catch { await refresh(); }
  }

  async function submitListItem(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!listItem.trim()) return;
    const name = listItem;
    setListItem('');
    await mutate({ op: 'addShopping', name });
  }

  async function submitFamilyNote(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!familyNote.trim()) return;
    const message = familyNote;
    setFamilyNote('');
    await mutate({ op: 'addFamilyNote', message });
  }

  async function pinFamilyNote(id: string, pinned: boolean) {
    setData((current) => ({
      ...current,
      notes: current.notes
        .map((note) => note.id === id ? { ...note, pinned: pinned ? 1 : 0 } : note)
        .sort((a, b) => b.pinned - a.pinned || b.created_at.localeCompare(a.created_at)),
    }));
    try { await mutate({ op: 'pinFamilyNote', id, pinned }); } catch { await refresh(); }
  }

  async function acknowledgeDueReminder(id: string) {
    setReminderActionPending(true);
    try { await mutate({ op: 'acknowledgeReminder', id }); } finally { setReminderActionPending(false); }
  }

  async function snoozeDueReminder(id: string) {
    setReminderActionPending(true);
    try { await mutate({ op: 'snoozeReminder', id, minutes: 10 }); } finally { setReminderActionPending(false); }
  }

  async function submitTimer(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const minutes = Number(timerMinutes);
    if (!timerLabel.trim() || !Number.isFinite(minutes) || minutes <= 0 || minutes > 1_440) return;
    const label = timerLabel;
    setTimerLabel('');
    await mutate({ op: 'startTimer', label, endsAt: new Date(Date.now() + minutes * 60_000).toISOString() });
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

  function openEntryEditor(kind: EditableEntry['kind'], id: string, value: string, dueAt?: string) {
    setEditingEntry({ kind, id, value, dueAt });
    setEntryValue(value);
    if (dueAt) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: HOUSEHOLD_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).formatToParts(new Date(dueAt));
      const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || '';
      setEntryDate(`${part('year')}-${part('month')}-${part('day')}`);
      setEntryTime(`${part('hour')}:${part('minute')}`);
    } else {
      setEntryDate('');
      setEntryTime('');
    }
  }

  async function saveEntry(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = entryValue.trim();
    if (!editingEntry || !value) return;
    const payload = editingEntry.kind === 'shopping'
      ? { op: 'updateShopping', id: editingEntry.id, name: value }
      : editingEntry.kind === 'reminder'
        ? { op: 'updateReminder', id: editingEntry.id, title: value, dueAt: indiaDateTimeToIso(entryDate, entryTime) }
        : { op: 'updateFamilyNote', id: editingEntry.id, message: value };
    await mutate(payload);
    setEditingEntry(null);
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
  const activeNotes = data.notes.filter((item) => !item.completed);
  const activeTimers = data.timers.filter((item) => !item.completed);
  const dueReminder = openReminders.find((reminder) => new Date(reminder.due_at).getTime() <= clockNow);
  const visibleMeals = (['breakfast', 'lunch', 'dinner'] as const).map((slot) => data.meals.find((meal) => meal.slot === slot) ?? {
    id: `empty-${slot}`,
    day: today,
    slot,
    dish: 'Not planned',
    time: slot === 'breakfast' ? '8:30 AM' : slot === 'lunch' ? '1:15 PM' : '8:00 PM',
  });
  const visibleData = { ...data, meals: visibleMeals };

  useEffect(() => {
    if (!dueReminder || !soundEnabled) return;
    playReminderChime();
    let playCount = 1;
    const chime = window.setInterval(() => {
      playReminderChime();
      playCount += 1;
      if (playCount >= 3) window.clearInterval(chime);
    }, 10_000);
    return () => window.clearInterval(chime);
  }, [dueReminder, playReminderChime, soundEnabled]);

  return (
    <main className={`min-h-screen bg-background text-foreground ${mode === 'kitchen' ? 'kitchen-mode' : ''}`}>
      <header className="kitchen-header sticky top-0 z-30 grid h-[68px] grid-cols-[1fr_auto_1fr] items-center border-b border-border/60 bg-background/88 px-5 backdrop-blur-xl lg:px-7">
        <div className="flex min-w-0 items-center gap-2.5 text-muted-foreground">
          <CalendarDays className="size-[17px] shrink-0 text-primary/80" />
          <span className="optical-copy hidden truncate text-[12px] font-semibold sm:block">{dateLabel}</span>
        </div>

        <nav aria-label="Dashboard view" className="flex h-11 items-center gap-1 rounded-full bg-secondary/80 p-1">
          <button onClick={() => setMode('kitchen')} aria-current={mode === 'kitchen' ? 'page' : undefined} className={`inline-flex h-9 min-w-[84px] items-center justify-center rounded-full px-4 text-center text-[12px] font-semibold leading-none transition-colors ${mode === 'kitchen' ? 'bg-card text-foreground ring-1 ring-border/50' : 'text-muted-foreground hover:text-foreground'}`}><span className="optical-label">Kitchen</span></button>
          <button onClick={() => setMode('manage')} aria-current={mode === 'manage' ? 'page' : undefined} className={`inline-flex h-9 min-w-[84px] items-center justify-center rounded-full px-4 text-center text-[12px] font-semibold leading-none transition-colors ${mode === 'manage' ? 'bg-card text-foreground ring-1 ring-border/50' : 'text-muted-foreground hover:text-foreground'}`}><span className="optical-label">Manage</span></button>
        </nav>

        <div className="flex items-center justify-self-end gap-3 text-[12px] font-semibold text-muted-foreground">
          <div className="hidden items-center gap-2 sm:flex"><CloudSun className="size-[17px] text-primary/80" /><span className="optical-copy">29°<span className="hidden lg:inline"> · Bellary</span></span></div>
          <div className="flex h-9 items-center gap-2 rounded-full border border-border/70 bg-card/70 px-2.5 shadow-sm" title="Appearance follows your system until changed">
            <Sun className={`size-3.5 ${darkMode ? 'text-muted-foreground/55' : 'text-primary'}`} aria-hidden="true" />
            <Switch checked={darkMode} onCheckedChange={toggleDarkMode} aria-label="Use dark mode" />
            <MoonStar className={`size-3.5 ${darkMode ? 'text-primary' : 'text-muted-foreground/55'}`} aria-hidden="true" />
          </div>
        </div>
      </header>

      {mode === 'kitchen' ? (
        <KitchenView
          data={visibleData}
          dateLabel={dateLabel}
          greeting={greeting}
          openShopping={openShopping}
          openReminders={openReminders}
          activeNotes={activeNotes}
          activeTimers={activeTimers}
          clockNow={clockNow}
          panchanga={panchanga}
          onVoice={beginVoice}
          onManage={() => setMode('manage')}
          onMeal={openMeal}
          onToggle={toggle}
          onPinNote={pinFamilyNote}
          soundEnabled={soundEnabled}
          onEnableSound={enableReminderSound}
        />
      ) : (
        <ManageView
          data={visibleData}
          openShopping={openShopping}
          openReminders={openReminders}
          activeNotes={activeNotes}
          activeTimers={activeTimers}
          clockNow={clockNow}
          listItem={listItem}
          familyNote={familyNote}
          timerLabel={timerLabel}
          timerMinutes={timerMinutes}
          onListItem={setListItem}
          onFamilyNote={setFamilyNote}
          onTimerLabel={setTimerLabel}
          onTimerMinutes={setTimerMinutes}
          onAddList={submitListItem}
          onAddFamilyNote={submitFamilyNote}
          onStartTimer={submitTimer}
          onVoice={beginVoice}
          onMeal={openMeal}
          onToggle={toggle}
          onPinNote={pinFamilyNote}
          onEditEntry={openEntryEditor}
        />
      )}

      <button onClick={beginVoice} className={`floating-voice-button ${mode === 'kitchen' ? 'is-home' : ''} ${listening ? 'is-listening' : ''}`} aria-label={listening ? 'Stop listening' : 'Speak a command'}><Mic className={mode === 'kitchen' ? 'size-6' : 'size-5'} /></button>

      <Dialog open={commandOpen} onOpenChange={setCommandDialogOpen}>
        <DialogContent style={{ width: '560px', maxWidth: 'calc(100vw - 24px)', boxSizing: 'border-box' }} className="min-w-0 gap-0 overflow-hidden rounded-[26px] border-border bg-card p-0 shadow-2xl">
          <div className="w-full min-w-0 max-w-full overflow-hidden bg-[#2d3434] p-5 text-white sm:p-6">
            <DialogHeader className="min-w-0">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.13em] text-white/55"><span className={`size-2 rounded-full ${listening ? 'animate-pulse bg-[#b9dce2]' : 'bg-white/30'}`} /> Voice command</div>
              <DialogTitle className="max-w-full font-display text-[30px] font-semibold tracking-[-0.035em] [overflow-wrap:anywhere]">What does the home need?</DialogTitle>
              <DialogDescription className="max-w-full whitespace-normal text-white/55 [overflow-wrap:anywhere]">Speak naturally. I understand relative dates and repeating schedules.</DialogDescription>
              <div className={`mt-4 w-full min-w-0 max-w-full overflow-hidden rounded-[20px] border px-4 py-3 transition-colors ${listening ? 'border-[#b9dce2]/30 bg-white/[0.07]' : 'border-white/10 bg-black/10'}`}>
                <div className="flex h-10 items-center justify-center gap-[5px] overflow-hidden" aria-hidden="true">
                  {voiceLevels.map((level, index) => <span key={index} className={`w-[5px] rounded-full bg-[#b9dce2] transition-[height,opacity] duration-75 ${listening ? 'opacity-100' : 'opacity-25'}`} style={{ height: `${Math.max(7, level * (index % 3 === 1 ? 52 : 42))}px` }} />)}
                </div>
                <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#b9dce2]">{listening ? 'Listening live' : processing ? 'Working on it' : 'Ready'}</p>
                <p style={{ overflowWrap: 'anywhere', wordBreak: 'break-all' }} className="mt-1 min-h-9 w-full min-w-0 max-w-full whitespace-pre-wrap text-left text-[13px] font-medium leading-relaxed text-white/75" aria-live="polite">{command || (listening ? 'Start speaking…' : 'Tap the microphone below')}</p>
              </div>
            </DialogHeader>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); void runCommand(command); }} className="w-full min-w-0 max-w-full overflow-hidden p-4 sm:p-5">
            <div className="grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)_48px_48px] items-end gap-2 overflow-hidden">
              <Textarea style={{ fieldSizing: 'fixed', overflowWrap: 'anywhere', wordBreak: 'break-all', boxSizing: 'border-box' }} value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Remind me every day at 7 PM…" rows={2} wrap="soft" className="max-h-24 min-h-12 w-full min-w-0 max-w-full resize-none overflow-hidden rounded-xl bg-background px-4 py-3 text-[14px] leading-relaxed" />
              <Button type="button" onClick={beginVoice} variant="outline" className={`size-12 rounded-xl ${listening ? 'border-primary bg-secondary text-primary' : ''}`} aria-label={listening ? 'Stop listening' : 'Listen'}><Mic className="size-[18px]" /></Button>
              <Button type="submit" disabled={!command.trim() || processing} className="size-12 rounded-xl" aria-label="Run command">{processing ? <LoaderCircle className="animate-spin" /> : <Send />}</Button>
            </div>
            {commandStatus && <output className="mt-4 block max-w-full break-words rounded-xl bg-secondary px-4 py-3 text-[13px] font-medium leading-relaxed text-secondary-foreground [overflow-wrap:anywhere]">{commandStatus}</output>}
            <div className="mt-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Try saying</p>
              <div className="space-y-2">
                {examples.slice(0, 2).map((example) => <button key={example} type="button" onClick={() => setCommand(example)} className="block w-full break-words rounded-xl border border-border/70 px-3 py-2 text-left text-[12px] font-medium transition-colors [overflow-wrap:anywhere] hover:bg-secondary">“{example}”</button>)}
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

      <Dialog open={Boolean(editingEntry)} onOpenChange={(open) => !open && setEditingEntry(null)}>
        <DialogContent className="rounded-[24px] p-6 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-semibold">Edit {editingEntry?.kind === 'shopping' ? 'shopping item' : editingEntry?.kind === 'reminder' ? 'reminder' : 'family note'}</DialogTitle>
            <DialogDescription>{editingEntry?.kind === 'reminder' ? 'Change its title, date, or time. Times use India Standard Time.' : 'Update the text shown everywhere on the dashboard.'}</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveEntry}>
            <Input value={entryValue} onChange={(event) => setEntryValue(event.target.value)} className="mt-2 h-12 rounded-xl px-4" />
            {editingEntry?.kind === 'reminder' && <div className="mt-3 grid grid-cols-2 gap-3"><Input type="date" aria-label="Reminder date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} className="h-12 rounded-xl px-4" /><Input type="time" aria-label="Reminder time" value={entryTime} onChange={(event) => setEntryTime(event.target.value)} className="h-12 rounded-xl px-4" /></div>}
            <DialogFooter className="mt-6 -mx-6 -mb-6 px-6 py-4">
              <Button type="submit" disabled={!entryValue.trim() || (editingEntry?.kind === 'reminder' && (!entryDate || !entryTime))} className="h-10 rounded-xl px-5">Save changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(dueReminder)} onOpenChange={() => undefined}>
        <DialogContent className="reminder-alert-card max-w-[520px] rounded-[28px] border-[#d5b09f] bg-[#fffaf5] p-0 shadow-2xl [&_[data-slot=dialog-close]]:hidden">
          {dueReminder && (
            <div className="p-7 text-center sm:p-9">
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-[#f0d8ca] text-[#925f50]"><BellRing className="size-7" /></span>
              <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#9a6b5d]">Reminder</p>
              <DialogHeader className="mt-2 items-center">
                <DialogTitle className="font-display text-[32px] font-semibold leading-tight tracking-[-0.035em] text-[#443633]">{dueReminder.title}</DialogTitle>
                <DialogDescription className="text-[13px] text-[#846f68]">Due {formatReminder(dueReminder)}</DialogDescription>
              </DialogHeader>
              {!soundEnabled && <Button onClick={enableReminderSound} variant="outline" className="mt-5 h-10 rounded-full border-[#ddc8be] bg-white/65 px-4 text-[#805b50]"><Volume2 /> Enable reminder sound</Button>}
              <div className="mt-7 grid grid-cols-2 gap-3">
                <Button onClick={() => void snoozeDueReminder(dueReminder.id)} disabled={reminderActionPending} variant="outline" className="h-12 rounded-xl border-[#ddc8be] bg-white text-[#725950]">Snooze 10 min</Button>
                <Button onClick={() => void acknowledgeDueReminder(dueReminder.id)} disabled={reminderActionPending} className="h-12 rounded-xl bg-[#74564e] text-white hover:bg-[#60463f]">{reminderActionPending ? <LoaderCircle className="animate-spin" /> : <Check />} Done</Button>
              </div>
              {dueReminder.recurrence && <p className="mt-4 text-[11px] text-[#927b73]">Done schedules the next {dueReminder.recurrence === 'DAILY' ? 'daily' : 'weekly'} reminder automatically.</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}

function KitchenView({ data, dateLabel, greeting, openShopping, openReminders, activeNotes, activeTimers, clockNow, panchanga, onVoice, onManage, onMeal, onToggle, onPinNote, soundEnabled, onEnableSound }: {
  data: DashboardData; dateLabel: string; greeting: string; openShopping: ShoppingItem[]; openReminders: Reminder[]; activeNotes: FamilyNote[]; activeTimers: KitchenTimer[]; clockNow: number; panchanga: PanchangaSnapshot;
  onVoice: () => void; onManage: () => void; onMeal: (meal: Meal) => void;
  onToggle: (resource: ToggleResource, id: string, completed: boolean) => void;
  onPinNote: (id: string, pinned: boolean) => void;
  soundEnabled: boolean; onEnableSound: () => void;
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
                {index === 0 && <span className="inline-flex min-h-7 items-center justify-center rounded-full bg-white/55 px-2.5 text-[10px] font-bold uppercase tracking-[0.1em]"><span className="optical-label">Next</span></span>}
              </div>
              <div className="meal-card-content mt-7">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] opacity-65">{mealLabels[meal.slot]} · {meal.time}</p>
                <h2 className="meal-card-title mt-1.5 font-display text-[21px] font-semibold leading-[1.12] tracking-[-0.025em]">{meal.dish}</h2>
              </div>
              <button onClick={() => onMeal(meal)} className="meal-card-change mt-3 flex items-center gap-1 text-[12px] font-semibold opacity-60 transition-opacity group-hover:opacity-100"><span className="optical-label">Change</span> <ChevronRight className="size-3.5" /></button>
            </article>
          ))}
        </div>

        <div className="secondary-grid mt-4 grid gap-4 md:grid-cols-2">
          <article className="surface-card">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2.5"><span className="section-icon"><Bell className="size-4" /></span><h2 className="font-display text-xl font-semibold tracking-[-0.025em]">Coming up</h2></div>
              <div className="flex items-center gap-1">
                {!soundEnabled && <Button onClick={onEnableSound} variant="ghost" size="icon-sm" className="rounded-full text-muted-foreground" aria-label="Enable reminder sounds"><Volume2 className="size-3.5" /></Button>}
                <Button onClick={onVoice} variant="ghost" size="sm" className="rounded-full text-muted-foreground"><Plus /> Add</Button>
              </div>
            </div>
            <div className="divide-y divide-border/70">
              {openReminders.slice(0, 2).map((reminder) => (
                <div key={reminder.id} className="grid grid-cols-[1fr_auto] items-center gap-3 py-3.5">
                  <div className="optical-copy"><p className="text-[14px] font-semibold">{reminder.title}</p><p className="mt-1 text-[11px] font-medium text-primary">{formatReminder(reminder)}</p></div>
                  <button onClick={() => onToggle('reminder', reminder.id, true)} aria-label={`Complete ${reminder.title}`} className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"><Check className="size-4" /></button>
                </div>
              ))}
              {!openReminders.length && <p className="py-8 text-center text-sm text-muted-foreground">Nothing else needs your attention.</p>}
            </div>
          </article>

          <article className="surface-card">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5"><span className="section-icon"><ShoppingBasket className="size-4" /></span><h2 className="font-display text-xl font-semibold tracking-[-0.025em]">Shopping</h2></div>
              <span className="inline-flex min-h-7 items-center justify-center rounded-full bg-secondary px-2.5 text-[11px] font-bold text-secondary-foreground"><span className="optical-label">{openShopping.length} left</span></span>
            </div>
            <div className="space-y-1">
              {openShopping.slice(0, 3).map((item) => (
                <button key={item.id} onClick={() => onToggle('shopping', item.id, true)} className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left text-sm font-medium hover:text-primary"><span className="grid size-[19px] place-items-center rounded-md border-[1.5px] border-border bg-background" /><span className="optical-copy">{item.name}</span></button>
              ))}
              {!openShopping.length && <p className="py-5 text-center text-sm text-muted-foreground">The shopping list is clear.</p>}
            </div>
            <button onClick={onManage} className="mt-3 flex items-center gap-1 text-[12px] font-bold text-primary"><span className="optical-label">Open list</span> <ChevronRight className="size-3.5" /></button>
          </article>

          <article className="family-board-wide surface-card compact-dashboard-card md:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2.5"><span className="section-icon"><MessageSquareText className="size-4" /></span><h2 className="font-display text-xl font-semibold tracking-[-0.025em]">Family board</h2></div>
              <Button onClick={onVoice} variant="ghost" size="icon-sm" className="rounded-full text-muted-foreground" aria-label="Add family note by voice"><Mic className="size-3.5" /></Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {activeNotes.slice(0, 2).map((note) => (
                <div key={note.id} className={`flex items-center gap-2 rounded-xl px-2.5 py-2 ${note.pinned ? 'pinned-note' : 'bg-background/45'}`}>
                  <p className="optical-copy line-clamp-2 min-w-0 flex-1 text-[12px] font-semibold leading-snug">{note.message}</p>
                  <button onClick={() => onPinNote(note.id, !note.pinned)} className={`grid size-7 shrink-0 place-items-center rounded-full hover:bg-white/50 ${note.pinned ? 'text-[#9a5d59]' : 'text-muted-foreground'}`} aria-label={`${note.pinned ? 'Unpin' : 'Pin'} note: ${note.message}`} aria-pressed={Boolean(note.pinned)}><Pin className="size-3.5" fill={note.pinned ? 'currentColor' : 'none'} /></button>
                  <button onClick={() => onToggle('note', note.id, true)} className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label={`Remove note: ${note.message}`}><X className="size-3.5" /></button>
                </div>
              ))}
              {!activeNotes.length && <button onClick={onVoice} className="w-full py-3 text-left text-[13px] font-medium text-muted-foreground sm:col-span-2">Say “add a family note…”</button>}
            </div>
          </article>
        </div>
      </section>

      <aside className="kitchen-sidebar min-w-0">
        <PanchangaCard snapshot={panchanga} />
        <div className="sidebar-utilities grid grid-cols-1 gap-3">
          <article className="surface-card compact-utility-card" aria-live="polite">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><span className="section-icon"><TimerReset className="size-4" /></span><h2 className="font-display text-[17px] font-semibold">Timers</h2></div>
              <button onClick={onVoice} className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary" aria-label="Start timer by voice"><Mic className="size-3.5" /></button>
            </div>
            {activeTimers.length ? activeTimers.slice(0, 1).map((timer) => {
              const remaining = formatTimerRemaining(timer.ends_at, clockNow);
              return <button key={timer.id} onClick={() => onToggle('timer', timer.id, true)} className="mt-3 flex w-full items-center justify-between gap-2 text-left"><span className="optical-copy truncate text-[12px] font-semibold">{timer.label}</span><time dateTime={timer.ends_at} className="optical-copy font-display text-[14px] font-bold tabular-nums">{remaining}</time></button>;
            }) : <button onClick={onVoice} className="mt-3 text-left text-[11px] font-medium text-muted-foreground">Start by voice</button>}
          </article>
        </div>
      </aside>
    </div>
  );
}

function PanchangaCard({ snapshot: initialSnapshot }: { snapshot: PanchangaSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => initialSnapshot.today?.date.slice(0, 7) || '2026-01');
  const [monthDays, setMonthDays] = useState<PanchangaMonthDay[]>([]);
  const [panchangaLoading, setPanchangaLoading] = useState(false);
  const { today, alerts } = snapshot;

  const loadDate = useCallback(async (date: string) => {
    if (!date.startsWith('2026-')) return;
    setPanchangaLoading(true);
    try {
      const response = await fetch(`/api/panchanga?date=${date}`);
      if (response.ok) {
        setSnapshot((await response.json()) as PanchangaSnapshot);
        setCalendarMonth(date.slice(0, 7));
      }
    } finally { setPanchangaLoading(false); }
  }, []);

  const loadMonth = useCallback(async (month: string) => {
    setPanchangaLoading(true);
    try {
      const response = await fetch(`/api/panchanga?month=${month}`);
      if (response.ok) setMonthDays((await response.json()) as PanchangaMonthDay[]);
    } finally { setPanchangaLoading(false); }
  }, []);

  function moveMonth(amount: number) {
    const [year, month] = calendarMonth.split('-').map(Number);
    const targetMonth = month + amount;
    const targetYear = year + Math.floor((targetMonth - 1) / 12);
    const normalizedMonth = ((targetMonth - 1) % 12 + 12) % 12 + 1;
    const next = `${targetYear}-${String(normalizedMonth).padStart(2, '0')}`;
    if (next.startsWith('2026-')) {
      setCalendarMonth(next);
      void loadMonth(next);
    }
  }

  function openCalendar() {
    setCalendarOpen(true);
    void loadMonth(calendarMonth);
  }

  if (calendarOpen) {
    const [year, month] = calendarMonth.split('-').map(Number);
    const leadingDays = makeUtcDate(year, month).getUTCDay();
    const cells = [...Array.from({ length: leadingDays }, () => null), ...monthDays];
    const selectedDate = today?.date;
    const monthLabel = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(makeUtcDate(year, month));
    return (
      <article key="calendar" className="panchanga-card panchanga-flip-content">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => moveMonth(-1)} disabled={calendarMonth === '2026-01'} className="grid size-9 place-items-center rounded-full bg-white/55 text-[#65777a] disabled:opacity-25" aria-label="Previous month"><ArrowLeft className="size-4" /></button>
          <button onClick={() => setCalendarOpen(false)} className="min-w-0 text-center"><span className="block text-[9px] font-bold uppercase tracking-[0.13em] text-[#718083]">Panchanga calendar</span><span className="font-display text-[19px] font-bold">{monthLabel}</span></button>
          <button onClick={() => moveMonth(1)} disabled={calendarMonth === '2026-12'} className="grid size-9 place-items-center rounded-full bg-white/55 text-[#65777a] disabled:opacity-25" aria-label="Next month"><ArrowRight className="size-4" /></button>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[8px] font-bold uppercase tracking-wide text-[#7b817e]">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}</div>
        <div className={`mt-2 grid flex-1 grid-cols-7 grid-rows-6 gap-1 ${panchangaLoading ? 'opacity-45' : ''}`}>
          {cells.map((record, index) => record ? (
            <button key={record.date} onClick={() => { void loadDate(record.date); setCalendarOpen(false); }} className={`panchanga-day-cell ${record.date === selectedDate ? 'is-selected' : ''} ${record.ekadashi || record.festivals.length ? 'has-observance' : ''}`}>
              <span className="text-[9px] font-bold">{Number(record.date.slice(-2))}</span>
              <span lang="kn" className="line-clamp-2 text-[7px] font-semibold leading-tight">{record.tithi}</span>
            </button>
          ) : <span key={`empty-${index}`} />)}
        </div>
        <button onClick={() => { void loadDate(localDay(new Date())); setCalendarOpen(false); }} className="mx-auto mt-3 rounded-full bg-white/55 px-4 py-2 text-[10px] font-bold text-[#65777a]"><span className="optical-label">Today</span></button>
      </article>
    );
  }

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
    <article key="detail" className={`panchanga-card panchanga-flip-content ${panchangaLoading ? 'opacity-55' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#65777a]">Panchanga · Bellary</p>
          <h2 lang="kn" className="mt-2 truncate font-display text-[31px] font-bold leading-[1.15] tracking-[-0.015em]" title={today.tithi}>{today.tithi}</h2>
          <p lang="kn" className="mt-1.5 truncate text-sm font-semibold text-[#5f6462]" title={`${today.masa} · ${today.rutu} · ${today.paksha}`}>{today.masa} · {today.rutu} · {today.paksha}</p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-1">
          <button onClick={() => void loadDate(shiftDateKey(today.date, -1))} disabled={today.date === '2026-01-01'} className="grid size-8 place-items-center rounded-full bg-white/60 text-[#65777a] disabled:opacity-25" aria-label="Previous Panchanga day"><ArrowLeft className="size-3.5" /></button>
          <button onClick={() => void loadDate(shiftDateKey(today.date, 1))} disabled={today.date === '2026-12-31'} className="grid size-8 place-items-center rounded-full bg-white/60 text-[#65777a] disabled:opacity-25" aria-label="Next Panchanga day"><ArrowRight className="size-3.5" /></button>
          <button onClick={openCalendar} className="grid size-8 place-items-center rounded-full bg-white/60 text-[#65777a]" aria-label="Open Panchanga calendar"><CalendarRange className="size-3.5" /></button>
          <button onClick={() => void loadDate(localDay(new Date()))} className="grid size-8 place-items-center rounded-full bg-white/60 text-[#65777a]" aria-label="Reset Panchanga to today"><MoonStar className="size-3.5" /></button>
        </div>
      </div>

      <p className="mt-2 text-[9px] font-bold uppercase tracking-[0.11em] text-[#737875]/75">{new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${today.date}T12:00:00Z`))}</p>

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
              {alert.isEkadashi && <span className="inline-flex min-h-7 items-center justify-center rounded-full bg-white/55 px-2 text-[9px] font-bold uppercase tracking-wide text-[#6b624f]"><span className="optical-label">Ekadashi</span></span>}
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

      <div className="panchanga-sunrise mt-3 flex items-center gap-2 rounded-xl bg-white/55 px-3 py-2.5 text-[11px] font-semibold text-[#626866]"><Sunrise className="size-4" /> Sunrise {today.sunrise} · Sunset {today.sunset}</div>
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

function ManageView({ data, openShopping, openReminders, activeNotes, activeTimers, clockNow, listItem, familyNote, timerLabel, timerMinutes, onListItem, onFamilyNote, onTimerLabel, onTimerMinutes, onAddList, onAddFamilyNote, onStartTimer, onVoice, onMeal, onToggle, onPinNote, onEditEntry }: {
  data: DashboardData; openShopping: ShoppingItem[]; openReminders: Reminder[]; activeNotes: FamilyNote[]; activeTimers: KitchenTimer[]; clockNow: number;
  listItem: string; familyNote: string; timerLabel: string; timerMinutes: string;
  onListItem: (value: string) => void; onFamilyNote: (value: string) => void; onTimerLabel: (value: string) => void; onTimerMinutes: (value: string) => void;
  onAddList: (event: SyntheticEvent<HTMLFormElement>) => void; onAddFamilyNote: (event: SyntheticEvent<HTMLFormElement>) => void; onStartTimer: (event: SyntheticEvent<HTMLFormElement>) => void;
  onVoice: () => void; onMeal: (meal: Meal) => void; onToggle: (resource: ToggleResource, id: string, completed: boolean) => void;
  onPinNote: (id: string, pinned: boolean) => void;
  onEditEntry: (kind: EditableEntry['kind'], id: string, value: string, dueAt?: string) => void;
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
                <span className="optical-copy min-w-0 flex-1"><span className="block text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{mealLabels[meal.slot]} · {meal.time}</span><span className="mt-1 block truncate text-sm font-semibold">{meal.dish}</span></span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>

        <section className="surface-card !p-5 sm:!p-6">
          <div className="mb-5 flex items-center justify-between"><div className="flex items-center gap-3"><span className="section-icon"><ShoppingBasket className="size-4" /></span><div><h2 className="font-display text-[22px] font-semibold">Shopping list</h2><p className="text-[11px] text-muted-foreground">{openShopping.length} items left</p></div></div></div>
          <form onSubmit={onAddList} className="mb-3 flex items-center gap-2"><Input value={listItem} onChange={(event) => onListItem(event.target.value)} placeholder="Add an item" className="h-10 rounded-xl px-3" /><Button type="submit" disabled={!listItem.trim()} className="size-10 rounded-xl" aria-label="Add item"><Plus /></Button></form>
          <div className="max-h-[260px] space-y-1 overflow-auto pr-1">
            {data.shopping.map((item) => (
              <div key={item.id} className={`flex items-center rounded-xl pr-1 text-sm font-medium hover:bg-secondary/60 ${item.completed ? 'text-muted-foreground' : ''}`}>
                <button onClick={() => onToggle('shopping', item.id, !item.completed)} className={`flex min-w-0 flex-1 items-center gap-3 px-2 py-2.5 text-left ${item.completed ? 'line-through' : ''}`}>
                  <span className={`grid size-5 shrink-0 place-items-center rounded-md border ${item.completed ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'}`}>{item.completed ? <Check className="size-3.5" /> : null}</span><span className="optical-copy truncate">{item.name}</span>
                </button>
                <button onClick={() => onEditEntry('shopping', item.id, item.name)} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground" aria-label={`Edit ${item.name}`}><Pencil className="size-3.5" /></button>
              </div>
            ))}
          </div>
        </section>

        <section className="surface-card !p-5 sm:!p-6">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3"><span className="section-icon"><MessageSquareText className="size-4" /></span><div><h2 className="font-display text-[22px] font-semibold">Family board</h2><p className="text-[11px] text-muted-foreground">Short notes everyone can see</p></div></div>
            <Button onClick={onVoice} variant="ghost" size="icon-sm" className="rounded-full" aria-label="Add family note by voice"><Mic /></Button>
          </div>
          <form onSubmit={onAddFamilyNote} className="mb-3 flex items-center gap-2"><Input value={familyNote} onChange={(event) => onFamilyNote(event.target.value)} placeholder="Leave a note for the family" className="h-10 rounded-xl px-3" /><Button type="submit" disabled={!familyNote.trim()} className="size-10 rounded-xl" aria-label="Add note"><Plus /></Button></form>
          <div className="space-y-2">
            {activeNotes.map((note) => (
              <div key={note.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${note.pinned ? 'pinned-note' : 'border-transparent bg-background/60'}`}><p className="optical-copy min-w-0 flex-1 text-sm font-medium">{note.message}</p><button onClick={() => onEditEntry('note', note.id, note.message)} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-white/55 hover:text-foreground" aria-label={`Edit note: ${note.message}`}><Pencil className="size-3.5" /></button><button onClick={() => onPinNote(note.id, !note.pinned)} className={`grid size-8 shrink-0 place-items-center rounded-full hover:bg-white/55 ${note.pinned ? 'text-[#9a5d59]' : 'text-muted-foreground'}`} aria-label={`${note.pinned ? 'Unpin' : 'Pin'} note: ${note.message}`} aria-pressed={Boolean(note.pinned)}><Pin className="size-4" fill={note.pinned ? 'currentColor' : 'none'} /></button><button onClick={() => onToggle('note', note.id, true)} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label={`Remove note: ${note.message}`}><X className="size-4" /></button></div>
            ))}
            {!activeNotes.length && <p className="py-6 text-center text-sm text-muted-foreground">No family notes right now.</p>}
          </div>
        </section>

        <section className="surface-card !p-5 sm:!p-6">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3"><span className="section-icon"><TimerReset className="size-4" /></span><div><h2 className="font-display text-[22px] font-semibold">Kitchen timers</h2><p className="text-[11px] text-muted-foreground">Start here or say it naturally</p></div></div>
            <Button onClick={onVoice} variant="ghost" size="icon-sm" className="rounded-full" aria-label="Start timer by voice"><Mic /></Button>
          </div>
          <form onSubmit={onStartTimer} className="mb-3 grid grid-cols-[1fr_84px_40px] items-center gap-2"><Input value={timerLabel} onChange={(event) => onTimerLabel(event.target.value)} placeholder="Rice" className="h-10 rounded-xl px-3" /><Input value={timerMinutes} onChange={(event) => onTimerMinutes(event.target.value)} inputMode="numeric" type="number" min="1" max="1440" aria-label="Timer duration in minutes" className="h-10 rounded-xl px-3" /><Button type="submit" disabled={!timerLabel.trim() || !timerMinutes} className="size-10 rounded-xl" aria-label="Start timer"><Plus /></Button></form>
          <div className="space-y-2" aria-live="polite">
            {activeTimers.map((timer) => {
              const remaining = formatTimerRemaining(timer.ends_at, clockNow);
              return <div key={timer.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${remaining === 'Done' ? 'bg-[#e4d8c3]' : 'bg-background/60'}`}><p className="optical-copy min-w-0 flex-1 truncate text-sm font-semibold">{timer.label}</p><time dateTime={timer.ends_at} className="optical-copy font-display font-bold tabular-nums">{remaining}</time><button onClick={() => onToggle('timer', timer.id, true)} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label={`Dismiss ${timer.label} timer`}><X className="size-4" /></button></div>;
            })}
            {!activeTimers.length && <p className="py-6 text-center text-sm text-muted-foreground">No timers running.</p>}
          </div>
        </section>

        <section className="surface-card !p-5 sm:!p-6 lg:col-span-2">
          <div className="mb-5 flex items-center justify-between"><div className="flex items-center gap-3"><span className="section-icon"><CalendarDays className="size-4" /></span><div><h2 className="font-display text-[22px] font-semibold">Reminders</h2><p className="text-[11px] text-muted-foreground">One-time and repeating, understood naturally</p></div></div><Button onClick={onVoice} variant="outline" size="sm" className="rounded-full"><Plus /> Add naturally</Button></div>
          <div className="grid gap-2 md:grid-cols-2">
            {openReminders.map((reminder) => (
              <div key={reminder.id} className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/50 p-4">
                <button onClick={() => onToggle('reminder', reminder.id, true)} aria-label={`Complete ${reminder.title}`} className="grid size-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground hover:border-primary hover:text-primary"><Check className="size-4" /></button>
                <div className="optical-copy min-w-0 flex-1"><p className="truncate text-sm font-semibold">{reminder.title}</p><p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-primary">{reminder.recurrence ? <Repeat2 className="size-3" /> : <Bell className="size-3" />}{formatReminder(reminder)}</p></div>
                <button onClick={() => onEditEntry('reminder', reminder.id, reminder.title, reminder.due_at)} className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label={`Edit ${reminder.title}`}><Pencil className="size-4" /></button>
              </div>
            ))}
          </div>
          {!openReminders.length && <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No active reminders. The day is clear.</div>}
        </section>
      </div>
    </div>
  );
}
