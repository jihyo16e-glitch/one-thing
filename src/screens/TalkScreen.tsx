import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useApp, type TalkAction, type TalkMsg, type TalkPending } from '../app/AppContext';
import { isNative } from '../app/native';
import { canRing, openExactSettings, scheduleReminder } from '../app/reminders';
import { listen, speechErrorText, speechNeedsInternet, speechSupported } from '../app/speech';
import { EXAMPLES, calendarUrl, fmtWhen, parseCommand, parseTimeAnswer, type When } from '../domain/commands';
import { addDays, fmtClockTime } from '../domain/dates';
import { MAX_TASKS, activeGoals, addIdea, addTask, getDay, setOneText, todayKey } from '../domain/rules';
import { Header } from '../ui/Header';
import { Icon } from '../ui/Icon';
import { Mascot } from '../ui/Mascot';
import { buzz } from '../ui/motion';

type Reply = Omit<TalkMsg, 'id' | 'from'>;
let nextId = 1; // message ids; the chat is never stored

const CANCEL = /^(?:cancel|stop|never ?mind|no|forget it)$/i;

/** Talk to the seed: tap the mic (or type), it does one thing and answers. Fixed sentences, no AI. */
export function TalkScreen() {
  const { data, commit, go, cheer, talk, setTalk, startDecision } = useApp();
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState(''); // live words while listening
  const stopRef = useRef<(() => void) | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const supported = speechSupported();

  function add(me: string | null, replies: Reply[], pending: TalkPending | null) {
    setTalk((t) => {
      const msgs: TalkMsg[] = [...t.messages];
      if (me !== null) msgs.push({ id: nextId++, from: 'me', text: me });
      for (const r of replies) msgs.push({ id: nextId++, from: 'seed', ...r });
      return { messages: msgs.slice(-60), pending };
    });
  }

  /** The web app cannot ring by itself, so it hands the reminder to Google Calendar. */
  function calendarReply(what: string, at: Date): Reply {
    return {
      text: 'Reminder for ' + fmtWhen(at) + ': ' + what + '. Tap the button, then Save in Calendar. Calendar reminds you, also when this app is closed.',
      mood: 'happy',
      actions: [{ kind: 'calendar', url: calendarUrl(what, at) }],
    };
  }

  /** A reminder: no time yet → ask; in the APK → Android rings it; on the web → Calendar. */
  function remind(me: string | null, what: string, when: When) {
    if (!when.ok) {
      const r = askTime(what, when);
      add(me, [r.reply], r.pending);
      return;
    }
    const at = when.at;
    if (!canRing()) {
      add(me, [calendarReply(what, at)], null);
      return;
    }
    add(me, [], null); // your words show at once; the answer follows when Android has the alarm
    scheduleReminder(what, at).then((res) => {
      if (res === 'ok') {
        add(null, [{ text: 'Done. Your phone will ring on ' + fmtWhen(at) + ': ' + what + '.', mood: 'happy' }], null);
        buzz(10);
      } else if (res === 'inexact') {
        add(null, [{ text: 'Set for ' + fmtWhen(at) + ': ' + what + '. It may ring a little late. To ring on time, allow "Alarms and reminders" for One Thing.', mood: 'think', actions: [{ kind: 'exactSettings' }] }], null);
      } else if (res === 'denied') {
        add(null, [{ text: 'I cannot ring: notifications are off for One Thing. Allow them in the phone settings, then say it again. Or save it in Calendar:', mood: 'look', actions: [{ kind: 'calendar', url: calendarUrl(what, at) }] }], null);
      } else {
        add(null, [calendarReply(what, at)], null);
      }
    });
  }

  function askTime(what: string, when: Exclude<When, { ok: true }>): { reply: Reply; pending: TalkPending } {
    if (when.reason === 'past') {
      return {
        reply: { text: fmtClockTime(when.at) + ' today has already passed. What time? For example: 11 AM, or in 2 hours.', mood: 'think' },
        pending: { text: what, dayOffset: null, part: null },
      };
    }
    return {
      reply: { text: 'What time? For example: 11 AM, or in 2 hours.', mood: 'think' },
      pending: { text: what, dayOffset: when.dayOffset, part: when.part },
    };
  }

  /** Runs one sentence. Reads the newest saved data inside commit(), so a late speech result is safe. */
  function run(said: string) {
    const words = said.trim();
    if (!words) return;
    const now = new Date();

    if (talk.pending) {
      const p = talk.pending;
      if (CANCEL.test(words)) { add(words, [{ text: 'OK. No reminder.', mood: 'idle' }], null); return; }
      const when = parseTimeAnswer(words, now, p.dayOffset, p.part);
      if (when) {
        remind(words, p.text, when);
        return;
      }
      if (parseCommand(words, now).kind === 'unknown') {
        add(words, [{ text: 'I need a time for the reminder. For example: 11 AM, or in 2 hours. Or say cancel.', mood: 'think' }], p);
        return;
      }
    }

    const cmd = parseCommand(words, now);
    const key = todayKey(data, now);
    switch (cmd.kind) {
      case 'empty':
        return;
      case 'help':
        add(words, [{ text: 'You can say things like these. Tap one to try it.', mood: 'wave', actions: EXAMPLES.map((e) => ({ kind: 'say', text: e }) as TalkAction) }], null);
        return;
      case 'reminder':
        remind(words, cmd.text, cmd.when);
        return;
      case 'one': {
        const dayKey = cmd.day === 'today' ? key : addDays(key, 1);
        const before = commit((d) => {
          const old = getDay(d, dayKey)?.one.text ?? '';
          setOneText(d, dayKey, cmd.text);
          const day = getDay(d, dayKey);
          if (day && old && old !== cmd.text) { day.one.done = false; day.one.doneAt = null; } // a new thing, not a typo fix
          return old;
        });
        const whose = cmd.day === 'today' ? "Today's" : "Tomorrow's";
        const text = before && before !== cmd.text
          ? 'Changed. ' + whose + ' ONE thing is now: ' + cmd.text + '. (Before: ' + before + '.)'
          : 'Saved. ' + whose + ' ONE thing: ' + cmd.text + '.';
        add(words, [{ text, mood: 'happy', actions: [cmd.day === 'today' ? { kind: 'go', tab: 'today', label: 'See Today' } : { kind: 'go', tab: 'plan', label: 'See the plan' }] }], null);
        buzz(10);
        return;
      }
      case 'task': {
        const dayKey = cmd.day === 'today' ? key : addDays(key, 1);
        const result = commit((d) => {
          const ok = addTask(d, dayKey, cmd.text);
          const day = getDay(d, dayKey);
          return { ok, count: day?.tasks.length ?? 0, hasOne: !!day?.one.text };
        });
        const dayName = cmd.day === 'today' ? 'today' : 'tomorrow';
        if (!result.ok) {
          add(words, [{ text: (cmd.day === 'today' ? 'Today' : 'Tomorrow') + ' is full (3 of 3 tasks). Park it in Ideas?', mood: 'think', actions: [{ kind: 'park', text: cmd.text }] }], null);
          return;
        }
        let text = 'Added to ' + dayName + ': ' + cmd.text + ' (' + result.count + ' of ' + MAX_TASKS + ' tasks).';
        if (!result.hasOne) text += ' Pick a ONE thing for ' + dayName + ' too. Say: My ONE thing is …';
        add(words, [{ text, mood: 'happy', actions: [cmd.day === 'today' ? { kind: 'go', tab: 'today', label: 'See Today' } : { kind: 'go', tab: 'plan', label: 'See the plan' }] }], null);
        buzz(8);
        return;
      }
      case 'idea':
        commit((d) => addIdea(d, cmd.text));
        add(words, [{ text: 'Parked in Ideas: ' + cmd.text + '.', mood: 'idle', actions: [{ kind: 'go', tab: 'ideas', label: 'See Ideas' }] }], null);
        return;
      case 'focus': {
        const one = getDay(data, key)?.one;
        if (!one?.text) { add(words, [{ text: 'First pick your ONE thing. Say: My ONE thing is …', mood: 'look' }], null); return; }
        if (one.done) { add(words, [{ text: 'Your ONE thing is already done today. Well done.', mood: 'happy' }], null); return; }
        if (cmd.minutes) commit((d) => { d.settings.focus.minutes = cmd.minutes as number; });
        const minutes = cmd.minutes ?? data.settings.focus.minutes;
        add(words, [{ text: 'Ready: ' + minutes + ' minutes on “' + one.text + '”. Tap Open Focus, then Start.', mood: 'happy', actions: [{ kind: 'go', tab: 'focusStart', label: 'Open Focus' }] }], null);
        return;
      }
      case 'done': {
        const state = commit((d) => {
          const day = getDay(d, key);
          if (!day || !day.one.text) return 'none';
          if (day.one.done) return 'already';
          day.one.done = true;
          day.one.doneAt = new Date().toISOString();
          return 'done';
        });
        if (state === 'none') add(words, [{ text: 'You have no ONE thing today yet. Say: My ONE thing is …', mood: 'look' }], null);
        else if (state === 'already') add(words, [{ text: 'It is already done. Well done.', mood: 'happy' }], null);
        else {
          cheer();
          buzz(14);
          add(words, [{ text: 'ONE thing done. Well done!', mood: 'happy', actions: [{ kind: 'go', tab: 'today', label: 'See Today' }] }], null);
        }
        return;
      }
      case 'plan': {
        const dayKey = cmd.day === 'today' ? key : addDays(key, 1);
        const day = getDay(data, dayKey);
        const name = cmd.day === 'today' ? 'today' : 'tomorrow';
        if (!day || !day.one.text) {
          add(words, [{ text: 'No plan for ' + name + ' yet. Say: My ONE thing ' + (cmd.day === 'tomorrow' ? 'for tomorrow ' : '') + 'is …', mood: 'look' }], null);
          return;
        }
        let text = (cmd.day === 'today' ? 'Today' : 'Tomorrow') + ', your ONE thing is: ' + day.one.text + (day.one.done ? ' (done)' : '') + '.';
        if (day.tasks.length) text += ' Tasks: ' + day.tasks.map((t) => t.text + (t.done ? ' (done)' : '')).join('; ') + '.';
        add(words, [{ text, mood: 'idle', actions: [cmd.day === 'today' ? { kind: 'go', tab: 'today', label: 'See Today' } : { kind: 'go', tab: 'plan', label: 'See the plan' }] }], null);
        return;
      }
      case 'goals': {
        const goals = activeGoals(data);
        add(words, [goals.length
          ? { text: 'Your goals: ' + goals.map((g) => g.text).join('; ') + '.', mood: 'idle', actions: [{ kind: 'go', tab: 'goals', label: 'See Goals' }] }
          : { text: 'You have no goals yet. Add them in Goals.', mood: 'look', actions: [{ kind: 'go', tab: 'goals', label: 'Open Goals' }] }], null);
        return;
      }
      case 'decide':
        add(words, [{ text: 'Let us decide: ' + cmd.text + ' Tap Open Decide for the steps.', mood: 'think', actions: [{ kind: 'decide', text: cmd.text }] }], null);
        return;
      default:
        add(words, [{ text: 'Sorry, I did not understand “' + words + '”. Try one of these:', mood: 'think', actions: EXAMPLES.slice(0, 3).map((e) => ({ kind: 'say', text: e }) as TalkAction) }], null);
    }
  }

  // A speech result arrives later than the tap: always run it with the newest screen state.
  const runRef = useRef(run);
  runRef.current = run;

  function act(a: TalkAction) {
    if (a.kind === 'go') go(a.tab);
    else if (a.kind === 'decide') startDecision(a.text);
    else if (a.kind === 'say') runRef.current(a.text);
    else if (a.kind === 'exactSettings') openExactSettings();
    else if (a.kind === 'park') {
      commit((d) => addIdea(d, a.text, 'overflow'));
      add(null, [{ text: 'Parked in Ideas: ' + a.text + '.', mood: 'idle', actions: [{ kind: 'go', tab: 'ideas', label: 'See Ideas' }] }], null);
    }
  }

  function send(e: FormEvent) {
    e.preventDefault();
    const t = text;
    setText('');
    run(t);
  }

  function mic() {
    if (listening) { stopRef.current?.(); return; }
    if (speechNeedsInternet() && !navigator.onLine) { add(null, [{ text: speechErrorText('network') as string, mood: 'look' }], talk.pending); return; }
    setListening(true);
    setHeard('');
    stopRef.current = listen({
      onInterim: setHeard,
      onFinal: (t) => { setHeard(''); runRef.current(t); },
      onError: (code) => {
        const msg = speechErrorText(code);
        if (msg) setTalk((tk) => ({ ...tk, messages: [...tk.messages, { id: nextId++, from: 'seed', text: msg, mood: 'look' }] }));
      },
      onEnd: () => { setListening(false); setHeard(''); stopRef.current = null; },
    });
  }

  // Stop the mic when you leave the screen.
  useEffect(() => () => stopRef.current?.(), []);
  // Keep the newest message in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [talk.messages.length, heard]);

  const last = talk.messages.length - 1;

  return (
    <>
      <button type="button" className="btn btn-sm btn-quiet" style={{ alignSelf: 'flex-start' }} onClick={() => go('today')}>
        <Icon name="back" size={20} width={2} />
        <span>Today</span>
      </button>
      <Header sub={supported ? 'Tap the mic and speak, or type' : 'Type what you need'} title="Talk" />

      <section className="talk-list" aria-label="Chat with the seed" aria-live="polite">
        <div className="bubble-row">
          <Mascot mood="wave" size={40} pad={10} still={talk.messages.length > 0} />
          <div className="bubble seed-b">
            <p>Hi! Tell me what you need. For example:</p>
            <div className="chips">
              {EXAMPLES.map((e) => (
                <button type="button" key={e} className="chip-say" onClick={() => runRef.current(e)}>{e}</button>
              ))}
            </div>
            <p className="talk-note">
              {isNative()
                ? 'Your words turn into text on this phone when it can, else through Google. Reminders ring on this phone. Your plans stay on this phone.'
                : supported
                  ? 'Your words turn into text through Google. Your plans stay on this phone.'
                  : 'This browser cannot listen. Typing works, also offline.'}
            </p>
          </div>
        </div>

        {talk.messages.map((m, i) =>
          m.from === 'me' ? (
            <div className="bubble-row me" key={m.id}>
              <p className="bubble me-b">{m.text}</p>
            </div>
          ) : (
            <div className="bubble-row" key={m.id}>
              <Mascot mood={m.mood ?? 'idle'} size={40} pad={10} still={i !== last} />
              <div className="bubble seed-b">
                <p>{m.text}</p>
                {m.actions && m.actions.length > 0 && (
                  <div className={m.actions[0].kind === 'say' ? 'chips' : 'btn-row'}>
                    {m.actions.map((a, j) =>
                      a.kind === 'calendar' ? (
                        <a key={j} className="btn btn-sm btn-primary" href={a.url} target="_blank" rel="noopener noreferrer">Save in Calendar</a>
                      ) : a.kind === 'say' ? (
                        <button type="button" key={j} className="chip-say" onClick={() => act(a)}>{a.text}</button>
                      ) : (
                        <button type="button" key={j} className={'btn btn-sm' + (j === 0 ? ' btn-primary' : '')} onClick={() => act(a)}>
                          {a.kind === 'go' ? a.label : a.kind === 'park' ? 'Park it in Ideas' : a.kind === 'exactSettings' ? 'Open settings' : 'Open Decide'}
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
            </div>
          ),
        )}

        {listening && (
          <div className="bubble-row me">
            <p className="bubble me-b listening">{heard || 'Listening…'}</p>
          </div>
        )}
        <div className="talk-end" ref={endRef} />
      </section>

      <form className="talk-bar" onSubmit={send}>
        <input
          className="field"
          id="talk-text"
          type="text"
          maxLength={200}
          autoComplete="off"
          placeholder={supported ? 'Type, or tap the mic' : 'Type what you need'}
          aria-label="Type what you need"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {text.trim() || !supported ? (
          <button type="submit" className="mic-btn" aria-label="Send" disabled={!text.trim()}>
            <Icon name="send" size={24} width={2.2} />
          </button>
        ) : (
          <button type="button" className={'mic-btn' + (listening ? ' on' : '')} aria-label={listening ? 'Stop listening' : 'Speak'} aria-pressed={listening} onClick={mic}>
            <Icon name={listening ? 'stop' : 'mic'} size={24} width={2} />
          </button>
        )}
      </form>
    </>
  );
}
