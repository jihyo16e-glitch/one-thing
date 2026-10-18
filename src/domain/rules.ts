// Every rule of the app lives here, not in the screens. Functions that change data take a
// mutable draft (AppContext.commit hands them a structuredClone), so React state stays immutable.
import type { AppData, Day, Decision, Goal } from './types';
import { appDayKey, daysBetween, fmtDate } from './dates';

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

export function addGoal(d: AppData, text: string): void {
  d.goals.push({ id: uid('g'), text, status: 'active', createdAt: new Date().toISOString() });
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

export function getDecision(d: AppData, id: string): Decision | null {
  return d.decisions.find((x) => x.id === id) ?? null;
}

export function saveDecision(d: AppData, dec: Decision): void {
  const copy: Decision = structuredClone(dec);
  const i = d.decisions.findIndex((x) => x.id === copy.id);
  if (i >= 0) d.decisions[i] = copy;
  else d.decisions.unshift(copy);
}
