// Talk (2026-10-18): what a spoken or typed sentence asks for. Fixed sentence patterns, no AI, no
// network, so typed commands work offline too. English only. No React here: TalkScreen runs the result.
import { pad, ymd } from './dates';

export type DayWord = 'today' | 'tomorrow';

export type Command =
  | { kind: 'empty' }
  | { kind: 'help' }
  | { kind: 'reminder'; text: string; when: When }
  | { kind: 'one'; text: string; day: DayWord }
  | { kind: 'task'; text: string; day: DayWord }
  | { kind: 'idea'; text: string }
  | { kind: 'focus'; minutes: number | null }
  | { kind: 'done' }
  | { kind: 'plan'; day: DayWord }
  | { kind: 'goals' }
  | { kind: 'decide'; text: string }
  | { kind: 'unknown' };

/** A reminder time: `at` when the sentence gave one, else the day it named (or none) so we can ask. */
export type When =
  | { ok: true; at: Date }
  | { ok: false; reason: 'no-time'; dayOffset: number | null; part: Part }
  | { ok: false; reason: 'past'; at: Date };

type Part = 'am' | 'pm' | null;

export const EXAMPLES = [
  'Remind me tomorrow at 11 AM to call the bank',
  'My ONE thing is finish the report',
  'Add a task: buy milk',
  'Park an idea: start a podcast',
  'Start focus for 25 minutes',
  'What is my plan today?',
];

