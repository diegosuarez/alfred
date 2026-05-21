import React, { useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface ReminderPickerProps {
  onClose: () => void;
  onPick: (isoUtc: string) => Promise<void>;
}

interface Preset {
  label: string;
  build: () => Date;
  /** Optional predicate to hide the preset (e.g. "today 18:00" once
   * we've already passed 18:00). */
  available?: () => boolean;
}

const inMinutes = (m: number): Date => new Date(Date.now() + m * 60_000);

const atToday = (hour: number, minute = 0): Date => {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
};

const atTomorrow = (hour: number, minute = 0): Date => {
  const d = atToday(hour, minute);
  d.setDate(d.getDate() + 1);
  return d;
};

const PRESETS: Preset[] = [
  { label: 'En 15 minutos', build: () => inMinutes(15) },
  { label: 'En 1 hora', build: () => inMinutes(60) },
  { label: 'En 3 horas', build: () => inMinutes(180) },
  {
    label: 'Hoy al mediodía',
    build: () => atToday(12),
    available: () => atToday(12).getTime() > Date.now(),
  },
  {
    label: 'Hoy a las 18:00',
    build: () => atToday(18),
    available: () => atToday(18).getTime() > Date.now(),
  },
  { label: 'Mañana a las 9:00', build: () => atTomorrow(9) },
  { label: 'Mañana a mediodía', build: () => atTomorrow(12) },
];

const formatPreview = (d: Date): string =>
  d.toLocaleString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export const ReminderPicker: React.FC<ReminderPickerProps> = ({
  onClose,
  onPick,
}) => {
  const [customMode, setCustomMode] = useState(false);
  // datetime-local format: YYYY-MM-DDTHH:MM
  const defaultCustom = (() => {
    const d = inMinutes(60);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();
  const [customValue, setCustomValue] = useState(defaultCustom);
  const [submitting, setSubmitting] = useState(false);
  useEscapeKey(onClose);

  const dispatch = async (when: Date) => {
    if (when.getTime() < Date.now()) {
      if (!confirm('Esa fecha está en el pasado. ¿Crear el recordatorio igualmente (saltará ya)?')) {
        return;
      }
    }
    setSubmitting(true);
    try {
      await onPick(when.toISOString());
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
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
          <h2 style={styles.title}>Crear recordatorio</h2>
          <button style={styles.closeBtn} onClick={onClose} title="Cerrar">
            ✕
          </button>
        </div>

        {!customMode ? (
          <>
            <ul style={styles.list}>
              {PRESETS.filter((p) => !p.available || p.available()).map((p) => {
                const d = p.build();
                return (
                  <li key={p.label}>
                    <button
                      type="button"
                      className="glass-button-secondary"
                      style={styles.presetBtn}
                      onClick={() => dispatch(d)}
                      disabled={submitting}
                    >
                      <span style={styles.presetLabel}>{p.label}</span>
                      <span style={styles.presetWhen}>{formatPreview(d)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="glass-button-secondary"
              style={styles.customTrigger}
              onClick={() => setCustomMode(true)}
            >
              📅 Personalizar fecha y hora
            </button>
          </>
        ) : (
          <div style={styles.customWrapper}>
            <label style={styles.label}>Cuándo</label>
            <input
              type="datetime-local"
              className="glass-input"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              style={styles.dateInput}
            />
            <div style={styles.customActions}>
              <button
                type="button"
                className="glass-button-secondary"
                onClick={() => setCustomMode(false)}
              >
                Volver
              </button>
              <button
                type="button"
                className="glass-button"
                disabled={!customValue || submitting}
                onClick={() => dispatch(new Date(customValue))}
              >
                Crear
              </button>
            </div>
          </div>
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
    zIndex: 1200,
  },
  panel: {
    width: '100%',
    maxWidth: '420px',
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
  list: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '14px',
  },
  presetBtn: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    textAlign: 'left',
  },
  presetLabel: { fontSize: '13px', fontWeight: 500 },
  presetWhen: { fontSize: '11px', color: 'var(--text-muted)' },
  customTrigger: {
    width: '100%',
    padding: '10px',
    fontSize: '13px',
  },
  customWrapper: { display: 'flex', flexDirection: 'column', gap: '10px' },
  label: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  dateInput: { padding: '10px 12px', fontSize: '14px' },
  customActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  },
};
