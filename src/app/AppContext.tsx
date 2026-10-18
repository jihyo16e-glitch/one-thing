import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from 'react';
import type { AppData, Decision, DecisionStep } from '../domain/types';
import { loadData, repairData, requestPersistence, saveData } from '../data/storage';
import { getDecision, newDecision, type PlanDraft } from '../domain/rules';
import { afterUpdate, withTransition, type Direction } from '../ui/motion';

const SAVE_FAILED_MSG = 'Could not save on this phone. Export a backup now.';

export type Tab = 'today' | 'plan' | 'decide' | 'goals' | 'ideas' | 'focusStart' | 'talk';
/** Pages pushed on top of Today: they slide in and out like iOS (the tab bar shows Today). */
const PUSHED: Tab[] = ['focusStart', 'talk'];

// ---- Talk (2026-10-18): the chat with the seed. Kept here so it survives a tab switch; never stored. ----
export type TalkAction =
  | { kind: 'calendar'; url: string }
  | { kind: 'go'; tab: Tab; label: string }
  | { kind: 'park'; text: string }
  | { kind: 'decide'; text: string }
  | { kind: 'say'; text: string }
  | { kind: 'exactSettings' };
export interface TalkMsg { id: number; from: 'me' | 'seed'; text: string; mood?: 'idle' | 'wave' | 'look' | 'happy' | 'think'; actions?: TalkAction[] }
/** A reminder that waits for its time ("What time?"). */
export interface TalkPending { text: string; dayOffset: number | null; part: 'am' | 'pm' | null }
export interface TalkState { messages: TalkMsg[]; pending: TalkPending | null }

/** The "Speak" shortcut on the app icon opens ./?talk (manifest.webmanifest). */
function firstTab(): Tab {
  try {
    if (new URLSearchParams(window.location.search).has('talk')) {
      window.history.replaceState(null, '', window.location.pathname); // a reload opens Today again
      return 'talk';
    }
  } catch {
    /* no URL access: start on Today */
  }
  return 'today';
}
const FIRST_TAB: Tab = firstTab(); // once per page load (a state initializer may run twice)
export type DecideView = 'home' | 'wizard' | 'saved' | 'log';
export interface DecideState { view: DecideView; dec: Decision | null; savedId: string | null }
export interface FocusSession { minutes: number; endsAt: number; asking: boolean; timeUp: boolean }
export interface Picture { url: string; name: string }
/**
 * A night plan typed but not saved yet. `draft.key` is the target day (today or tomorrow).
 * `base` = the saved day as it was when the draft was built, so PlanScreen can see changes made
 * elsewhere meanwhile (a tick on Today, "Move to tomorrow" in Ideas) and merge them in.
 */
export interface PlanState { draft: PlanDraft; base: PlanDraft; overflow: string; newTask: string }

interface AppContextValue {
  data: AppData;
  /** Apply a change to a structuredClone of the data, store it, and return the change's result. */
  commit: <R>(fn: (draft: AppData) => R) => R;
  replaceData: (next: AppData) => void;
  tab: Tab;
  go: (tab: Tab) => void;
  /** true: a new screen's cards rise in (tab switch). false: the screen arrived by a slide. */
  enter: boolean;
  /** Run a screen change as a slide (Decide steps, Focus start, welcome steps). */
  slide: (update: () => void, dir: Direction) => void;
  scrollTop: () => void;
  mainRef: RefObject<HTMLElement>;
  decide: DecideState;
  setDecide: (next: DecideState) => void;
  openDecision: (id: string) => void;
  /** Unsaved Plan screen state; null = none (the Plan screen builds a fresh draft from saved data). */
  plan: PlanState | null;
  setPlanState: (next: PlanState | null) => void;
  focus: FocusSession | null;
  setFocus: (next: FocusSession | null) => void;
  picture: Picture | null;
  setPicture: (next: Picture | null) => void;
  toast: (msg: string) => void;
  toastMsg: string;
  toastOn: boolean;
  /** The ONE thing done moment: the seed jumps once above the toast. 0 = not showing. */
  cheer: () => void;
  cheerKey: number;
  talk: TalkState;
  setTalk: Dispatch<SetStateAction<TalkState>>;
  /** Open Decide on a new decision with this text (from Talk), without a slide. */
  startDecision: (text: string) => void;
}

const Ctx = createContext<AppContextValue | null>(null);

// Which way the Decide screen slides when its view or wizard step changes (ui/motion.ts).
const VIEW_ORDER: Record<DecideView, number> = { home: 0, log: 1, wizard: 1, saved: 2 };
const STEP_ORDER: DecisionStep[] = ['type', 'choice2', 'feeling', 'tenten', 'regret', 'goals', 'identity', 'decision', 'action', 'done'];
function decideDirection(a: DecideState, b: DecideState): Direction | null {
  if (a.view !== b.view) return VIEW_ORDER[b.view] >= VIEW_ORDER[a.view] ? 'forward' : 'back';
  if (a.view === 'wizard' && a.dec && b.dec && a.dec.step !== b.dec.step) {
    return STEP_ORDER.indexOf(b.dec.step) > STEP_ORDER.indexOf(a.dec.step) ? 'forward' : 'back';
  }
  return null;
}