const NUM_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, fifty: 50, ninety: 90,
  a: 1, an: 1,
};
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Speech gives "11 a.m.", "Tomorrow", "1 thing"; people type "One Thing:", "11am!". Keep the words' case. */
export function normalize(raw: string): string {
  return raw
    .replace(/[’‘]/g, "'")
    .replace(/\b([ap])\.\s?m\.?(?=\s|$|[,!?])/gi, (_m, p: string) => p.toLowerCase() + 'm')
    .replace(/\bo'clock\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/, '')
    .trim();
}

function num(word: string): number | null {
  if (/^\d+$/.test(word)) return Number(word);
  return NUM_WORDS[word.toLowerCase()] ?? null;
}

/** "tomorrow", "Tommorow" (a common typo) -> 'tomorrow'. */
function dayWord(word: string): DayWord {
  return /^tod/i.test(word) ? 'today' : 'tomorrow';
}

/** "buy milk" -> "Buy milk". */
export function sentence(text: string): string {
  const t = text.trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/** Drops filler at the edges: "to call the bank" -> "call the bank", "report for" -> "report". */
function tidy(text: string): string {
  let t = text.replace(/\s+/g, ' ').trim().replace(/^[,:;\-–]+\s*/, '').replace(/\s*[,:;\-–]+$/, '');
  for (let i = 0; i < 3; i++) {
    t = t.replace(/^(?:to|that|about|for|on|at|by|is|of|please)\s+/i, '').replace(/\s+(?:for|on|at|by|to|please)$/i, '').trim();
  }
  return /^(?:to|that|about|for|on|at|by|is|of|please|me)$/i.test(t) ? '' : t; // "set me reminder for ..." leaves a lone "for"
}

/** "... for tomorrow" at the end of a task or ONE thing moves it to tomorrow. */
function dayTail(text: string, fallback: DayWord): { text: string; day: DayWord } {
  const m = text.match(/^(.*?)\s*,?\s+(?:for\s+)?(today|tom+or+ow)$/i);
  if (m && m[1].trim()) return { text: m[1], day: dayWord(m[2]) };
  return { text, day: fallback };
}

// ---------------------------------------------------------------- reminders

function cut(text: string, re: RegExp): { rest: string; m: RegExpMatchArray | null } {
  const m = text.match(re);
  if (!m || m.index === undefined) return { rest: text, m: null };
  return { rest: text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length), m };
}

/** Days from today, from "today", "tonight", "tomorrow", "day after tomorrow", a weekday, "in 3 days". */
function findDay(text: string, now: Date): { rest: string; offset: number | null; part: Part } {
  let r = cut(text, /\b(?:the\s+)?day after tom+or+ow\b/i);
  if (r.m) return { rest: r.rest, offset: 2, part: null };
  r = cut(text, /\btom+or+ow(?:\s+(morning|afternoon|evening|night))?\b/i);
  if (r.m) return { rest: r.rest, offset: 1, part: r.m[1] ? (/morning/i.test(r.m[1]) ? 'am' : 'pm') : null };
  r = cut(text, /\b(?:this\s+(morning|afternoon|evening)|(tonight)|(today))\b/i);
  if (r.m) return { rest: r.rest, offset: 0, part: r.m[2] || (r.m[1] && !/morning/i.test(r.m[1])) ? 'pm' : r.m[1] ? 'am' : null };
  r = cut(text, /\b(?:on\s+)?(next\s+|this\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if (r.m) {
    const target = WEEKDAYS.indexOf(r.m[2].toLowerCase());
    let offset = (target - now.getDay() + 7) % 7;
    if (offset === 0 || /next/i.test(r.m[1] ?? '')) offset = offset === 0 ? 7 : offset;
    return { rest: r.rest, offset, part: null };
  }
  r = cut(text, /\bin\s+(\d+|an?|one|two|three|four|five|six|seven)\s+days?\b/i);
  if (r.m) return { rest: r.rest, offset: num(r.m[1]) ?? 1, part: null };
  return { rest: text, offset: null, part: null };
}

/** "in 30 minutes", "in 2 hours", "in an hour", "in half an hour" -> minutes from now. */
function findIn(text: string): { rest: string; minutes: number | null } {
  let r = cut(text, /\bin\s+half\s+an?\s+hour\b/i);
  if (r.m) return { rest: r.rest, minutes: 30 };
  r = cut(text, /\bin\s+(\d+|an?|one|two|three|four|five|ten|fifteen|twenty|thirty|forty-five|fifty)\s+(minutes?|mins?|hours?|hrs?)\b/i);
  if (r.m) {
    const n = num(r.m[1]) ?? 1;
    return { rest: r.rest, minutes: /^h/i.test(r.m[2]) ? n * 60 : n };
  }
  return { rest: text, minutes: null };
}

/** "at 11", "11am", "11:30 pm", "at eleven", "noon". Plain numbers without "at" are left alone ("buy 2 eggs"). */
function findTime(text: string): { rest: string; h: number | null; min: number; part: Part } {
  let r = cut(text, /\b(?:at\s+)?noon\b|\bmidday\b/i);
  if (r.m) return { rest: r.rest, h: 12, min: 0, part: 'pm' };
  r = cut(text, /\b(?:at\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/i);
  if (!r.m) r = cut(text, /\b(?:at\s+)?(\d{1,2})[:.](\d{2})\b/i);
  if (!r.m) r = cut(text, /\bat\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\s+(am|pm))?\b/i);
  if (!r.m) return { rest: text, h: null, min: 0, part: null };
  const h = num(r.m[1]);
  const min = r.m[2] && /^\d+$/.test(r.m[2]) ? Number(r.m[2]) : 0;
  const ampm = [r.m[2], r.m[3]].find((x) => x && /^(am|pm)$/i.test(x));
  if (h === null || h > 23 || min > 59) return { rest: text, h: null, min: 0, part: null };
  return { rest: r.rest, h, min, part: ampm ? (ampm.toLowerCase() as Part) : null };
}

/** 12-hour words to a 24-hour clock. With no am/pm: 1–6 = afternoon, 7–11 = morning (how people talk). */
function hour24(h: number, part: Part): number {
  if (h > 12) return h;
  if (part === 'am') return h === 12 ? 0 : h;
  if (part === 'pm') return h === 12 ? 12 : h + 12;
  return h >= 1 && h <= 6 ? h + 12 : h;
}

function at(now: Date, offset: number, h: number, min: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, h, min, 0, 0);
}

export function resolveWhen(text: string, now: Date): { when: When; rest: string } {
  const inMin = findIn(text);
  if (inMin.minutes !== null) {
    const t = new Date(now.getTime() + inMin.minutes * 60000);
    t.setSeconds(0, 0);
    return { when: { ok: true, at: t }, rest: inMin.rest };
  }
  const day = findDay(text, now);
  const time = findTime(day.rest);
  const part = time.part ?? day.part;
  if (time.h === null) return { when: { ok: false, reason: 'no-time', dayOffset: day.offset, part: day.part }, rest: time.rest };
  return { when: whenFrom(now, day.offset, time.h, time.min, part, time.part !== null), rest: time.rest };
}

/** Builds the date. No day said: today, or tomorrow if the time has passed (or tonight for 1–11 without am/pm). */
export function whenFrom(now: Date, offset: number | null, h: number, min: number, part: Part, saidPart = part !== null): When {
  const h24 = hour24(h, part);
  if (offset !== null) {
    const t = at(now, offset, h24, min);
    return offset === 0 && t.getTime() <= now.getTime() ? { ok: false, reason: 'past', at: t } : { ok: true, at: t };
  }
  let t = at(now, 0, h24, min);
  if (t.getTime() > now.getTime()) return { ok: true, at: t };
  if (!saidPart && h24 < 12 && h >= 1 && h <= 11) {
    t = at(now, 0, h24 + 12, min);
    if (t.getTime() > now.getTime()) return { ok: true, at: t };
  }
  return { ok: true, at: at(now, 1, h24, min) };
}

/** A follow-up answer to "What time?": "11", "at 3 pm", "noon", "in 2 hours". */
export function parseTimeAnswer(raw: string, now: Date, dayOffset: number | null, dayPart: Part): When | null {
  const text = normalize(raw);
  const inMin = findIn(text);
  if (inMin.minutes !== null) {
    const t = new Date(now.getTime() + inMin.minutes * 60000);
    t.setSeconds(0, 0);
    return { ok: true, at: t };
  }
  const bare = text.match(/^(?:at\s+)?(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:[:.](\d{2}))?\s*(am|pm)?$/i);
  if (bare) {
    const h = num(bare[1]);
    if (h === null || h > 23) return null;
    const min = bare[2] ? Number(bare[2]) : 0;
    const part = (bare[3]?.toLowerCase() as Part) ?? dayPart;
    return whenFrom(now, dayOffset, h, min, part, !!bare[3]);
  }
  const time = findTime(text);
  if (time.h === null) return null;
  return whenFrom(now, dayOffset, time.h, time.min, time.part ?? dayPart, time.part !== null);
}

function parseReminder(text: string, now: Date): Command {
  let rest = text
    .replace(/^(?:please\s+|hey\s+|can you\s+|could you\s+)*/i, '')
    .replace(/^remind\s+me\b/i, ' ')
    .replace(/^(?:set|make|create|add|put|give)?\s*(?:me\s+)?(?:an?\s+|the\s+)?(?:reminder|alarm)s?\b/i, ' ');
  const { when, rest: left } = resolveWhen(rest, now);
  rest = tidy(left);
  return { kind: 'reminder', text: rest ? sentence(rest) : 'Reminder', when };
}

// ---------------------------------------------------------------- everything else

export function parseCommand(raw: string, now: Date = new Date()): Command {
  const s = normalize(raw);
  if (!s) return { kind: 'empty' };
  let m: RegExpMatchArray | null;

  if (/^(?:help|what can you do|what can i say|how does (?:this|it) work)\b/i.test(s)) return { kind: 'help' };

  if (/\bremind(?:er|ers)?\b|\balarm\b/i.test(s)) return parseReminder(s, now);

  // Questions first, so "what is my one thing" is not read as setting it.
  if (/^(?:what(?:'s| is| are)|show(?: me)?|tell me|read|list)\b.*\bgoals?\b/i.test(s)) return { kind: 'goals' };
  if (/^(?:what(?:'s| is| are)|show(?: me)?|tell me|read|what do i have|what have i got)\b/i.test(s) && /\b(?:plan|one thing|1 thing|tasks?|day|today|tom+or+ow|to-?do)\b/i.test(s)) {
    return { kind: 'plan', day: /\btom+or+ow\b/i.test(s) ? 'tomorrow' : 'today' };
  }

  m = s.match(/^(?:please\s+)?(?:(?:set|make|change|put)\s+)?(?:(today|tom+or+ow)(?:'s)?\s*,?\s+)?(?:my\s+|the\s+)?(?:one|1)\s*thing(?:\s+(?:for\s+)?(today|tom+or+ow))?\s*(?:is|to|will be|should be|=|:|-)\s*(.+)$/i);
  if (m) {
    const tail = dayTail(m[3], dayWord(m[1] || m[2] || 'today'));
    const text = tidy(tail.text);
    if (text) return { kind: 'one', text: sentence(text), day: tail.day };
  }

  if (/^(?:i(?:'m| am)?\s+)?(?:finished|done|completed?)(?:\s+(?:it|my one thing|the one thing|my 1 thing))?$/i.test(s) ||
      /^(?:mark|tick|set)\s+(?:my\s+|the\s+)?(?:one|1)\s*thing\s+(?:as\s+)?(?:done|finished|complete)$/i.test(s)) {
    return { kind: 'done' };
  }

  m = s.match(/^(?:please\s+)?(?:park|save|note|keep|add|new)\s+(?:an?\s+|the\s+|this\s+|my\s+)?idea\s*(?::|-|,)?\s*(.+)$/i) ||
      s.match(/^(?:new\s+)?idea\s*(?::|-|,)?\s+(.+)$/i) ||
      s.match(/^i (?:have|got|had) an idea\s*(?::|-|,)?\s*(.+)$/i) ||
      s.match(/^park\s+(.+)$/i);
  if (m) {
    const text = tidy(m[1]);
    if (text) return { kind: 'idea', text: sentence(text) };
  }

  if (/\b(?:start|begin|open)\s+(?:a\s+|the\s+)?focus\b|^focus\b|\bfocus\s+(?:mode|session|time)\b/i.test(s)) {
    let minutes: number | null = null;
    if (/\bhalf\s+an?\s+hour\b/i.test(s)) minutes = 30;
    else if ((m = s.match(/\b(\d+|an?|one|two)\s+(hours?|hrs?)\b/i))) minutes = (num(m[1]) ?? 1) * 60;
    else if ((m = s.match(/\b(\d+|fifteen|twenty|thirty|forty-five|fifty|ninety)\s*(?:minutes?|mins?)?\b/i))) minutes = num(m[1]);
    if (minutes !== null && (minutes < 5 || minutes > 180)) minutes = null;
    return { kind: 'focus', minutes };
  }

  m = s.match(/^(?:please\s+)?(?:add|new|put|create)\s+(?:a\s+|one\s+)?task(?:\s+for\s+(today|tom+or+ow))?\s*(?::|-|,|to)?\s*(.+)$/i) ||
      s.match(/^task(?:\s+for\s+(today|tom+or+ow))?\s*(?::|-|,)?\s+(.+)$/i);
  if (m) {
    const tail = dayTail(m[2], dayWord(m[1] || 'today'));
    const text = tidy(tail.text);
    if (text) return { kind: 'task', text: sentence(text), day: tail.day };
  }
  m = s.match(/^(?:please\s+)?(?:add|put)\s+(.+?)\s+(?:to|on|in)\s+(?:my\s+|the\s+)?(?:tasks|task list|list|to-?do(?:\s+list)?)(?:\s+for\s+(today|tom+or+ow))?$/i);
  if (m) {
    const text = tidy(m[1]);
    if (text) return { kind: 'task', text: sentence(text), day: dayWord(m[2] || 'today') };
  }

  m = s.match(/^(?:help me\s+)?(?:decide|make a decision)\s*(?:on|about|if|whether|:|-|,)?\s*(.+)$/i) ||
      s.match(/^i (?:need|have|want) to (?:decide|make a decision)\s*(?:on|about|if|whether|:|-|,)?\s*(.+)$/i);
  if (m) {
    const text = tidy(m[1]);
    if (text) return { kind: 'decide', text: sentence(text) };
  }
  if ((m = s.match(/^should i\s+(.+)$/i))) return { kind: 'decide', text: 'Should I ' + m[1] + '?' };

  m = s.match(/^(?:please\s+)?add\s+(.+)$/i);
  if (m) {
    const tail = dayTail(m[1], 'today');
    const text = tidy(tail.text);
    if (text) return { kind: 'task', text: sentence(text), day: tail.day };
  }

  return { kind: 'unknown' };
}

// ---------------------------------------------------------------- the Calendar hand-off

function stamp(d: Date): string {
  return ymd(d).replace(/-/g, '') + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
}

/** Google Calendar's "new event" page, filled in. The user taps Save; Calendar does the ringing. */
export function calendarUrl(text: string, start: Date, minutes = 15): string {
  const end = new Date(start.getTime() + minutes * 60000);
  let zone = '';
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    zone = '';
  }
  const q = new URLSearchParams({ action: 'TEMPLATE', text, dates: stamp(start) + '/' + stamp(end), details: 'Set with One Thing.' });
  if (zone) q.set('ctz', zone);
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}

/** "Monday 19 October, 11:00" */
export function fmtWhen(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
