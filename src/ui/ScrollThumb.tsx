import { useEffect, useRef, type RefObject } from 'react';

/**
 * A thin scroll bar that fades in only while the screen scrolls, then fades out (like iOS).
 * The browser's own scroll bar is hidden in styles.css (.screen). Positioned by transform, outside
 * React's render, so scrolling never re-renders the app.
 */
export function ScrollThumb({ target }: { target: RefObject<HTMLElement> }) {
  const thumb = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = target.current;
    const t = thumb.current;
    if (!el || !t) return;
    let timer: number | undefined;
    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight <= clientHeight + 1) {
        t.classList.remove('on');
        return;
      }
      const track = clientHeight - 8;
      const h = Math.max(32, (track * clientHeight) / scrollHeight);
      const y = el.offsetTop + 4 + ((track - h) * scrollTop) / (scrollHeight - clientHeight);
      t.style.height = h + 'px';
      t.style.transform = 'translateY(' + y + 'px)';
      t.classList.add('on');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => t.classList.remove('on'), 700);
    };
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      el.removeEventListener('scroll', update);
      window.clearTimeout(timer);
    };
  }, [target]);
  return <div className="scroll-thumb" ref={thumb} aria-hidden="true" />;
}
