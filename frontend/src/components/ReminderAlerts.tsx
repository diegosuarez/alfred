import React from 'react';

export interface FiredReminder {
  reminderId: number;
  taskId: number;
  taskTitle: string;
  remindAt: string; // ISO
}

interface ReminderAlertsProps {
  fired: FiredReminder[];
  onDismiss: (reminderId: number) => void;
  onOpenTask: (taskId: number) => void;
}

/** A stack of fired reminders sitting at the top-right of the viewport.
 * Each card shows the task title and the "scheduled at" time; dismissing
 * a card removes the reminder server-side via onDismiss. */
export const ReminderAlerts: React.FC<ReminderAlertsProps> = ({
  fired,
  onDismiss,
  onOpenTask,
}) => {
  if (fired.length === 0) return null;
  return (
    <div style={styles.stack}>
      {fired.map((f) => (
        <div key={f.reminderId} className="glass-panel animate-fade-in" style={styles.card}>
          <div style={styles.header}>
            <span style={styles.bell}>🔔</span>
            <span style={styles.title}>Recordatorio</span>
            <button
              style={styles.closeBtn}
              onClick={() => onDismiss(f.reminderId)}
              title="Marcar como visto"
            >
              ✕
            </button>
          </div>
          <div
            style={styles.taskTitle}
            onClick={() => {
              onOpenTask(f.taskId);
              onDismiss(f.reminderId);
            }}
            title="Abrir tarea"
          >
            {f.taskTitle}
          </div>
          <div style={styles.when}>
            {new Date(f.remindAt).toLocaleString('es-ES', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
          <div style={styles.actions}>
            <button
              className="glass-button"
              style={styles.btn}
              onClick={() => onDismiss(f.reminderId)}
            >
              Visto
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  stack: {
    position: 'fixed',
    top: '24px',
    right: '24px',
    zIndex: 1300,
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxWidth: '340px',
  },
  card: {
    padding: '14px 16px',
    borderColor: 'rgba(245, 158, 11, 0.5)',
    boxShadow: '0 10px 30px rgba(245, 158, 11, 0.25)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  bell: { fontSize: '16px' },
  title: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--accent-warning)',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    flex: 1,
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '12px',
  },
  taskTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#ffffff',
    cursor: 'pointer',
    marginBottom: '4px',
  },
  when: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginBottom: '10px',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  btn: {
    padding: '6px 14px',
    fontSize: '12px',
  },
};