export function AppProvider({ children }: { children: ReactNode }) {
  // ---- toast (declared first: a failed save shows one) ----
  const [toastMsg, setToastMsg] = useState('');
  const [toastOn, setToastOn] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);
  const showToast = useCallback((msg: string, ms: number) => {
    setToastMsg(msg);
    setToastOn(true);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastOn(false), ms);
  }, []);
  const toast = useCallback((msg: string) => showToast(msg, 2200), [showToast]);
  const [cheerKey, setCheerKey] = useState(0);
  const cheerTimer = useRef<number | undefined>(undefined);
  const cheer = useCallback(() => {
    setCheerKey((k) => k + 1); // a new key replays the jump if you tick again
    window.clearTimeout(cheerTimer.current);
    cheerTimer.current = window.setTimeout(() => setCheerKey(0), 2700); // one jump (2.6 s), then gone
  }, []);

  // ---- data: the on-device store, localStorage "onething.v1" (src/data/storage.ts) ----
  const [data, setData] = useState<AppData>(() => loadData());
  const dataRef = useRef(data);
  const saveWarned = useRef(false);
  /** Write to the phone. If it fails, the app keeps working in memory and warns once per session. */
  const persist = useCallback(
    (next: AppData) => {
      if (saveData(next) || saveWarned.current) return;
      saveWarned.current = true;
      // Deferred, so the screen's own toast for the same tap ("Goal added.") cannot hide this
      // warning; shown longer than a normal toast because it asks the user to act.
      window.setTimeout(() => showToast(SAVE_FAILED_MSG, 5000), 0);
    },
    [showToast],
  );
  const commit = useCallback(
    function commit<R>(fn: (draft: AppData) => R): R {
      const next = structuredClone(dataRef.current);
      const result = fn(next);
      dataRef.current = next;
      setData(next);
      persist(next);
      return result;
    },
    [persist],
  );
  // ---- Plan keeps an unsaved night plan when you switch tabs (like Decide; PlanScreen owns the rules) ----
  const [plan, setPlanState] = useState<PlanState | null>(null);
  const replaceData = useCallback(
    (next: AppData) => {
      const fixed = repairData(next); // an imported file may miss optional parts
      dataRef.current = fixed;
      setData(fixed);
      persist(fixed);
      setPlanState(null); // a draft typed against the old data does not belong to the new data
    },
    [persist],
  );
  // Once on start: ask the browser to keep our data, and store what was loaded (first-run seed,
  // demo data, or the repaired saved data), so localStorage always matches the screen.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    requestPersistence();
    persist(dataRef.current);
  }, [persist]);

  // ---- navigation ----
  const [tab, setTab] = useState<Tab>(FIRST_TAB);
  const tabRef = useRef<Tab>(tab);
  const mainRef = useRef<HTMLElement>(null);
  const scrollTop = useCallback(() => {
    // During a slide, wait for the new screen; otherwise the old screen jumps before it leaves.
    afterUpdate(() => {
      if (mainRef.current) mainRef.current.scrollTop = 0;
    });
  }, []);
  // One motion at a time: set together with the screen change, never on its own (a class that flips on
  // mounted cards would restart their animation).
  const [enter, setEnter] = useState(true);
  const slide = useCallback((update: () => void, dir: Direction) => {
    withTransition(() => {
      setEnter(false);
      update();
    }, dir);
  }, []);
  // Tabs switch at once (the new screen's cards rise in, styles.css); Focus start slides like a pushed page.
  const go = useCallback(
    (next: Tab) => {
      const prev = tabRef.current;
      tabRef.current = next;
      if (PUSHED.includes(next) && !PUSHED.includes(prev)) slide(() => setTab(next), 'forward');
      else if (PUSHED.includes(prev) && !PUSHED.includes(next)) slide(() => setTab(next), 'back');
      else if (PUSHED.includes(prev) && PUSHED.includes(next) && prev !== next) slide(() => setTab(next), 'forward');
      else {
        setEnter(true);
        setTab(next);
      }
    },
    [slide],
  );
  useEffect(() => {
    scrollTop();
  }, [tab, scrollTop]);

  // ---- Decide keeps its place when you switch tabs (same as the gate 4 prototype) ----
  const [decide, setDecideRaw] = useState<DecideState>({ view: 'home', dec: null, savedId: null });
  const decideRef = useRef(decide);
  /** Every Decide change goes through here: a new view or wizard step slides; typing does not. */
  const setDecide = useCallback(
    (next: DecideState) => {
      const dir = decideDirection(decideRef.current, next);
      decideRef.current = next;
      if (dir) slide(() => setDecideRaw(next), dir);
      else setDecideRaw(next);
    },
    [slide],
  );
  const openDecision = useCallback((id: string) => {
    const rec = getDecision(dataRef.current, id);
    if (!rec) return;
    const dec = structuredClone(rec);
    dec.step = rec.step && rec.step !== 'done' ? rec.step : 'decision';
    const next: DecideState = { view: 'wizard', dec, savedId: null };
    decideRef.current = next; // a tab change, so no slide: the Decide cards rise in
    setDecideRaw(next);
    tabRef.current = 'decide';
    setEnter(true);
    setTab('decide');
  }, []);
  const startDecision = useCallback((text: string) => {
    const next: DecideState = { view: 'wizard', dec: newDecision(text), savedId: null };
    decideRef.current = next;
    setDecideRaw(next);
    tabRef.current = 'decide';
    setEnter(true);
    setTab('decide');
  }, []);

  // ---- Talk ----
  const [talk, setTalk] = useState<TalkState>({ messages: [], pending: null });

  // ---- focus mode ----
  const [focus, setFocus] = useState<FocusSession | null>(null);
  const [picture, setPicture] = useState<Picture | null>(null);

  const value = useMemo<AppContextValue>(
    () => ({ data, commit, replaceData, tab, go, enter, slide, scrollTop, mainRef, decide, setDecide, openDecision, plan, setPlanState, focus, setFocus, picture, setPicture, toast, toastMsg, toastOn, cheer, cheerKey, talk, setTalk, startDecision }),
    [data, commit, replaceData, tab, go, enter, slide, scrollTop, decide, setDecide, openDecision, plan, focus, picture, toast, toastMsg, toastOn, cheer, cheerKey, talk, startDecision],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
