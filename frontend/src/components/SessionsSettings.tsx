import React, { useEffect, useState } from 'react';
import { api, type UserSession } from '../services/api';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface SessionsSettingsProps {
  onClose: () => void;
  /** Revoking the session of this very device logs us out. */
  onCurrentRevoked: () => void;
}

/** Good-enough "Chrome · Android" label from a User-Agent string. We
 *  only need the user to recognise their own devices. */
function describeDevice(ua: string | null): { icon: string; label: string } {
  if (!ua) return { icon: '❔', label: 'Dispositivo desconocido' };
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Navegador';
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/.test(ua)
      ? 'iOS'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  const mobile = /Mobi|Android|iPhone|iPad|iPod/.test(ua);
  return { icon: mobile ? '📱' : '💻', label: os ? `${browser} · ${os}` : browser };
}

export const SessionsSettings: React.FC<SessionsSettingsProps> = ({
  onClose,
  onCurrentRevoked,
}) => {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEscapeKey(onClose);

  useEffect(() => {
    api
      .getSessions()
      .then(setSessions)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleRevoke = async (session: UserSession) => {
    const prompt = session.current
      ? 'Es la sesión de este dispositivo: se cerrará ahora. ¿Continuar?'
      : '¿Cerrar la sesión en ese dispositivo?';
    if (!confirm(prompt)) return;
    try {
      await api.revokeSession(session.id);
      if (session.current) {
        onCurrentRevoked();
        return;
      }
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const fmt = (iso: string) => new Date(iso).toLocaleString('es-ES');

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div
        className="glass-panel animate-fade-in"
        style={styles.panel}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.header}>
          <h2 style={styles.title}>Sesiones recordadas</h2>
          <button style={styles.closeBtn} onClick={onClose} title="Cerrar">
            ✕
          </button>
        </div>

        <p style={styles.hint}>
          Dispositivos donde entraste con «Recuérdame». Siguen dentro mientras
          los uses al menos una vez cada 90 días.
        </p>

        {error && <div style={styles.error}>{error}</div>}

        {loading ? (
          <p style={styles.muted}>Cargando...</p>
        ) : sessions.length === 0 ? (
          <p style={styles.muted}>No hay sesiones recordadas.</p>
        ) : (
          <ul style={styles.list}>
            {sessions.map((session) => {
              const device = describeDevice(session.user_agent);
              return (
                <li key={session.id} className="glass-card" style={styles.row}>
                  <span style={styles.icon}>{device.icon}</span>
                  <div style={styles.rowMain}>
                    <div style={styles.rowName}>
                      {device.label}
                      {session.current && (
                        <span style={styles.currentTag}>este dispositivo</span>
                      )}
                    </div>
                    <div style={styles.rowDates}>
                      Último uso: {fmt(session.last_used_at)} · Desde: {fmt(session.created_at)}
                    </div>
                  </div>
                  <button
                    className="glass-button glass-button-danger"
                    style={styles.revokeBtn}
                    onClick={() => handleRevoke(session)}
                  >
                    Cerrar
                  </button>
                </li>
              );
            })}
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
    padding: '16px',
  },
  panel: {
    width: '100%',
    maxWidth: '600px',
    maxHeight: '85vh',
    overflowY: 'auto',
    padding: '28px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  title: {
    fontSize: '20px',
    fontWeight: 600,
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: '16px',
    cursor: 'pointer',
  },
  hint: {
    color: 'var(--text-secondary)',
    fontSize: '13px',
    marginBottom: '20px',
  },
  error: {
    background: 'rgba(239,68,68,0.12)',
    border: '1px solid rgba(239,68,68,0.4)',
    padding: '10px 14px',
    borderRadius: 'var(--border-radius-sm)',
    color: '#f87171',
    fontSize: '13px',
    marginBottom: '14px',
  },
  list: {
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: 0,
    margin: 0,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    padding: '14px 16px',
    gap: '12px',
  },
  icon: {
    fontSize: '22px',
  },
  rowMain: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    fontWeight: 500,
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  currentTag: {
    fontSize: '10px',
    background: 'rgba(16,185,129,0.15)',
    color: '#a7f3d0',
    border: '1px solid rgba(16,185,129,0.45)',
    padding: '2px 8px',
    borderRadius: '999px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  rowDates: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  revokeBtn: {
    padding: '8px 14px',
    fontSize: '12px',
  },
  muted: {
    color: 'var(--text-muted)',
    fontSize: '13px',
  },
};
