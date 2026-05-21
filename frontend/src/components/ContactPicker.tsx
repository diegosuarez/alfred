import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from './Avatar';

export interface Contact {
  id: number;
  name: string;
  email?: string | null;
  image_url?: string | null;
  is_favorite: boolean;
  is_self?: boolean;
}

interface BaseProps {
  contacts: Contact[];
  placeholder?: string;
}

interface SingleProps extends BaseProps {
  multi?: false;
  value: number | null;
  onChange: (id: number | null) => void;
}

interface MultiProps extends BaseProps {
  multi: true;
  value: number[];
  onChange: (ids: number[]) => void;
}

type Props = SingleProps | MultiProps;

/** A dropdown picker for contacts. Favourites surface first; a search
 * input filters by name / email. Single-select shows the picked contact
 * as a chip; multi-select shows each picked contact as a removable chip. */
export const ContactPicker: React.FC<Props> = (props) => {
  const { contacts, placeholder = 'Seleccionar...' } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const selectedIds: number[] = props.multi
    ? (props as MultiProps).value
    : (props as SingleProps).value !== null
    ? [(props as SingleProps).value as number]
    : [];

  const selectedContacts = useMemo(
    () => selectedIds.map((id) => contacts.find((c) => c.id === id)).filter(Boolean) as Contact[],
    [selectedIds, contacts],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q),
    );
  }, [contacts, query]);

  const togglePick = (id: number) => {
    if (props.multi) {
      const next = selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id];
      props.onChange(next);
    } else {
      props.onChange((props as SingleProps).value === id ? null : id);
      setOpen(false);
    }
  };

  const clear = () => {
    if (props.multi) props.onChange([]);
    else props.onChange(null);
  };

  return (
    <div ref={rootRef} style={styles.root}>
      <div
        style={styles.trigger}
        className="glass-input"
        onClick={() => setOpen((o) => !o)}
      >
        {selectedContacts.length === 0 ? (
          <span style={styles.placeholder}>{placeholder}</span>
        ) : (
          <div style={styles.chipRow}>
            {selectedContacts.map((c) => (
              <span
                key={c.id}
                style={styles.chip}
                onClick={(e) => {
                  e.stopPropagation();
                  if (props.multi) togglePick(c.id);
                  else clear();
                }}
                title="Quitar"
              >
                <Avatar name={c.name} imageUrl={c.image_url} size={20} />
                <span style={styles.chipName}>{c.name}</span>
                <span style={styles.chipRemove}>✕</span>
              </span>
            ))}
          </div>
        )}
        <span style={styles.caret}>▾</span>
      </div>

      {open && (
        <div className="glass-panel" style={styles.menu}>
          <input
            type="text"
            className="glass-input"
            placeholder="Buscar por nombre o email..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={styles.searchInput}
            autoFocus
          />
          {filtered.length === 0 ? (
            <div style={styles.empty}>Sin contactos.</div>
          ) : (
            <ul style={styles.list}>
              {filtered.map((c) => {
                const picked = selectedIds.includes(c.id);
                return (
                  <li
                    key={c.id}
                    style={{
                      ...styles.option,
                      ...(picked ? styles.optionPicked : {}),
                    }}
                    onClick={() => togglePick(c.id)}
                  >
                    <Avatar name={c.name} imageUrl={c.image_url} size={28} />
                    <div style={styles.optionText}>
                      <span style={styles.optionName}>
                        {c.is_favorite && <span style={styles.star}>★</span>}
                        {c.name}
                      </span>
                      {c.email && <span style={styles.optionEmail}>{c.email}</span>}
                    </div>
                    {picked && <span style={styles.tick}>✓</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'relative',
    width: '100%',
  },
  trigger: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    cursor: 'pointer',
    minHeight: '40px',
    padding: '8px 12px',
  },
  placeholder: {
    color: 'var(--text-muted)',
    fontSize: '13px',
  },
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    flex: 1,
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '3px 8px 3px 3px',
    background: 'rgba(99,102,241,0.18)',
    border: '1px solid rgba(99,102,241,0.45)',
    borderRadius: '999px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  chipName: {
    color: '#ffffff',
  },
  chipRemove: {
    color: 'var(--text-muted)',
    fontSize: '10px',
  },
  caret: {
    color: 'var(--text-muted)',
    fontSize: '10px',
  },
  menu: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    right: 0,
    zIndex: 1200,
    maxHeight: '320px',
    padding: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  searchInput: {
    padding: '8px 10px',
    fontSize: '12px',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    overflowY: 'auto',
    maxHeight: '240px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  option: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '6px 10px',
    borderRadius: 'var(--border-radius-sm)',
    cursor: 'pointer',
  },
  optionPicked: {
    background: 'rgba(99,102,241,0.15)',
  },
  optionText: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
  },
  optionName: {
    fontSize: '13px',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  optionEmail: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  star: {
    color: '#f59e0b',
    marginRight: '6px',
    fontSize: '11px',
  },
  tick: {
    color: 'var(--accent-primary)',
    fontWeight: 600,
  },
  empty: {
    padding: '12px',
    fontSize: '12px',
    color: 'var(--text-muted)',
    textAlign: 'center',
    fontStyle: 'italic',
  },
};
