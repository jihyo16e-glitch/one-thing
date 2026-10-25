// The stored shape — GAUNTLET-BRIEF.md §7.5. One object in localStorage key "onething.v1" (gate 6).

/** 'done' and 'dropped' (= missed) goals stay in the list: they teach the late number. */
export type GoalStatus = 'active' | 'paused' | 'done' | 'dropped';
export type GoalLevel = 'year' | 'month' | 'week';

export interface OneThing {
  text: string;
  goalId: string | null;
  done: boolean;
  doneAt: string | null;
  /** What the user chose the next time, if it was not done: do it today, move it, or drop it. */
  carry?: 'today' | 'moved' | 'dropped';
}

export interface Task {
  id: string;
  text: string;
  done: boolean;
}

export interface Day {
  plannedAt: string | null;
  one: OneThing;
  tasks: Task[];
  small: { food: string; clothes: string };
}

export interface Goal {
  id: string;
  text: string;
  status: GoalStatus;
  createdAt: string;
  date?: string; // YYYY-MM-DD: the planned day (or a fixed day: an exam, a trip)
  /** The first planned day. Moving a goal keeps it, so "late" is measured against the first plan. */
  firstDate?: string;
  level?: GoalLevel;
  /** A month goal is one piece of a year goal, a week goal one piece of a month goal (Law 5: chunks). */
  parentId?: string;
  doneDate?: string; // YYYY-MM-DD, the day it was really done or dropped
  note?: string; // one line: why it was late, early or missed
}

/** The month-end check: goals written from memory first, then the real list. */
export interface MonthCheck {
  month: string; // YYYY-MM
  recalled: string;
  remembered: number;
  total: number;
  at: string;
}

/** A planned pause (a wedding, a trip): goal dates moved by its length, so nothing counts as late. */
export interface PlanPause {
  id: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD, included
  reason: string;
}

/** Phone time (APK only): which apps count as scrolling, the daily limit, and the floating bubble. */
export interface PhoneSettings {
  scrollApps: string[]; // Android package names
  limitMin: number;
  bubble: boolean;
  /** At the limit, a full-screen pause covers the scroll app (with the ONE thing and "5 more minutes"). */
  hardStop: boolean;
  /** The first-open "Stop doom scrolling" setup was answered (bubble turned on, or Skip). It shows once. */
  bubbleAsked: boolean;
}

export interface Idea {
  id: string;
  text: string;
  source: 'idea' | 'overflow';
  createdAt: string;
}

export type DecisionStep =
  | 'type' | 'choice2'
  | 'feeling' | 'tenten' | 'regret' | 'goals' | 'identity' | 'decision' | 'action'
  | 'done';

export interface Decision {
  id: string;
  text: string;
  type: 1 | 2 | null;
  status: 'draft' | 'pending' | 'decided';
  step: DecisionStep;
  feeling?: string | null;
  trustFeeling?: boolean | null;
  t10m?: string;
  t10mo?: string;
  t10y?: string;
  regretOk?: boolean | null;
  goalId?: string | null;
  fitsIdentity?: boolean | null;
  choice: string;
  firstAction: string;
  actionDone: boolean;
  createdAt: string;
  decidedAt: string | null;
  /** When the user tapped "Sleep on it". Today shows the decision again from the next day on. */
  sleptAt?: string;
}

export interface FocusSettings {
  minutes: number;
  keepAwake: boolean;
  fullScreen: boolean;
  pictureId: string | null;
}

export interface Settings {
  planTime: string; // HH:MM
  dayBoundary: string; // HH:MM — the app day ends here (after a late night)
  lastExportAt: string | null;
  focus: FocusSettings;
  /** false only on a brand-new phone: the 3-step welcome shows until it is finished or skipped. */
  welcomeDone: boolean;
  phone: PhoneSettings;
}

export interface AppData {
  version: 1;
  settings: Settings;
  days: Record<string, Day>;
  goals: Goal[];
  ideas: Idea[];
  decisions: Decision[];
  checks: MonthCheck[];
  pauses: PlanPause[];
}
