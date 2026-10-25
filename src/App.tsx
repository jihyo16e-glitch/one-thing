import { useEffect, useRef, type ReactElement } from 'react';
import { lockStatus, stopLock } from './app/focusLock';
import { canTrackPhone, startBubble } from './app/screenTime';
import { PUSHED, useApp, type Tab } from './app/AppContext';
import { PhoneScreen, bubbleConfig } from './screens/PhoneScreen';
import { TabBar } from './ui/TabBar';
import { TodayScreen } from './screens/TodayScreen';
import { PlanScreen } from './screens/PlanScreen';
import { DecideScreen } from './screens/DecideScreen';
import { GoalsScreen } from './screens/GoalsScreen';
import { IdeasScreen } from './screens/IdeasScreen';
import { FocusStartScreen } from './screens/FocusStartScreen';
import { FocusOverlay } from './screens/FocusOverlay';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { TalkScreen } from './screens/TalkScreen';
import { Icon } from './ui/Icon';
import { ScrollThumb } from './ui/ScrollThumb';
import { Mascot } from './ui/Mascot';
import { CrashNotice } from './ui/CrashNotice';

const SCREENS: Record<Tab, () => ReactElement> = {
  today: () => <TodayScreen />,
  plan: () => <PlanScreen />,
  decide: () => <DecideScreen />,
  goals: () => <GoalsScreen />,
  ideas: () => <IdeasScreen />,
  focusStart: () => <FocusStartScreen />,
  talk: () => <TalkScreen />,
  phone: () => <PhoneScreen />,
};

export default function App() {
  const { data, tab, go, enter, mainRef, toastMsg, toastOn, cheerKey, focus } = useApp();
  // The focus session is kept on the phone, so after a restart the focus screen (with Stop) comes back and
  // the lock may keep running. A lock with no session on screen is released: the user must never get stuck.
  const restoredRunning = useRef(!!focus && !focus.timeUp);
  useEffect(() => {
    lockStatus().then((s) => { if (s.running && !restoredRunning.current) stopLock(); });
  }, []);
  // The floating bubble keeps its own copy of the settings (it runs when the app is closed). Send it the
  // latest on start (this also brings it back after a phone restart) and whenever they change.
  const bubble = bubbleConfig(data);
  const bubbleKey = data.settings.phone.bubble ? JSON.stringify(bubble) : '';
  useEffect(() => {
    if (bubbleKey && canTrackPhone()) startBubble(JSON.parse(bubbleKey));
  }, [bubbleKey]);

  const welcome = !data.settings.welcomeDone;
  const fab = !welcome && tab === 'today'; // the mic button lives on Today, the home screen
  return (
    <>
      <div className="app" id="app">
        <main className={'screen' + (enter ? ' enter' : '') + (fab ? ' has-fab' : '')} id="screen" tabIndex={-1} aria-live="off" ref={mainRef}>
          {welcome ? <WelcomeScreen /> : SCREENS[tab]()}
        </main>
        <ScrollThumb target={mainRef} />
        {fab && (
          <button type="button" className="talk-fab" aria-label="Talk: speak or type what you need" onClick={() => go('talk')}>
            <Icon name="mic" size={26} width={2} />
          </button>
        )}
        {!welcome && <TabBar current={PUSHED.includes(tab) ? 'today' : tab} onGo={go} />}
      </div>
      <FocusOverlay />
      {cheerKey > 0 && (
        <div className="cheer" key={cheerKey}>
          <Mascot mood="happy" size={120} />
        </div>
      )}
      <CrashNotice />
      <p className={'toast' + (toastOn ? ' show' : '')} id="toast" role="status" aria-live="polite">{toastMsg}</p>
    </>
  );
}
