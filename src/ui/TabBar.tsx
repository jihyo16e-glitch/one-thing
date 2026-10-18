import type { Tab } from '../app/AppContext';
import { Icon, type IconName } from './Icon';

const TABS: { id: Exclude<Tab, 'focusStart' | 'talk'>; label: string; icon: IconName }[] = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'plan', label: 'Plan', icon: 'plan' },
  { id: 'decide', label: 'Decide', icon: 'decide' },
  { id: 'goals', label: 'Goals', icon: 'goals' },
  { id: 'ideas', label: 'Ideas', icon: 'ideas' },
];

export function TabBar({ current, onGo }: { current: Tab; onGo: (tab: Tab) => void }) {
  const index = Math.max(0, TABS.findIndex((t) => t.id === current));
  return (
    <nav className="tabbar" id="tabs" aria-label="Main">
      {/* the soft pill behind the active tab; it slides on a spring (styles.css .tab-pill) */}
      <span className="tab-pill" aria-hidden="true" style={{ transform: 'translateX(' + index * 100 + '%)' }} />
      {TABS.map((t) => (
        <button key={t.id} type="button" className="tab" aria-current={t.id === current ? 'page' : undefined} onClick={() => onGo(t.id)}>
          <Icon name={t.icon} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
