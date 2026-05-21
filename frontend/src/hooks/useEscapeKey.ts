import { useEffect } from 'react';

/** Run `handler` whenever the user presses Escape. Skip when `enabled`
 *  is false (handy for modals gated by a boolean state). The listener
 *  is registered on `document` so it fires regardless of which element
 *  has focus inside the dialog.
 */
export function useEscapeKey(handler: () => void, enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handler();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handler, enabled]);
}
