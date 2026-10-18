// The stored shape — GAUNTLET-BRIEF.md §7.5. One object in localStorage key "onething.v1" (gate 6).

export type GoalStatus = 'active' | 'paused';

export interface OneThing {
  text: string;
  goalId: string | null;
  done: boolean;
  doneAt: string | null;
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
  date?: string; // YYYY-MM-DD, for goals with a fixed day (an exam, a trip)
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
}

export interface AppData {
  version: 1;
  settings: Settings;
  days: Record<string, Day>;
  goals: Goal[];
  ideas: Idea[];
  decisions: Decision[];
}
