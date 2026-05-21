import React, { useState } from 'react';
import { ContactPicker, type Contact } from './ContactPicker';
import { useEscapeKey } from '../hooks/useEscapeKey';

export interface Filters {
  query: string;
  tagIds: number[];
  requesterId: number | null;
  assigneeIds: number[];
  createdFrom: string | null; // YYYY-MM-DD
  createdTo: string | null;
  dueFrom: string | null;
  dueTo: string | null;
}

export const EMPTY_FILTERS: Filters = {
  query: '',
  tagIds: [],
  requesterId: null,
  assigneeIds: [],
  createdFrom: null,
  createdTo: null,
  dueFrom: null,
  dueTo: null,
};

interface Tag {
  id: number;
  name: string;
  color?: string | null;
}

interface FilterModalProps {
  filters: Filters;
  onClose: () => void;
  onApply: (next: Filters) => void;
  tags: Tag[];
  contacts: Contact[];
}

export const FilterModal: React.FC<FilterModalProps> = ({
  filters,
  onClose,
  onApply,
  tags,
  contacts,
}) => {
  // Local draft so the user can iterate before applying.
  const [draft, setDraft] = useState<Filters>({ ...filters });
  useEscapeKey(onClose);

  const toggleTag = (id: number) => {
    setDraft((d) => ({
      ...d,
      tagIds: d.tagIds.includes(id)
        ? d.tagIds.filter((t) => t !== id)
        : [...d.tagIds, id],
    }));
  };

  const clearAll = () => setDraft({ ...EMPTY_FILTERS, query: draft.query });

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div
        className="glass-panel animate-fade-in"
        style={styles.panel}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.header}>
          <h2 style={styles.title}>Filtros</h2>
          <button style={styles.closeBtn} onClick={onClose} title="Cerrar">
            ✕
          </button>
        </div>

        <section style={styles.section}>
          <label style={styles.label}>Etiquetas</label>
          {tags.length === 0 ? (
            <p style={styles.muted}>Sin etiquetas todavía.</p>
          ) : (
            <div style={styles.tagRow}>
              {tags.map((t) => {
                const active = draft.tagIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    className="glass-button-secondary"
                    style={{
                      ...styles.tagPill,
                      ...(active ? styles.tagPillActive : {}),
                      ...(t.color && !active ? { borderColor: t.color } : {}),
                    }}
                    onClick={() => toggleTag(t.id)}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section style={styles.section}>
          <div style={styles.twoCol}>
            <div style={styles.col}>
              <label style={styles.label}>Encargada por</label>
              <ContactPicker
                contacts={contacts}
                value={draft.requesterId}
                onChange={(id) => setDraft((d) => ({ ...d, requesterId: id }))}
                placeholder="Cualquiera"
              />
            </div>
            <div style={styles.col}>
              <label style={styles.label}>Asignado a</label>
              <ContactPicker
                multi
                contacts={contacts}
                value={draft.assigneeIds}
                onChange={(ids) =>
                  setDraft((d) => ({ ...d, assigneeIds: ids }))
                }
                placeholder="Cualquiera"
              />
            </div>
          </div>
        </section>

        <section style={styles.section}>
          <label style={styles.label}>Fecha de creación</label>
          <div style={styles.dateRow}>
            <input
              type="date"
              className="glass-input"
              style={styles.dateInput}
              value={draft.createdFrom ?? ''}
              onChange={(e) =>
                setDraft((d) => ({ ...d, createdFrom: e.target.value || null }))
              }
            />
            <span style={styles.dateDash}>—</span>
            <input
              type="date"
              className="glass-input"
              style={styles.dateInput}
              value={draft.createdTo ?? ''}
              onChange={(e) =>
                setDraft((d) => ({ ...d, createdTo: e.target.value || null }))
              }
            />
          </div>
        </section>

        <section style={styles.section}>
          <label style={styles.label}>Fecha de vencimiento</label>
          <div style={styles.dateRow}>
            <input
              type="date"
              className="glass-input"
              style={styles.dateInput}
              value={draft.dueFrom ?? ''}
              onChange={(e) =>
                setDraft((d) => ({ ...d, dueFrom: e.target.value || null }))
              }
            />
            <span style={styles.dateDash}>—</span>
            <input
              type="date"
              className="glass-input"
              style={styles.dateInput}
              value={draft.dueTo ?? ''}
              onChange={(e) =>
                setDraft((d) => ({ ...d, dueTo: e.target.value || null }))
              }
            />
          </div>
        </section>

        <div style={styles.actions}>
          <button
            type="button"
            className="glass-button-secondary"
            style={styles.actionBtn}
            onClick={clearAll}
          >
            Limpiar
          </button>
          <button
            type="button"
            className="glass-button"
            style={styles.actionBtn}
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
  },
  panel: {
    width: '100%',
    maxWidth: '560px',
    maxHeight: '85vh',
    overflowY: 'auto',
    padding: '24px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  title: { fontSize: '18px', fontWeight: 600 },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: '16px',
    cursor: 'pointer',
  },
  section: { marginBottom: '18px' },
  label: {
    display: 'block',
    fontSize: '12px',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '8px',
  },
  muted: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  tagPill: {
    padding: '4px 12px',
    fontSize: '12px',
    borderRadius: '999px',
  },
  tagPillActive: {
    background: 'rgba(99,102,241,0.18)',
    borderColor: 'rgba(99,102,241,0.45)',
    color: '#ffffff',
  },
  twoCol: { display: 'flex', gap: '12px' },
  col: { flex: 1, minWidth: 0 },
  dateRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  dateInput: {
    flex: 1,
    padding: '8px 10px',
    fontSize: '13px',
  },
  dateDash: { color: 'var(--text-muted)' },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '8px',
  },
  actionBtn: {
    padding: '10px 18px',
    fontSize: '13px',
  },
};
