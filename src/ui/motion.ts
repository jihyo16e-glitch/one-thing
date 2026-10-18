// Motion helpers (2026-10-18, "calm and premium"). Built-in browser features only, no library:
// - withTransition: Chrome's View Transitions API slides the screen forward / back (styles.css, "vt-").
// - popOnce: a one-time spring on a tick button.
// - buzz: a very short phone vibration on a tick (Android Chrome; a no-op elsewhere).
// Everything is skipped when the phone asks for reduced motion.
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { flushSync } from 'react-dom';

export type Direction = 'forward' | 'back';

type ViewTransitionDoc = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };

let pending: (() => void)[] | null = null; // work to run right after the next transition's DOM update

export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** Run a state update inside a view transition that slides the screen in the given direction. */
export function withTransition(update: () => void, dir: Direction): void {
  const doc = document as ViewTransitionDoc;
  if (!doc.startViewTransition || reducedMotion() || pending) {
    update();
    return;
  }
  const root = document.documentElement;
  root.dataset.vt = dir;
  pending = [];
  const t = doc.startViewTransition(() => {
    flushSync(update);
    const after = pending ?? [];
    pending = null;
    after.forEach((fn) => fn());
  });
  t.finished.finally(() => {
    if (root.dataset.vt === dir) delete root.dataset.vt;
  });
}

/** Run fn after the DOM update of a transition that is starting, or now when there is none (e.g. scroll to top). */
export function afterUpdate(fn: () => void): void {
  if (pending) pending.push(fn);
  else fn();
}

/** Replay the "pop" spring on an element (styles.css .pop). */
export function popOnce(el: HTMLElement | null): void {
  if (!el || reducedMotion()) return;
  el.classList.remove('pop');
  void el.offsetWidth; // restart the animation
  el.classList.add('pop');
  el.addEventListener('animationend', () => el.classList.remove('pop'), { once: true });
}

/**
 * FLIP (app-mobile-tasks card): children marked data-flip="<id>" glide from where they were to where
 * they are now whenever `key` changes (a task added, deleted or opened for editing). Positions are
 * measured from the container, so scrolling never counts as a move.
 */
export function useFlip(container: RefObject<HTMLElement>, key: string): void {
  const last = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const box = container.current;
    if (!box) return;
    const base = box.getBoundingClientRect().top;
    const now = new Map<string, number>();
    const nodes = new Map<string, HTMLElement>();
    box.querySelectorAll<HTMLElement>('[data-flip]').forEach((n) => {
      const id = n.dataset.flip ?? '';
      now.set(id, n.getBoundingClientRect().top - base);
      nodes.set(id, n);
    });
    if (!reducedMotion()) {
      now.forEach((top, id) => {
        const old = last.current.get(id);
        if (old === undefined || Math.abs(old - top) < 1) return;
        nodes.get(id)?.animate([{ transform: 'translateY(' + (old - top) + 'px)' }, { transform: 'none' }], {
          duration: 560,
          easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
        });
      });
    }
    last.current = now;
  }, [container, key]);
}

export function buzz(ms = 10): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not allowed here: no buzz */
  }
}
