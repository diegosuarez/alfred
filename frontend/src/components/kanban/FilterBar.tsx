import React from 'react';
import { EMPTY_FILTERS, type Filters } from '../FilterModal';
import type { Contact } from '../ContactPicker';
import type { Tag } from './types';

interface FilterBarProps {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  allTags: Tag[];
  allContacts: Contact[];
  setShowFilterModal: (show: boolean) => void;
}

/** Search box + filter modal trigger + active-filter chip bar. */
export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  setFilters,
  allTags,
  allContacts,
  setShowFilterModal,
}) => {
  // Human-readable list of active filter chips. Each chip carries the
  // setter that removes it from the live filter set.
  const activeFilterChips = (): { key: string; label: string; clear: () => void }[] => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    for (const tid of filters.tagIds) {
      const t = allTags.find((x) => x.id === tid);
      chips.push({
        key: `tag-${tid}`,
        label: `etiqueta: ${t?.name ?? tid}`,
        clear: () =>
          setFilters((f) => ({ ...f, tagIds: f.tagIds.filter((x) => x !== tid) })),
      });
    }
    if (filters.requesterId !== null) {
      const c = allContacts.find((x) => x.id === filters.requesterId);
      chips.push({
        key: 'requester',
        label: `encargada por: ${c?.name ?? filters.requesterId}`,
        clear: () => setFilters((f) => ({ ...f, requesterId: null })),
      });
    }
    for (const aid of filters.assigneeIds) {
      const c = allContacts.find((x) => x.id === aid);
      chips.push({
        key: `assignee-${aid}`,
        label: `asignado a: ${c?.name ?? aid}`,
        clear: () =>
          setFilters((f) => ({
            ...f,
            assigneeIds: f.assigneeIds.filter((x) => x !== aid),
          })),
      });
    }
    if (filters.createdFrom) {
      chips.push({
        key: 'createdFrom',
        label: `creada ≥ ${filters.createdFrom}`,
        clear: () => setFilters((f) => ({ ...f, createdFrom: null })),
      });
    }
    if (filters.createdTo) {
      chips.push({
        key: 'createdTo',
        label: `creada ≤ ${filters.createdTo}`,
        clear: () => setFilters((f) => ({ ...f, createdTo: null })),
      });
    }
    if (filters.dueFrom) {
      chips.push({
        key: 'dueFrom',
        label: `vence ≥ ${filters.dueFrom}`,
        clear: () => setFilters((f) => ({ ...f, dueFrom: null })),
      });
    }
    if (filters.dueTo) {
      chips.push({
        key: 'dueTo',
        label: `vence ≤ ${filters.dueTo}`,
        clear: () => setFilters((f) => ({ ...f, dueTo: null })),
      });
    }
    return chips;
  };

  return (
    <div style={styles.filterBar}>
      <div style={styles.searchRow}>
        <input
          type="text"
          className="glass-input"
          style={styles.searchInput}
          placeholder="🔍 Buscar tareas..."
          value={filters.query}
          onChange={(e) =>
            setFilters((f) => ({ ...f, query: e.target.value }))
          }
        />
        <button
          type="button"
          className="glass-button-secondary"
          style={styles.filterTriggerBtn}
          onClick={() => setShowFilterModal(true)}
          title="Más filtros"
        >
          🎛 Filtros
        </button>
      </div>
      {(() => {
        const chips = activeFilterChips();
        if (chips.length === 0) return null;
        return (
          <div style={styles.activeFilterChips}>
            {chips.map((c) => (
              <span key={c.key} style={styles.activeFilterChip}>
                {c.label}
                <button
                  type="button"
                  style={styles.activeFilterChipClose}
                  onClick={c.clear}
                  title="Quitar filtro"
                >
                  ✕
                </button>
              </span>
            ))}
            <button
              type="button"
              style={styles.activeFilterClearAll}
              onClick={() => setFilters({ ...EMPTY_FILTERS, query: filters.query })}
              title="Limpiar todos"
            >
              Limpiar
            </button>
          </div>
        );
      })()}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  filterBar: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '16px',
  },
  searchRow: {
    display: 'flex',
    gap: '8px',
  },
  searchInput: {
    flex: 1,
    padding: '8px 12px',
    fontSize: '13px',
  },
  filterTriggerBtn: {
    padding: '8px 14px',
    fontSize: '12px',
    whiteSpace: 'nowrap',
  },
  activeFilterChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    alignItems: 'center',
  },
  activeFilterChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 4px 4px 10px',
    background: 'rgba(99,102,241,0.14)',
    border: '1px solid rgba(99,102,241,0.40)',
    borderRadius: '999px',
    fontSize: '11px',
    color: '#ffffff',
  },
  activeFilterChipClose: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '50%',
  },
  activeFilterClearAll: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '11px',
    fontStyle: 'italic',
    marginLeft: '4px',
    textDecoration: 'underline dotted',
  },
};
