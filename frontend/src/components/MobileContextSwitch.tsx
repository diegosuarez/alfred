import type { CSSProperties } from 'react';

interface Props {
  contexts: { id: number; name: string; color?: string | null }[];
  activeContextId: number | null;
  onSelect: (id: number) => void;
}

export function MobileContextSwitch({ contexts, activeContextId, onSelect }: Props) {
  return (
    <div className="mobile-context-switch" role="group" aria-label="Contexto de trabajo">
      {contexts.map((context) => (
        <button
          key={context.id}
          type="button"
          aria-pressed={activeContextId === context.id}
          onClick={() => onSelect(context.id)}
          style={{ '--context-color': context.color || 'var(--accent-primary)' } as CSSProperties}
        >
          {context.name.trim().toLocaleLowerCase('es') === 'trabajo' ? 'Trabajo' : 'Personal'}
        </button>
      ))}
    </div>
  );
}
