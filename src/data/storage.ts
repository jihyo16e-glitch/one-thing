// The on-device store (GAUNTLET-BRIEF §7.5, PLAN.md item A): one JSON object in localStorage
// key "onething.v1". No server, no network.
//
// Rules:
// - A field that is MISSING (undefined or null) is filled with its default on load ("repair").
// - A field that is PRESENT but has the wrong type means the object is not AppData. Load keeps
//   that value under "onething.v1.broken-<timestamp>" and starts from the first-run seed.
//   User data is never deleted silently.
import type { AppData, Day, Decision, DecisionStep, Goal, Idea, Settings, Task } from '../domain/types';
import { MAX_TASKS, uid } from '../domain/rules';
import { buildMock } from './mock';
import { buildSeed, defaultFocus, defaultSettings } from './seed';

export const STORAGE_KEY = 'onething.v1';
const BROKEN_PREFIX = STORAGE_KEY + '.broken-';

/* Set when a broken value could not be copied aside. Then saveData refuses to write, so the
   broken value stays in STORAGE_KEY and is not overwritten. The app keeps working in memory. */
let overwriteBlocked = false;

/* ---------- shape check ---------- */

type Obj = Record<string, unknown>;

const STEPS: readonly DecisionStep[] = ['type', 'choice2', 'feeling', 'tenten', 'regret', 'goals', 'identity', 'decision', 'action', 'done'];
const TIME_RE = /^\d{2}:\d{2}$/; // same format GoalsScreen writes
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function none(v: unknown): boolean {
  return v === undefined || v === null;
}
function optStr(v: unknown): boolean {
  return none(v) || typeof v === 'string';
}
function optBool(v: unknown): boolean {
  return none(v) || typeof v === 'boolean';
}
function optIso(v: unknown): boolean {
  return none(v) || (typeof v === 'string' && !Number.isNaN(Date.parse(v)));
}
function optTime(v: unknown): boolean {
  return none(v) || (typeof v === 'string' && TIME_RE.test(v));
}
function optOneOf(v: unknown, list: readonly unknown[]): boolean {
  return none(v) || list.includes(v);
}

function isSettingsLike(v: unknown): boolean {
  if (!isObj(v)) return false;
  if (!optTime(v.planTime) || !optTime(v.dayBoundary) || !optIso(v.lastExportAt) || !optBool(v.welcomeDone)) return false;
  const f = v.focus;
  if (none(f)) return true;
  if (!isObj(f)) return false;
  const minutesOk = none(f.minutes) || (typeof f.minutes === 'number' && Number.isFinite(f.minutes) && f.minutes > 0);
  return minutesOk && optBool(f.keepAwake) && optBool(f.fullScreen) && optStr(f.pictureId);
}

function isTaskLike(v: unknown): boolean {
  return isObj(v) && typeof v.text === 'string' && optStr(v.id) && optBool(v.done);
}

function isDayLike(v: unknown): boolean {
  if (!isObj(v) || !optIso(v.plannedAt)) return false;
  const o = v.one;
  if (!none(o) && !(isObj(o) && optStr(o.text) && optStr(o.goalId) && optBool(o.done) && optIso(o.doneAt))) return false;
  const t = v.tasks;
  if (!none(t) && !(Array.isArray(t) && t.every(isTaskLike))) return false;
  const s = v.small;
  if (!none(s) && !(isObj(s) && optStr(s.food) && optStr(s.clothes))) return false;
  return true;
}

function isGoalLike(v: unknown): boolean {
  return (
    isObj(v) && typeof v.text === 'string' && optStr(v.id) && optOneOf(v.status, ['active', 'paused']) &&
    optIso(v.createdAt) && (none(v.date) || (typeof v.date === 'string' && DATE_RE.test(v.date)))
  );
}

function isIdeaLike(v: unknown): boolean {
  return isObj(v) && typeof v.text === 'string' && optStr(v.id) && optOneOf(v.source, ['idea', 'overflow']) && optIso(v.createdAt);
}

