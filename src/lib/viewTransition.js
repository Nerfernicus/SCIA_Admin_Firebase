import { flushSync } from 'react-dom';

// Shared element transition: the clicked row grows into the detail panel that opens.
// The row and the panel share the name "id-detail" (only ever on one element at a time).
// Browsers without View Transitions, and reduced-motion users, just get the plain open.
export function openWithTransition(sourceEl, update) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduce || !sourceEl) { update(); return; }
  sourceEl.style.viewTransitionName = 'id-detail';
  const vt = document.startViewTransition(() => {
    flushSync(update);
    sourceEl.style.viewTransitionName = ''; // the panel now owns the name
  });
  vt.finished.finally(() => { sourceEl.style.viewTransitionName = ''; });
}

// Origin-aware modals: remember where the last click or tap happened (CSS variables --ox/--oy),
// so a panel can grow out of the button that opened it instead of out of the screen centre.
// Keyboard activation has no pointer position, so it uses the centre of the focused control.
if (typeof document !== 'undefined') {
  const root = document.documentElement;
  const setOrigin = (x, y) => {
    root.style.setProperty('--ox', `${Math.round(x)}px`);
    root.style.setProperty('--oy', `${Math.round(y)}px`);
  };
  document.addEventListener('pointerdown', (e) => setOrigin(e.clientX, e.clientY), { capture: true, passive: true });
  document.addEventListener('click', (e) => {
    if (e.detail !== 0 || !(e.target instanceof Element)) return;
    const r = e.target.getBoundingClientRect();
    setOrigin(r.left + r.width / 2, r.top + r.height / 2);
  }, { capture: true, passive: true });
}4