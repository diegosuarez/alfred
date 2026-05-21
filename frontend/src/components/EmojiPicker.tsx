import React, { useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface EmojiPickerProps {
  current?: string | null;
  onSelect: (emoji: string) => void;
  onClear: () => void;
  onClose: () => void;
  style?: React.CSSProperties;
}

// Curated grid of common emojis. Kept short on purpose — the user can
// always paste anything in the input below.
const PRESETS: string[] = [
  '📁', '📂', '🗂️', '📋', '📌', '📍', '🏷️', '🔖',
  '📝', '✏️', '✍️', '📒', '📓', '📔', '📕', '📗',
  '📘', '📙', '📚', '🧾', '📊', '📈', '📉', '🗒️',
  '🎯', '🏆', '🚀', '🔥', '⭐', '✨', '💡', '🔧',
  '🛠️', '⚙️', '🧰', '🔨', '🪛', '💼', '🎒', '🧳',
  '🏠', '🏢', '🏗️', '🏛️', '🏟️', '🏝️', '🌳', '🌱',
  '💰', '💳', '🧮', '📞', '📱', '💻', '🖥️', '🖨️',
  '🎨', '🎬', '🎮', '🎵', '🎧', '📷', '🎤', '🎸',
  '🍎', '🥗', '☕', '🍵', '🍰', '🍕', '🍔', '🥑',
  '🐶', '🐱', '🦊', '🐼', '🦁', '🦄', '🐝', '🐢',
];

export const EmojiPicker: React.FC<EmojiPickerProps> = ({
  current,
  onSelect,
  onClear,
  onClose,
  style,
}) => {
  const [draft, setDraft] = useState('');
  useEscapeKey(onClose);

  return (
    <div
      className="glass-panel"
      style={{ ...styles.panel, ...(style || {}) }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={styles.header}>
        <span style={styles.title}>Elige un icono</span>
        <button
          type="button"
          style={styles.closeBtn}
          onClick={onClose}
          title="Cerrar"
        >
          ✕
        </button>
      </div>
      <div style={styles.grid}>
        {PRESETS.map((e) => (
          <button
            key={e}
            type="button"
            style={{
              ...styles.cell,
              ...(current === e ? styles.cellActive : {}),
            }}
            onClick={() => onSelect(e)}
            title={e}
          >
            {e}
          </button>
        ))}
      </div>
      <div style={styles.customRow}>
        <input
          type="text"
          className="glass-input"
          style={styles.input}
          placeholder="Pega tu emoji…"
          value={draft}
          maxLength={16}
          onChange={(ev) => setDraft(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter' && draft.trim()) {
              onSelect(draft.trim());
            }
          }}
        />
        <button
          type="button"
          className="glass-button"
          style={styles.applyBtn}
          disabled={!draft.trim()}
          onClick={() => draft.trim() && onSelect(draft.trim())}
        >
          OK
        </button>
      </div>
      <button
        type="button"
        className="glass-button-secondary"
        style={styles.clearBtn}
        onClick={onClear}
      >
        Restablecer por defecto
      </button>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    zIndex: 60,
    padding: '12px',
    width: '280px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '14px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(8, 1fr)',
    gap: '4px',
  },
  cell: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid transparent',
    borderRadius: '6px',
    fontSize: '18px',
    padding: '4px 0',
    cursor: 'pointer',
    transition: 'var(--transition-smooth)',
  },
  cellActive: {
    borderColor: 'var(--primary)',
    background: 'rgba(99,102,241,0.18)',
  },
  customRow: {
    display: 'flex',
    gap: '6px',
  },
  input: {
    flex: 1,
    padding: '6px 8px',
    fontSize: '14px',
  },
  applyBtn: {
    padding: '4px 12px',
    fontSize: '12px',
  },
  clearBtn: {
    fontSize: '12px',
    padding: '6px 10px',
  },
};
