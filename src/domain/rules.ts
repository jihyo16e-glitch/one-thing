// Every rule of the app lives here, not in the screens. Functions that change data take a
// mutable draft (AppContext.commit hands them a structuredClone), so React state stays immutable.
import type { AppData, Day, Decision, Goal, GoalLevel, MonthCheck, PlanPause } from './types';
import { addDays, appDayKey, daysBetween, daysSince, fmtDate, ymd } from './dates';

export const MAX_TASKS = 3;

export function uid(prefix: string): string {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function todayKey(d: AppData, now: Date = new Date()): string {
  return appDayKey(now, d.settings.dayBoundary);
}

export function getDay(d: AppData, key: string): Day | null {
  return d.days[key] ?? null;
}

export function ensureDay(d: AppData, key: string): Day {
  if (!d.days[key]) {
    d.days[key] = { plannedAt: null, one: { text: '', goalId: null, done: false, doneAt: null }, tasks: [], small: { food: '', clothes: '' } };
  }
  return d.days[key];
}

export function hasPlan(d: AppData, key: string): boolean {
  const day = d.days[key];
  return !!(day && day.one.text);
}

/** The 3-task limit (brief §7.5). Returns false when the day is full. */
export function addTask(d: AppData, key: string, text: string): boolean {
  const day = ensureDay(d, key);
  if (day.tasks.length >= MAX_TASKS) return false;
  day.tasks.push({ id: uid('t'), text, done: false });
  return true;
}

/** Change the words of the day's ONE thing. The tick stays: most edits fix a typo. */
export function setOneText(d: AppData, key: string, text: string): void {
  const day = ensureDay(d, key);
  day.one = { ...day.one, text };
  if (!day.plannedAt) day.plannedAt = new Date().toISOString();
}

export function updateTask(d: AppData, key: string, id: string, text: string): void {
  const t = getDay(d, key)?.tasks.find((x) => x.id === id);
  if (t) t.text = text;
}

export function removeTask(d: AppData, key: string, id: string): void {
  const day = getDay(d, key);
  if (day) day.tasks = day.tasks.filter((t) => t.id !== id);
}

export function addIdea(d: AppData, text: string, source: 'idea' | 'overflow' = 'idea'): void {
  d.ideas.unshift({ id: uid('i'), text, source, createdAt: new Date().toISOString() });
}

export function removeIdea(d: AppData, id: string): void {
  d.ideas = d.ideas.filter((i) => i.id !== id);
}

export function moveIdeaToDay(d: AppData, id: string, key: string): boolean {
  const idea = d.ideas.find((i) => i.id === id);
  if (!idea) return false;
  if (!addTask(d, key, idea.text)) return false; // the day is full
  removeIdea(d, id);
  return true;
}

export function getGoal(d: AppData, id: string): Goal | null {
  return d.goals.find((g) => g.id === id) ?? null;
}

export function activeGoals(d: AppData): Goal[] {
  return d.goals.filter((g) => g.status === 'active');
}

export interface GoalFields { level?: GoalLevel; parentId?: string; date?: string }

export function addGoal(d: AppData, text: string, f: GoalFields = {}): Goal {
  const g: Goal = { id: uid('g'), text, status: 'active', createdAt: new Date().toISOString() };
  if (f.level) g.level = f.level;
  if (f.parentId && parentLevel(f.level) === getGoal(d, f.parentId)?.level) g.parentId = f.parentId;
  if (f.date) g.date = f.date;
  d.goals.push(g);
  return g;
}

/** Deletes a goal for good. Plans, decisions and smaller goals that pointed at it simply lose the link. */
export function deleteGoal(d: AppData, id: string): void {
  d.goals = d.goals.filter((g) => g.id !== id);
  for (const g of d.goals) if (g.parentId === id) delete g.parentId;
  for (const day of Object.values(d.days)) if (day.one.goalId === id) day.one.goalId = null;
  for (const x of d.decisions) if (x.goalId === id) x.goalId = null;
}

/** Most goals that still work at one level (fewer goals, deeper work). Adding more asks first; it never blocks. */
export const GOAL_SOFT_MAX = 3;

export function goalsAtLevel(d: AppData, level: GoalLevel | undefined): number {
  return activeGoals(d).filter((g) => (g.level ?? null) === (level ?? null)).length;
}

/* ---------- the goal ladder (2026-10-25): year → month → week, planned day vs done day ---------- */

export const LEVELS: { id: GoalLevel; label: string; head: string }[] = [
  { id: 'year', label: 'Year', head: 'This year' },
  { id: 'month', label: 'Month', head: 'This month' },
  { id: 'week', label: 'Week', head: 'This week' },
];

/** A month goal is a piece of a year goal, a week goal a piece of a month goal. */
export function parentLevel(level: GoalLevel | undefined): GoalLevel | null {
  return level === 'month' ? 'year' : level === 'week' ? 'month' : null;
}

function localKey(iso: string): string {
  return ymd(new Date(iso));
}

/**
 * Save a goal's name, level, parent and planned day. Changing the day of a goal that was made on an
 * earlier day is a move: the first planned day is kept, so the late number stays honest.
 */
export function saveGoal(d: AppData, id: string, text: string, f: GoalFields, today: string): void {
  const g = getGoal(d, id);
  if (!g) return;
  g.text = text;
  if (f.level) g.level = f.level;
  else delete g.level;
  const parent = f.parentId ? getGoal(d, f.parentId) : null;
  if (parent && parent.id !== g.id && parentLevel(g.level) === parent.level) g.parentId = parent.id;
  else delete g.parentId;
  const next = f.date || undefined;
  if (next !== g.date) {
    if (g.date && !g.firstDate && localKey(g.createdAt) < today) g.firstDate = g.date;
    if (next) g.date = next;
    else delete g.date;
  }
}

export function moveGoal(d: AppData, id: string, date: string): void {
  const g = getGoal(d, id);
  if (!g) return;
  if (g.date && !g.firstDate) g.firstDate = g.date;
  g.date = date;
}

export function finishGoal(d: AppData, id: string, doneDate: string, note = ''): Goal | null {
  const g = getGoal(d, id);
  if (!g) return null;
  g.status = 'done';
  g.doneDate = doneDate;
  if (note.trim()) g.note = note.trim();
  return g;
}

export function dropGoal(d: AppData, id: string, today: string, note = ''): void {
  const g = getGoal(d, id);
  if (!g) return;
  g.status = 'dropped';
  g.doneDate = today;
  if (note.trim()) g.note = note.trim();
}

export function reopenGoal(d: AppData, id: string): void {
  const g = getGoal(d, id);
  if (!g) return;
  g.status = 'active';
  delete g.doneDate;
}

export type GoalMark = 'ontime' | 'late' | 'early' | 'missed';

/** Days a goal may be off and still count as on time. */
const TOLERANCE: Record<GoalLevel | 'none', number> = { year: 7, month: 2, week: 0, none: 0 };

export function plannedDay(g: Goal): string | undefined {
  return g.firstDate ?? g.date;
}

/** ✅ on time, 🐢 late, 🐇 early, ❌ missed. Null while the goal is open, or when it had no planned day. */
export function goalMark(g: Goal): { mark: GoalMark; days: number } | null {
  if (g.status === 'dropped') return { mark: 'missed', days: 0 };
  const plan = plannedDay(g);
  if (g.status !== 'done' || !g.doneDate || !plan) return null;
  const diff = daysBetween(plan, g.doneDate);
  const tol = TOLERANCE[g.level ?? 'none'];
  if (diff > tol) return { mark: 'late', days: diff };
  if (diff < -tol) return { mark: 'early', days: -diff };
  return { mark: 'ontime', days: 0 };
}

export function markLabel(m: { mark: GoalMark; days: number }): string {
  const n = (x: number) => x + (x === 1 ? ' day' : ' days');
  if (m.mark === 'late') return '🐢 ' + n(m.days) + ' late';
  if (m.mark === 'early') return '🐇 ' + n(m.days) + ' early';
  if (m.mark === 'missed') return '❌ Missed';
  return '✅ On time';
}

export const LATE_NUMBER_MIN = 5;

/**
 * How long goals really take compared with the first guess: 1.4 = "you take 1.4x your guess".
 * The median over done goals that had a planned day at least one day after they were made.
 * `ratio` is null until LATE_NUMBER_MIN goals count.
 */
export function lateNumber(d: AppData): { ratio: number | null; count: number } {
  const ratios: number[] = [];
  for (const g of d.goals) {
    const plan = plannedDay(g);
    if (g.status !== 'done' || !g.doneDate || !plan) continue;
    const made = localKey(g.createdAt);
    const guess = daysBetween(made, plan);
    if (guess < 1) continue;
    ratios.push(Math.max(0, daysBetween(made, g.doneDate)) / guess);
  }
  if (ratios.length < LATE_NUMBER_MIN) return { ratio: null, count: ratios.length };
  ratios.sort((a, b) => a - b);
  const mid = Math.floor(ratios.length / 2);
  const median = ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
  return { ratio: Math.round(median * 10) / 10, count: ratios.length };
}

/** Open goals whose planned day has passed. */
export function overdueGoals(d: AppData, today: string): Goal[] {
  return activeGoals(d).filter((g) => g.date && g.date < today);
}

/* ---------- the month-end check (Law 1: from memory first) ---------- */

/** The month to check now, or null: the last 3 days of a month and the first 5 of the next, once per month. */
export function checkDue(d: AppData, today: string): string | null {
  if (!activeGoals(d).length) return null;
  const day = Number(today.slice(8, 10));
  const last = lastDayOf(today);
  let month: string | null = null;
  if (day >= last - 2) month = today.slice(0, 7);
  else if (day <= 5) month = addDays(today.slice(0, 7) + '-01', -1).slice(0, 7);
  if (!month || d.checks.some((c) => c.month === month)) return null;
  return month;
}

function lastDayOf(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export interface CheckAnswer {
  id: string;
  remembered: boolean;
  action: 'keep' | 'done' | 'move' | 'drop';
  date: string; // the done day or the new planned day
  note: string;
}

export function saveCheck(d: AppData, month: string, recalled: string, answers: CheckAnswer[], today: string): MonthCheck {
  for (const a of answers) {
    if (a.action === 'done') finishGoal(d, a.id, a.date || today, a.note);
    else if (a.action === 'drop') dropGoal(d, a.id, today, a.note);
    else if (a.action === 'move' && a.date) {
      moveGoal(d, a.id, a.date);
      const g = getGoal(d, a.id);
      if (g && a.note.trim()) g.note = a.note.trim();
    }
  }
  const check: MonthCheck = {
    month,
    recalled: recalled.trim(),
    remembered: answers.filter((a) => a.remembered).length,
    total: answers.length,
    at: new Date().toISOString(),
  };
  d.checks = d.checks.filter((c) => c.month !== month);
  d.checks.push(check);
  return check;
}

/* ---------- planned pauses (a wedding, a trip): nothing counts as late ---------- */

/** Moves every open goal's days on or after `from` by the pause length. Returns how many goals moved. */
export function addPause(d: AppData, from: string, to: string, reason: string): number {
  const days = daysBetween(from, to) + 1;
  let moved = 0;
  for (const g of d.goals) {
    if (g.status !== 'active' && g.status !== 'paused') continue;
    let hit = false;
    if (g.date && g.date >= from) { g.date = addDays(g.date, days); hit = true; }
    if (g.firstDate && g.firstDate >= from) { g.firstDate = addDays(g.firstDate, days); hit = true; }
    if (hit) moved++;
  }
  d.pauses.push({ id: uid('p'), from, to, reason });
  return moved;
}

export function pauseOn(d: AppData, key: string): PlanPause | null {
  return d.pauses.find((p) => p.from <= key && key <= p.to) ?? null;
}

export function removePause(d: AppData, id: string): void {
  d.pauses = d.pauses.filter((p) => p.id !== id); // goal days stay where they are: the user can move them
}

/* ---------- an unfinished ONE thing carries over (no guilt) ---------- */

/** The last planned day before today, if its ONE thing was not done and nothing was chosen for it yet. */
export function unfinishedOne(d: AppData, today: string): { key: string; day: Day } | null {
  for (let i = 1; i <= 7; i++) {
    const key = addDays(today, -i);
    const day = d.days[key];
    if (!day || !day.one.text) continue;
    if (day.one.done || day.one.carry || pauseOn(d, key)) return null;
    return { key, day };
  }
  return null;
}

/** Where the carried ONE thing landed: as the day's ONE thing, as a task, or in Idea parking (day full). */
export type CarryResult = 'one' | 'task' | 'idea';

export function carryOne(d: AppData, fromKey: string, toKey: string, today: string): CarryResult | null {
  const from = getDay(d, fromKey);
  if (!from || !from.one.text) return null;
  const { text, goalId } = from.one;
  const to = ensureDay(d, toKey);
  let result: CarryResult;
  if (!to.one.text) {
    to.one = { text, goalId, done: false, doneAt: null };
    if (!to.plannedAt) to.plannedAt = new Date().toISOString();
    result = 'one';
  } else if (addTask(d, toKey, text)) result = 'task';
  else {
    addIdea(d, text, 'overflow');
    result = 'idea';
  }
  from.one.carry = toKey === today ? 'today' : 'moved';
  return result;
}

export function dropOne(d: AppData, key: string): void {
  const day = getDay(d, key);
  if (day) day.one.carry = 'dropped';
}

/** The welcome's last step: the user's own goals (empty lines skipped) and plan time. */
export function finishWelcome(d: AppData, goals: string[], planTime: string): void {
  for (const g of goals) {
    if (g.trim()) addGoal(d, g.trim());
  }
  if (/^\d{2}:\d{2}$/.test(planTime)) d.settings.planTime = planTime;
  d.settings.welcomeDone = true;
}

export function updateGoal(d: AppData, id: string, text: string): void {
  const g = getGoal(d, id);
  if (g) g.text = text;
}

export function toggleGoal(d: AppData, id: string): Goal | null {
  const g = getGoal(d, id);
  if (g) g.status = g.status === 'active' ? 'paused' : 'active';
  return g;
}

export function goalLabel(g: Goal): string {
  return g.date ? g.text + ' (' + fmtDate(g.date) + ')' : g.text;
}

export function goalMeta(g: Goal, today: string): string {
  if (!g.date) return '';
  const n = daysBetween(today, g.date);
  return fmtDate(g.date) + ' · ' + (n > 1 ? 'in ' + n + ' days' : n === 1 ? 'tomorrow' : n === 0 ? 'today' : -n + ' days ago');
}

export interface PlanDraft {
  key: string;
  one: string;
  goalId: string;
  tasks: { id: string; text: string; done: boolean }[];
  food: string;
  clothes: string;
}

export function setPlan(d: AppData, key: string, dr: PlanDraft): void {
  const day = ensureDay(d, key);
  const text = dr.one.trim();
  const keepDone = day.one.text === text ? day.one.done : false;
  day.one = { text, goalId: dr.goalId || null, done: keepDone, doneAt: keepDone ? day.one.doneAt : null };
  day.tasks = dr.tasks
    .filter((t) => t.text.trim())
    .slice(0, MAX_TASKS) // the 3-task limit, enforced again at save time
    .map((t) => ({ id: t.id, text: t.text.trim(), done: !!t.done }));
  day.small = { food: dr.food.trim(), clothes: dr.clothes.trim() };
  day.plannedAt = new Date().toISOString();
}

/** A fresh decision at its first step (Decide, or a sentence on the Talk screen). */
export function newDecision(text: string): Decision {
  return {
    id: uid('d'), text, type: null, status: 'draft', step: 'type',
    feeling: null, trustFeeling: null, t10m: '', t10mo: '', t10y: '',
    regretOk: null, goalId: null, fitsIdentity: null,
    choice: '', firstAction: '', actionDone: false,
    createdAt: new Date().toISOString(), decidedAt: null,
  };
}

export function pendingDecisions(d: AppData): Decision[] {
  return d.decisions.filter((x) => x.status === 'pending');
}

/** Whole days since the user started: the oldest goal or plan. */
export function daysOfUse(d: AppData, now: Date = new Date()): number {
  const times = [...d.goals.map((g) => g.createdAt), ...Object.values(d.days).map((x) => x.plannedAt)]
    .map((t) => (t ? Date.parse(t) : NaN))
    .filter((t) => Number.isFinite(t));
  return times.length ? Math.floor((now.getTime() - Math.min(...times)) / 86400000) : 0;
}

/** Ask for a backup when the last one is over a week old, or after the first week with none (not on day 1). */
export function backupDue(d: AppData, now: Date = new Date()): boolean {
  const since = daysSince(d.settings.lastExportAt);
  return since === null ? daysOfUse(d, now) >= 7 : since > 7;
}

/** Decisions you slept on before today: only these come back on Today ("You slept on this"). */
export function sleptDecisions(d: AppData, today: string): Decision[] {
  return pendingDecisions(d).filter((x) => !x.sleptAt || appDayKey(new Date(x.sleptAt), d.settings.dayBoundary) < today);
}

export function getDecision(d: AppData, id: string): Decision | null {
  return d.decisions.find((x) => x.id === id) ?? null;
}

export function saveDecision(d: AppData, dec: Decision): void {
  const copy: Decision = structuredClone(dec);
  const i = d.decisions.findIndex((x) => x.id === copy.id);
  if (i >= 0) d.decisions[i] = copy;
  else d.decisions.unshift(copy);
}
