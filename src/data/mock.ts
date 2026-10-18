/* ==== MOCK BOUNDARY — gate 6 replaces buildMock() with the real on-device store ====
   Shape = GAUNTLET-BRIEF.md §7.5: one object in localStorage key "onething.v1";
   the focus picture lives in IndexedDB "onething" / store "media".
   Same example data as the gate 4 prototype (static/index.html). */
import type { AppData, Day } from '../domain/types';
import { appDayKey, isoDaysAgo } from '../domain/dates';

export function buildMock(now: Date): AppData {
  const today = appDayKey(now, '05:30');
  const days: Record<string, Day> = {
    [today]: {
      plannedAt: isoDaysAgo(now, 0.5),
      one: { text: 'Watch the first 12 minutes of the decision video', goalId: 'g-study', done: false, doneAt: null },
      tasks: [
        { id: 't-1', text: 'Read the notes for video 5', done: true },
        { id: 't-2', text: 'Set a daily alarm for 20:25', done: false },
      ],
      small: { food: '', clothes: '' },
    },
  };
  return {
    version: 1,
    settings: {
      planTime: '20:30',
      dayBoundary: '05:30',
      lastExportAt: isoDaysAgo(now, 9),
      focus: { minutes: 50, keepAwake: true, fullScreen: true, pictureId: null },
      welcomeDone: true,
    },
    days,
    goals: [
      { id: 'g-exam', text: 'Pass the driving test', date: '2026-11-10', status: 'active', createdAt: isoDaysAgo(now, 2) },
      { id: 'g-job', text: 'Get a better job by March', status: 'active', createdAt: isoDaysAgo(now, 2) },
      { id: 'g-save', text: 'Save money every month', status: 'active', createdAt: isoDaysAgo(now, 2) },
      { id: 'g-study', text: 'Study the 6 skills', status: 'active', createdAt: isoDaysAgo(now, 2) },
      { id: 'g-shop', text: 'Small online shop', status: 'paused', createdAt: isoDaysAgo(now, 2) },
      { id: 'g-guitar', text: 'Learn guitar', status: 'paused', createdAt: isoDaysAgo(now, 2) },
      { id: 'g-yt', text: 'YouTube channel', status: 'paused', createdAt: isoDaysAgo(now, 2) },
    ],
    ideas: [
      { id: 'i-1', text: 'Compare two phone plans', source: 'overflow', createdAt: isoDaysAgo(now, 0.2) },
      { id: 'i-2', text: 'Try a budget app', source: 'idea', createdAt: isoDaysAgo(now, 2) },
      { id: 'i-3', text: 'Weekend trip with Ana and Leo', source: 'idea', createdAt: isoDaysAgo(now, 4) },
      { id: 'i-4', text: 'Find a cheap second-hand guitar', source: 'idea', createdAt: isoDaysAgo(now, 4) },
    ],
    decisions: [
      {
        id: 'd-1', text: 'Take the night class in January?', type: 1, status: 'pending', step: 'decision',
        feeling: 'fear', trustFeeling: false,
        t10m: 'Tired, but proud I signed up.', t10mo: 'Glad, if work still feels OK.', t10y: 'It was the start of a better job.',
        regretOk: true, goalId: 'g-job', fitsIdentity: true,
        choice: '', firstAction: '', actionDone: false, createdAt: isoDaysAgo(now, 1), decidedAt: null,
      },
      {
        id: 'd-2', text: 'Pause the online shop until I save 3 months of money?', type: 2, status: 'decided', step: 'done',
        choice: 'Yes, pause it.', firstAction: 'Move the shop to Paused in Goals.', actionDone: true,
        createdAt: isoDaysAgo(now, 2), decidedAt: isoDaysAgo(now, 2),
      },
      {
        id: 'd-3', text: 'Use the 09:30 block for study this week?', type: 2, status: 'decided', step: 'done',
        choice: 'Yes, 15 minutes a day.', firstAction: 'Put tomorrow’s ONE thing in the plan.', actionDone: true,
        createdAt: isoDaysAgo(now, 2), decidedAt: isoDaysAgo(now, 2),
      },
    ],
  };
}
/* ==== END MOCK BOUNDARY ==== */
