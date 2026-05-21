import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';

interface FocusTimerProps {
  activeTask: { id: number; title: string } | null;
  onClearActiveTask: () => void;
  onSessionLogged: () => void;
}

export const FocusTimer: React.FC<FocusTimerProps> = ({
  activeTask,
  onClearActiveTask,
  onSessionLogged,
}) => {
  const [minutes, setMinutes] = useState(25);
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [totalDuration, setTotalDuration] = useState(25 * 60); // in seconds
  const [mode, setMode] = useState<'work' | 'shortBreak' | 'longBreak'>('work');
  const [minimized, setMinimized] = useState(false);
  const [finishedMessage, setFinishedMessage] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Play a beautiful, gentle chime sound when timer finishes using Web Audio API (no external asset needed)
  const playAlertSound = () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5 note
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15); // E5 note
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.3); // G5 note
      
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
    } catch (e) {
      console.warn("Could not play synthesized audio alert", e);
    }
  };

  useEffect(() => {
    if (isActive) {
      timerRef.current = setInterval(() => {
        if (seconds > 0) {
          setSeconds(seconds - 1);
        } else if (seconds === 0) {
          if (minutes === 0) {
            // Timer Finished!
            handleTimerComplete();
          } else {
            setMinutes(minutes - 1);
            setSeconds(59);
          }
        }
      }, 1000);
    } else if (!isActive && timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, minutes, seconds]);

  const fireSystemNotification = (title: string, body: string) => {
    if (
      typeof window === 'undefined' ||
      !('Notification' in window) ||
      Notification.permission !== 'granted'
    ) {
      return;
    }
    try {
      new Notification(title, {
        body,
        icon: '/logo.png',
        tag: 'alfred-focus-done',
      });
    } catch {
      /* ignore */
    }
  };

  const handleTimerComplete = async () => {
    setIsActive(false);
    playAlertSound();

    // Auto-expand on completion so the user sees the outcome even if the
    // overlay was tucked away while they worked.
    setMinimized(false);

    if (mode === 'work' && activeTask) {
      const mins = totalDuration / 60;
      const msg = `Has terminado ${mins} min en "${activeTask.title}"`;
      setFinishedMessage(msg);
      fireSystemNotification('Alfred — sesión completada', msg);
      try {
        await api.createFocusSession(activeTask.id, totalDuration);
        onSessionLogged();
      } catch (err: any) {
        console.error('Error logging focus session:', err);
      }
    } else {
      const label = mode === 'work' ? 'enfoque' : 'descanso';
      const msg = `Sesión de ${label} completada.`;
      setFinishedMessage(msg);
      fireSystemNotification('Alfred', msg);
    }
    resetTimer(mode);
  };

  const toggleTimer = () => {
    setFinishedMessage(null);
    setIsActive(!isActive);
  };

  const resetTimer = (newMode = mode) => {
    setIsActive(false);
    setMode(newMode);
    setFinishedMessage(null);
    
    let mins = 25;
    if (newMode === 'shortBreak') mins = 5;
    if (newMode === 'longBreak') mins = 15;
    
    setMinutes(mins);
    setSeconds(0);
    setTotalDuration(mins * 60);
  };

  const getProgressPercent = () => {
    const currentSeconds = minutes * 60 + seconds;
    const elapsed = totalDuration - currentSeconds;
    return (elapsed / totalDuration) * 100;
  };

  // SVG Circular progress math
  const radius = 80;
  const stroke = 6;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (getProgressPercent() / 100) * circumference;

  const timeString = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  if (minimized) {
    // Compact pill: title + time + play/pause + expand + close.
    return (
      <div
        style={{ ...styles.container, ...styles.containerMinimized }}
        className="animate-fade-in"
      >
        <div className="glass-panel" style={styles.miniCard}>
          <div style={styles.miniBody}>
            <span style={styles.miniBell}>⏱️</span>
            <span style={styles.miniTitle} title={activeTask?.title}>
              {activeTask?.title || 'Sesión libre'}
            </span>
            <span
              style={{
                ...styles.miniTime,
                color: isActive
                  ? 'var(--accent-primary)'
                  : 'var(--text-secondary)',
              }}
            >
              {timeString}
            </span>
            <button
              style={styles.miniIconBtn}
              onClick={toggleTimer}
              title={isActive ? 'Pausar' : 'Iniciar'}
            >
              {isActive ? '⏸' : '▶'}
            </button>
            <button
              style={styles.miniIconBtn}
              onClick={() => setMinimized(false)}
              title="Expandir"
            >
              ⤢
            </button>
            <button
              style={styles.miniIconBtn}
              onClick={onClearActiveTask}
              title="Cerrar"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container} className="animate-fade-in">
      <div className="glass-panel" style={styles.timerCard}>
        {/* Overlay header with minimize + close affordances */}
        <div style={styles.overlayHeader}>
          <span style={styles.overlayTitle}>⏱️ Enfoque</span>
          <span style={styles.overlayHeaderActions}>
            <button
              style={styles.overlayCloseBtn}
              onClick={() => setMinimized(true)}
              title="Minimizar"
            >
              —
            </button>
            <button
              style={styles.overlayCloseBtn}
              onClick={onClearActiveTask}
              title="Cerrar"
            >
              ✕
            </button>
          </span>
        </div>

        {finishedMessage && (
          <div
            style={styles.finishedBanner}
            className="animate-fade-in"
            onClick={() => setFinishedMessage(null)}
            title="Cerrar aviso"
          >
            ✅ {finishedMessage}
          </div>
        )}

        {/* Presets Selection */}
        <div style={styles.presets}>
          <button
            className={`glass-button ${mode === 'work' ? '' : 'glass-button-secondary'}`}
            style={styles.presetBtn}
            onClick={() => resetTimer('work')}
          >
            ⏱️ Pomodoro (25m)
          </button>
          <button
            className={`glass-button ${mode === 'shortBreak' ? '' : 'glass-button-secondary'}`}
            style={styles.presetBtn}
            onClick={() => resetTimer('shortBreak')}
          >
            ☕ Corto (5m)
          </button>
          <button
            className={`glass-button ${mode === 'longBreak' ? '' : 'glass-button-secondary'}`}
            style={styles.presetBtn}
            onClick={() => resetTimer('longBreak')}
          >
            🌴 Largo (15m)
          </button>
        </div>

        {/* Task Binding Indicator */}
        {activeTask && mode === 'work' ? (
          <div style={styles.activeTaskBadge} className="animate-fade-in">
            <span style={styles.activeTaskText}>
              🎯 Enfoque activo: <strong>{activeTask.title}</strong>
            </span>
            <button style={styles.clearTaskBtn} onClick={onClearActiveTask} title="Desvincular tarea">
              ✕
            </button>
          </div>
        ) : mode === 'work' ? (
          <div style={styles.noTaskAlert}>
            💡 <em>Consejo: Haz clic en el icono de reloj de una tarea en el tablero para vincularla aquí y medir tus estadísticas.</em>
          </div>
        ) : null}

        {/* Animated Circular Progress & Timer */}
        <div style={styles.clockContainer}>
          <svg height={radius * 2} width={radius * 2} style={styles.svg}>
            {/* Background Track Circle */}
            <circle
              stroke="rgba(255, 255, 255, 0.03)"
              fill="transparent"
              strokeWidth={stroke}
              r={normalizedRadius}
              cx={radius}
              cy={radius}
            />
            {/* Active Progress Circle */}
            <circle
              stroke={mode === 'work' ? 'var(--accent-primary)' : 'var(--accent-success)'}
              fill="transparent"
              strokeWidth={stroke}
              strokeDasharray={circumference + ' ' + circumference}
              style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.5s linear' }}
              strokeLinecap="round"
              r={normalizedRadius}
              cx={radius}
              cy={radius}
            />
          </svg>

          {/* Time digits placed exactly in the center */}
          <div style={styles.digits}>
            <div style={styles.timeString}>
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </div>
            <div style={styles.modeLabel}>
              {mode === 'work' ? 'ENFOQUE' : 'DESCANSO'}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div style={styles.controls}>
          <button
            className="glass-button"
            style={{
              ...styles.controlBtn,
              backgroundColor: isActive ? 'var(--accent-warning)' : 'var(--accent-primary)',
            }}
            onClick={toggleTimer}
          >
            {isActive ? 'Pausar' : 'Iniciar'}
          </button>
          <button
            className="glass-button glass-button-secondary"
            style={styles.controlBtn}
            onClick={() => resetTimer()}
          >
            Reiniciar
          </button>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: 950,
    maxWidth: '380px',
    width: 'calc(100% - 48px)',
  },
  timerCard: {
    width: '100%',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
  },
  overlayHeader: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '4px',
    borderBottom: '1px solid var(--glass-border)',
  },
  overlayTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
  },
  overlayHeaderActions: {
    display: 'inline-flex',
    gap: '4px',
  },
  overlayCloseBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '4px 8px',
    borderRadius: '6px',
  },
  // -- Minimized layout --------------------------------------------------
  containerMinimized: {
    maxWidth: '320px',
  },
  miniCard: {
    padding: '8px 12px',
  },
  miniBody: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  miniBell: {
    fontSize: '14px',
  },
  miniTitle: {
    flex: 1,
    fontSize: '12px',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: 'var(--text-primary)',
  },
  miniTime: {
    fontSize: '13px',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.5px',
  },
  miniIconBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  // -- Completion banner -------------------------------------------------
  finishedBanner: {
    background: 'rgba(16, 185, 129, 0.12)',
    border: '1px solid rgba(16, 185, 129, 0.45)',
    color: '#a7f3d0',
    padding: '8px 12px',
    borderRadius: 'var(--border-radius-sm)',
    fontSize: '12px',
    cursor: 'pointer',
    textAlign: 'center',
    width: '100%',
  },
  presets: {
    display: 'flex',
    gap: '10px',
    width: '100%',
    justifyContent: 'center',
  },
  presetBtn: {
    flex: 1,
    padding: '10px 4px',
    fontSize: '12px',
  },
  activeTaskBadge: {
    width: '100%',
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    border: '1px solid rgba(99, 102, 241, 0.25)',
    padding: '12px 18px',
    borderRadius: 'var(--border-radius-sm)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
  },
  activeTaskText: {
    fontSize: '13px',
    color: '#e0e7ff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  clearTaskBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '12px',
  },
  noTaskAlert: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    textAlign: 'center',
    lineHeight: '1.5',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    padding: '12px 16px',
    borderRadius: 'var(--border-radius-sm)',
    border: '1px solid var(--glass-border)',
  },
  clockContainer: {
    position: 'relative',
    width: '160px',
    height: '160px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: {
    transform: 'rotate(-90deg)',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  digits: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  timeString: {
    fontSize: '2.4rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-1px',
  },
  modeLabel: {
    fontSize: '10px',
    letterSpacing: '2px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginTop: '4px',
  },
  controls: {
    display: 'flex',
    gap: '16px',
    width: '100%',
    justifyContent: 'center',
  },
  controlBtn: {
    flex: 1,
    maxWidth: '160px',
    padding: '12px',
    fontSize: '14px',
  },
};
