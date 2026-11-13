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
