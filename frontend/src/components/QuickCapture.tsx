import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

interface Board {
  id: number;
  name: string;
}

interface Column {
  id: number;
  name: string;
}

interface QuickCaptureProps {
  boards: Board[];
  onTaskCaptured: () => void;
}

export const QuickCapture: React.FC<QuickCaptureProps> = ({ boards, onTaskCaptured }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [selectedColId, setSelectedColId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Listen globally for Alt + Q or Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Set default board when modal opens
  useEffect(() => {
    if (isOpen && boards.length > 0 && selectedBoardId === null) {
      setSelectedBoardId(boards[0].id);
    }
  }, [isOpen, boards, selectedBoardId]);

  // Load columns dynamically when selected board changes
  useEffect(() => {
    const loadColumns = async () => {
      if (!selectedBoardId) return;
      try {
        const boardData = await api.getBoardDetail(selectedBoardId);
        setColumns(boardData.columns || []);
        if (boardData.columns && boardData.columns.length > 0) {
          setSelectedColId(boardData.columns[0].id);
        } else {
          setSelectedColId(null);
        }
      } catch (err) {
        console.error("Failed to load columns for quick capture:", err);
      }
    };

    loadColumns();
  }, [selectedBoardId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !selectedColId) return;
    setLoading(true);

    try {
      await api.createTask(selectedColId, {
        title,
        description: description || undefined,
        priority: 'medium',
      });
      
      // Reset forms and close
      setTitle('');
      setDescription('');
      setIsOpen(false);
      
      // Trigger update
      onTaskCaptured();
    } catch (err: any) {
      alert(err.message || 'Error al capturar la tarea');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <div style={styles.floatingTrigger} onClick={() => setIsOpen(true)} title="Captura Rápida (Alt+Q)">
        ⚡
      </div>
    );
  }

  return (
    <div style={styles.overlay} onClick={() => setIsOpen(false)}>
      <div
        className="glass-panel animate-fade-in"
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.header}>
          <div style={styles.titleWrapper}>
            <span style={styles.icon}>⚡</span>
            <h3 style={styles.title}>Captura Rápida</h3>
          </div>
          <span style={styles.shortcutHint}>[Esc para cerrar]</span>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="text"
            className="glass-input"
            style={styles.inputTitle}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="¿Qué tienes en mente?..."
            autoFocus
            required
          />

          <textarea
            className="glass-input"
            style={styles.inputDesc}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Añade una descripción (opcional)..."
          />

          <div style={styles.row}>
            <div style={styles.selectGroup}>
              <label style={styles.label}>Tablero</label>
              <select
                className="glass-input"
                style={styles.select}
                value={selectedBoardId || ''}
                onChange={(e) => setSelectedBoardId(Number(e.target.value))}
              >
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.selectGroup}>
              <label style={styles.label}>Columna / Estado</label>
              <select
                className="glass-input"
                style={styles.select}
                value={selectedColId || ''}
                onChange={(e) => setSelectedColId(Number(e.target.value))}
                disabled={columns.length === 0}
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                {columns.length === 0 && <option>Sin columnas</option>}
              </select>
            </div>
          </div>

          <div style={styles.actions}>
            <button type="submit" className="glass-button" disabled={loading || !selectedColId}>
              {loading ? 'Guardando...' : 'Capturar'}
            </button>
            <button
              type="button"
              className="glass-button glass-button-secondary"
              onClick={() => setIsOpen(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  floatingTrigger: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    width: '46px',
    height: '46px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--accent-secondary), var(--accent-primary))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    color: '#ffffff',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(168, 85, 247, 0.4)',
    transition: 'var(--transition-smooth)',
    zIndex: 999,
  },
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(5px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1001,
  },
  modal: {
    width: '90%',
    maxWidth: '520px',
    padding: '24px 30px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  titleWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  icon: {
    fontSize: '18px',
    color: 'var(--accent-warning)',
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
  },
  shortcutHint: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  inputTitle: {
    width: '100%',
    fontSize: '15px',
    fontWeight: 500,
    borderBottomColor: 'rgba(255, 255, 255, 0.15)',
  },
  inputDesc: {
    width: '100%',
    height: '80px',
    resize: 'none',
    fontSize: '13px',
  },
  row: {
    display: 'flex',
    gap: '16px',
  },
  selectGroup: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
  },
  select: {
    width: '100%',
    fontSize: '13px',
    padding: '8px 12px',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '6px',
  },
};
