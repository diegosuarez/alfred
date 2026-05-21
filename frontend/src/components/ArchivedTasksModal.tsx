import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

interface ArchivedTask {
  id: number;
  title: string;
  description?: string;
  priority: string;
  archived_at?: string | null;
  children?: ArchivedTask[];
}

interface ArchivedTasksModalProps {
  columnId: number;
  columnName: string;
  onClose: () => void;
  onChanged: () => void;
}

export const ArchivedTasksModal: React.FC<ArchivedTasksModalProps> = ({
  columnId,
  columnName,
  onClose,
  onChanged,
}) => {
  const [tasks, setTasks] = useState<ArchivedTask[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      setTasks(await api.getArchivedInColumn(columnId));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, columnId]);

  const handleRestore = async (taskId: number) => {
    try {
      await api.updateTask(taskId, { archived: false });
      await load();
      onChanged();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (taskId: number, title: string) => {
    if (!confirm(`¿Borrar "${title}" definitivamente?`)) return;
    try {
      await api.deleteTask(taskId);
      await load();
      onChanged();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div
        className="glass-panel animate-fade-in"
        style={styles.panel}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Archivadas</h2>
            <div style={styles.subtitle}>{columnName}</div>
          </div>
          <button style={styles.closeBtn} onClick={onClose} title="Cerrar">
            ✕
          </button>
        </div>

        {loading ? (
          <p style={styles.muted}>Cargando...</p>
        ) : tasks.length === 0 ? (
          <p style={styles.muted}>No hay tareas archivadas en esta lista.</p>
        ) : (
          <ul style={styles.list}>
            {tasks.map((t) => (
              <li key={t.id} className="glass-card" style={styles.row}>
                <div style={styles.body}>
                  <div style={styles.taskTitle}>{t.title}</div>
                  {t.description && (
                    <p style={styles.taskDesc}>{t.description}</p>
                  )}
                  <div style={styles.meta}>
                    Archivada{' '}
                    {t.archived_at
                      ? new Date(t.archived_at).toLocaleString('es-ES')
                      : ''}
                    {t.children && t.children.length > 0 && (
                      <span style={styles.childCount}>
                        · {t.children.length} subtarea
                        {t.children.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                </div>
                <div style={styles.actions}>
                  <button
                    type="button"
                    className="glass-button glass-button-secondary"
                    style={styles.actionBtn}
                    onClick={() => handleRestore(t.id)}
                    title="Restaurar"
                  >
                    ↩ Restaurar
                  </button>
                  <button
                    type="button"
                    className="glass-button glass-button-danger"
                    style={styles.actionBtn}
                    onClick={() => handleDelete(t.id, t.title)}
                    title="Borrar definitivamente"
                  >
                    🗑️
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
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
    alignItems: 'flex-start',
    marginBottom: '16px',
  },
  title: { fontSize: '18px', fontWeight: 600 },
  subtitle: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    marginTop: '2px',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: '16px',
    cursor: 'pointer',
  },
  muted: {
    color: 'var(--text-muted)',
    fontSize: '13px',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 14px',
    opacity: 0.85,
  },
  body: { flex: 1, minWidth: 0 },
  taskTitle: {
    fontSize: '14px',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  taskDesc: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    marginTop: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  meta: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginTop: '4px',
  },
  childCount: {
    marginLeft: '4px',
  },
  actions: {
    display: 'flex',
    gap: '6px',
    flexShrink: 0,
  },
  actionBtn: {
    padding: '6px 12px',
    fontSize: '11px',
  },
};
