import React, { useState } from 'react';

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
  onSnooze: (reminderId: number, taskId: number, isoUtc: string) => void;
}

/** A stack of fired reminders sitting at the top-right of the viewport.
 * Each card shows the task title, the "scheduled at" time, an "Aplazar"
 * dropdown (snooze — creates a new reminder + dismisses the current one)
 * and a "Visto" button. */
export const ReminderAlerts: React.FC<ReminderAlertsProps> = ({
  fired,
  onDismiss,
  onOpenTask,
  onSnooze,
}) => {
  if (fired.length === 0) return null;
  return (
    <div style={styles.stack}>
      {fired.map((f) => (
        <ReminderCard
          key={f.reminderId}
          fired={f}
          onDismiss={onDismiss}
          onOpenTask={onOpenTask}
          onSnooze={onSnooze}
        />
      ))}
    </div>
  );
};

const ReminderCard: React.FC<{
  fired: FiredReminder;
  onDismiss: (id: number) => void;
  onOpenTask: (id: number) => void;
  onSnooze: (id: number, taskId: number, isoUtc: string) => void;
}> = ({ fired, onDismiss, onOpenTask, onSnooze }) => {
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState(() => defaultCustomLocal());

  const fireSnooze = (when: Date) => {
    onSnooze(fired.reminderId, fired.taskId, when.toISOString());
    setSnoozeOpen(false);
    setCustomMode(false);
  };

  return (
    <div className="glass-panel animate-fade-in" style={styles.card}>
      <div style={styles.header}>
        <span style={styles.bell}>🔔</span>
        <span style={styles.title}>Recordatorio</span>
        <button
          style={styles.closeBtn}
          onClick={() => onDismiss(fired.reminderId)}
          title="Marcar como visto"
        >
          ✕
        </button>
      </div>
      <div
        style={styles.taskTitle}
        onClick={() => {
          onOpenTask(fired.taskId);
          onDismiss(fired.reminderId);
        }}
        title="Abrir tarea"
      >
        {fired.taskTitle}
      </div>
      <div style={styles.when}>
        {new Date(fired.remindAt).toLocaleString('es-ES', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>

      <div style={styles.actions}>
        <div style={styles.snoozeWrapper}>
          <button
            className="glass-button-secondary"
            style={styles.btn}
            onClick={() => setSnoozeOpen((v) => !v)}
          >
            Aplazar ▾
          </button>
          {snoozeOpen && (
            <div className="glass-panel" style={styles.snoozeMenu}>
              {!customMode ? (
                <>
                  <SnoozeItem label="10 minutos" onClick={() => fireSnooze(inMinutes(10))} />
                  <SnoozeItem label="1 hora" onClick={() => fireSnooze(inMinutes(60))} />
                  <SnoozeItem label="12 horas" onClick={() => fireSnooze(inMinutes(720))} />
                  <SnoozeItem label="1 día" onClick={() => fireSnooze(inMinutes(1440))} />
                  <div style={styles.divider} />
                  <SnoozeItem
                    label="Personalizado…"
                    onClick={() => setCustomMode(true)}
                  />
                </>
              ) : (
                <div style={styles.customBox}>
                  <input
                    type="datetime-local"
                    className="glass-input"
                    style={styles.customInput}
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                  />
                  <div style={styles.customButtons}>
                    <button
                      className="glass-button-secondary"
                      style={styles.smallBtn}
                      onClick={() => setCustomMode(false)}
                    >
                      Atrás
                    </button>
                    <button
                      className="glass-button"
                      style={styles.smallBtn}
                      disabled={!customValue}
                      onClick={() => {
                        const d = new Date(customValue);
                        if (!isNaN(d.getTime())) fireSnooze(d);
                      }}
                    >
                      Aplazar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <button
          className="glass-button"
          style={styles.btn}
          onClick={() => onDismiss(fired.reminderId)}
        >
          Visto
        </button>
      </div>
    </div>
  );
};

const SnoozeItem: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button type="button" style={styles.snoozeItem} className="ctx-item" onClick={onClick}>
    {label}
  </button>
);

const inMinutes = (m: number): Date => new Date(Date.now() + m * 60_000);

// "now + 1h" pre-filled in the user's local zone, in the YYYY-MM-DDTHH:MM
// format the native datetime-local input expects.
const defaultCustomLocal = (): string => {
  const d = inMinutes(60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
    gap: '8px',
  },
  btn: {
    padding: '6px 14px',
    fontSize: '12px',
  },
  snoozeWrapper: {
    position: 'relative',
  },
  snoozeMenu: {
    position: 'absolute',
    bottom: 'calc(100% + 6px)',
    right: 0,
    minWidth: '180px',
    padding: '6px',
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    zIndex: 1400,
  },
  snoozeItem: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-primary)',
    textAlign: 'left',
    padding: '8px 10px',
    fontSize: '13px',
    cursor: 'pointer',
    borderRadius: '6px',
    width: '100%',
  },
  divider: {
    height: '1px',
    background: 'rgba(255,255,255,0.08)',
    margin: '4px 0',
  },
  customBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '6px',
  },
  customInput: {
    width: '100%',
    padding: '6px 8px',
    fontSize: '12px',
    colorScheme: 'dark',
  },
  customButtons: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
  },
  smallBtn: {
    flex: 1,
    padding: '4px 10px',
    fontSize: '12px',
  },
};