function isDecisionLike(v: unknown): boolean {
  return (
    isObj(v) && typeof v.text === 'string' && optStr(v.id) &&
    optOneOf(v.type, [1, 2]) && optOneOf(v.status, ['draft', 'pending', 'decided']) && optOneOf(v.step, STEPS) &&
    optStr(v.feeling) && optBool(v.trustFeeling) && optStr(v.t10m) && optStr(v.t10mo) && optStr(v.t10y) &&
    optBool(v.regretOk) && optStr(v.goalId) && optBool(v.fitsIdentity) &&
    optStr(v.choice) && optStr(v.firstAction) && optBool(v.actionDone) &&
    optIso(v.createdAt) && optIso(v.decidedAt)
  );
}

/**
 * True when x has the brief §7.5 shape. Missing optional parts are allowed (loadData and
 * AppContext.replaceData fill them); a present part with the wrong type is not.
 * Used by loadData and by the backup import (item C).
 */
export function isAppData(x: unknown): x is AppData {
  if (!isObj(x) || x.version !== 1) return false;
  if (!isSettingsLike(x.settings)) return false;
  if (!isObj(x.days) || !Object.values(x.days).every(isDayLike)) return false;
  if (!Array.isArray(x.goals) || !x.goals.every(isGoalLike)) return false;
  if (!Array.isArray(x.ideas) || !x.ideas.every(isIdeaLike)) return false;
  if (!Array.isArray(x.decisions) || !x.decisions.every(isDecisionLike)) return false;
  return true;
}

/* ---------- repair: fill missing parts with defaults ---------- */

function str(v: unknown, def: string): string {
  return typeof v === 'string' ? v : def;
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
function bool(v: unknown, def: boolean): boolean {
  return typeof v === 'boolean' ? v : def;
}
function boolOrNull(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}
function obj(v: unknown): Obj {
  return isObj(v) ? v : {};
}

function fixSettings(v: unknown): Settings {
  const s = obj(v);
  const def = defaultSettings();
  const f = obj(s.focus);
  const fd = defaultFocus();
  return {
    planTime: str(s.planTime, def.planTime),
    dayBoundary: str(s.dayBoundary, def.dayBoundary),
    lastExportAt: strOrNull(s.lastExportAt),
    focus: {
      minutes: typeof f.minutes === 'number' ? f.minutes : fd.minutes,
      keepAwake: bool(f.keepAwake, fd.keepAwake),
      fullScreen: bool(f.fullScreen, fd.fullScreen),
      pictureId: strOrNull(f.pictureId),
    },
    welcomeDone: bool(s.welcomeDone, def.welcomeDone),
  };
}

function fixTask(v: unknown): Task {
  const t = obj(v);
  return { id: str(t.id, '') || uid('t'), text: str(t.text, ''), done: bool(t.done, false) };
}

/** Returns the repaired day, plus any task beyond the 3-task limit (it goes to Idea parking). */
function fixDay(v: unknown): { day: Day; overflow: Task[] } {
  const d = obj(v);
  const o = obj(d.one);
  const s = obj(d.small);
  const tasks = Array.isArray(d.tasks) ? d.tasks.map(fixTask) : [];
  return {
    day: {
      plannedAt: strOrNull(d.plannedAt),
      one: { text: str(o.text, ''), goalId: strOrNull(o.goalId), done: bool(o.done, false), doneAt: strOrNull(o.doneAt) },
      tasks: tasks.slice(0, MAX_TASKS),
      small: { food: str(s.food, ''), clothes: str(s.clothes, '') },
    },
    overflow: tasks.slice(MAX_TASKS),
  };
}

function fixGoal(v: unknown, now: string): Goal {
  const g = obj(v);
  const goal: Goal = {
    id: str(g.id, '') || uid('g'),
    text: str(g.text, ''),
    status: g.status === 'paused' ? 'paused' : 'active',
    createdAt: str(g.createdAt, now),
  };
  if (typeof g.date === 'string') goal.date = g.date;
  return goal;
}

function fixIdea(v: unknown, now: string): Idea {
  const i = obj(v);
  return {
    id: str(i.id, '') || uid('i'),
    text: str(i.text, ''),
    source: i.source === 'overflow' ? 'overflow' : 'idea',
    createdAt: str(i.createdAt, now),
  };
}

function fixDecision(v: unknown, now: string): Decision {
  const x = obj(v);
  const type = x.type === 1 || x.type === 2 ? x.type : null;
  const decidedAt = strOrNull(x.decidedAt);
  const status: Decision['status'] =
    x.status === 'draft' || x.status === 'pending' || x.status === 'decided' ? x.status : decidedAt ? 'decided' : 'pending';
  const fallbackStep: DecisionStep =
    status === 'decided' ? 'done' : status === 'pending' ? 'decision' : type === 1 ? 'feeling' : type === 2 ? 'choice2' : 'type';
  const step = STEPS.find((s) => s === x.step) ?? fallbackStep;
  const dec: Decision = {
    id: str(x.id, '') || uid('d'),
    text: str(x.text, ''),
    type,
    status,
    step,
    choice: str(x.choice, ''),
    firstAction: str(x.firstAction, ''),
    actionDone: bool(x.actionDone, false),
    createdAt: str(x.createdAt, now),
    decidedAt,
  };
  // Optional answers are copied only when they exist, so a saved Type 2 decision stays as it was.
  if (x.feeling !== undefined) dec.feeling = strOrNull(x.feeling);
  if (x.trustFeeling !== undefined) dec.trustFeeling = boolOrNull(x.trustFeeling);
  if (x.t10m !== undefined) dec.t10m = str(x.t10m, '');
  if (x.t10mo !== undefined) dec.t10mo = str(x.t10mo, '');
  if (x.t10y !== undefined) dec.t10y = str(x.t10y, '');
  if (x.regretOk !== undefined) dec.regretOk = boolOrNull(x.regretOk);
  if (x.goalId !== undefined) dec.goalId = strOrNull(x.goalId);
  if (x.fitsIdentity !== undefined) dec.fitsIdentity = boolOrNull(x.fitsIdentity);
  return dec;
}

/**
 * A complete AppData built from data that passed isAppData: every missing part gets its default,
 * fields outside the §7.5 shape (e.g. a backup's exportedAt / picture) are dropped, and tasks
 * beyond the 3-task limit move to Idea parking as "overflow" (never deleted).
 * Returns a new object; the input is not changed. Used by loadData and AppContext.replaceData.
 */
export function repairData(input: AppData): AppData {
  const x = input as unknown as Obj;
  const now = new Date().toISOString();
  const days: Record<string, Day> = {};
  const overflow: Idea[] = [];
  for (const [key, value] of Object.entries(obj(x.days))) {
    const fixed = fixDay(value);
    days[key] = fixed.day;
    for (const t of fixed.overflow) {
      if (t.text.trim()) overflow.push({ id: uid('i'), text: t.text, source: 'overflow', createdAt: now });
    }
  }
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  return {
    version: 1,
    settings: fixSettings(x.settings),
    days,
    goals: list(x.goals).map((g) => fixGoal(g, now)),
    ideas: [...overflow, ...list(x.ideas).map((i) => fixIdea(i, now))],
    decisions: list(x.decisions).map((d) => fixDecision(d, now)),
  };
}

/* ---------- localStorage ---------- */

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // storage blocked: behave like a first run; saveData will report the failure
  }
}

