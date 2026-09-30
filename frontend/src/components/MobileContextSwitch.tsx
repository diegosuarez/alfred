import { useRef } from 'react';
import type { CSSProperties, TouchEvent } from 'react';

interface Props {
  contexts: { id: number; name: string; color?: string | null }[];
  activeContextId: number | null;
  onSelect: (id: number) => void;
}

export function MobileContextSwitch({ contexts, activeContextId, onSelect }: Props) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const lastSwipeAt = useRef(0);

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStart.current = event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || event.changedTouches.length !== 1) return;

    const deltaX = event.changedTouches[0].clientX - start.x;
    const deltaY = event.changedTouches[0].clientY - start.y;
    if (Math.abs(deltaX) < 40 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;

    // A left swipe selects Personal; a right swipe selects Trabajo.
    const target = contexts[deltaX < 0 ? 1 : 0];
    if (!target) return;
    lastSwipeAt.current = Date.now();
    onSelect(target.id);
  };

  return (
    <div
      className="mobile-context-switch"
      role="group"
      aria-label="Contexto de trabajo"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => { touchStart.current = null; }}
    >
      {contexts.map((context) => (
        <button
          key={context.id}
          type="button"
          aria-pressed={activeContextId === context.id}
          onClick={() => {
            // Touch browsers may synthesize a click after a completed swipe.
            if (Date.now() - lastSwipeAt.current > 350) onSelect(context.id);
          }}
          style={{ '--context-color': context.color || 'var(--accent-primary)' } as CSSProperties}
        >
          {context.name.trim().toLocaleLowerCase('es') === 'trabajo' ? 'Trabajo' : 'Personal'}
        </button>
      ))}
    </div>
  );
}
