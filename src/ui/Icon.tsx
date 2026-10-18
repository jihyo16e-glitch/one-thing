import type { ReactElement } from 'react';

export type IconName =
  | 'today' | 'plan' | 'decide' | 'goals' | 'ideas'
  | 'check' | 'plus' | 'play' | 'back' | 'trash' | 'lock' | 'list' | 'info' | 'sliders' | 'edit'
  | 'mic' | 'send' | 'stop';

// Same stroke paths as the gate 4 prototype. Decorative only (aria-hidden).
const PATHS: Record<IconName, ReactElement> = {
  today: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
    </>
  ),
  plan: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  decide: <path d="M12 21.5V12M12 12L5.5 5.5M12 12l6.5-6.5M5.5 5.5h4M5.5 5.5v4M18.5 5.5h-4M18.5 5.5v4" />,
  goals: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  ideas: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.1V16h5v-.1c0-.8.4-1.6 1.1-2.1A6 6 0 0 0 12 3z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  play: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10 8.8v6.4l5-3.2z" />
    </>
  ),
  back: <path d="M15 5l-7 7 7 7" />,
  trash: <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  list: <path d="M4 6h16M4 12h16M4 18h10" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16.5v.5" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </>
  ),
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4" />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </>
  ),
  send: <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />,
  stop: <rect x="7" y="7" width="10" height="10" rx="2" />,
};

export function Icon({ name, size = 24, width = 1.8 }: { name: IconName; size?: number; width?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </svg>
  );
}