function wantsDemo(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('demo'); // exact parameter: ?nodemo is not demo
  } catch {
    return false;
  }
}

/** Copy a value that is not AppData aside, then put the seed in its place. */
function keepBroken(raw: string, seed: AppData): void {
  try {
    window.localStorage.setItem(BROKEN_PREFIX + new Date().toISOString(), raw);
  } catch {
    overwriteBlocked = true; // could not copy it aside: leave it where it is
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  } catch {
    /* the AppContext save on start reports this */
  }
}

/** Saved data, repaired. Nothing saved → first-run seed, or the demo data when the URL has ?demo. */
export function loadData(): AppData {
  const now = new Date();
  const raw = readRaw();
  if (raw === null) return wantsDemo() ? buildMock(now) : buildSeed();
  let parsed: unknown = undefined;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* not JSON: handled as broken below */
  }
  if (isAppData(parsed)) return repairData(parsed);
  const seed = buildSeed(); // saved data exists, so never the demo here
  keepBroken(raw, seed);
  return seed;
}

/** Writes the whole object. Returns false when the write failed (quota, blocked storage). Never throws. */
export function saveData(d: AppData): boolean {
  if (overwriteBlocked) return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

/** Asks the browser not to clear this app's data (brief §7.5). Best effort, never throws. */
export function requestPersistence(): void {
  try {
    const sm: StorageManager | undefined = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (sm && typeof sm.persist === 'function') sm.persist().catch(() => undefined);
  } catch {
    /* not supported: nothing to do */
  }
}
