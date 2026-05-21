import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface GoogleAccount {
  id: number;
  email: string;
  scopes: string;
  created_at: string;
  updated_at: string;
}

interface Context {
  id: number;
  name: string;
  google_account_id?: number | null;
}

interface GoogleSettingsProps {
  contexts: Context[];
  onClose: () => void;
  onContextsRefresh: () => Promise<void> | void;
}

// Built-in extra scopes users can request at connect time. The list is
// intentionally short for now — calendar + contacts only.
const SCOPE_PRESETS: { label: string; value: string }[] = [
  { label: 'Calendario (lectura)', value: 'https://www.googleapis.com/auth/calendar.readonly' },
  { label: 'Contactos (lectura)', value: 'https://www.googleapis.com/auth/contacts.readonly' },
];

export const GoogleSettings: React.FC<GoogleSettingsProps> = ({
  contexts,
  onClose,
  onContextsRefresh,
}) => {
  const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  useEscapeKey(onClose);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const data = await api.getGoogleAccounts();
      setAccounts(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleConnect = async () => {
    try {
      const { authorize_url } = await api.connectGoogleAccount(selectedScopes);
      window.location.href = authorize_url;
    } catch (err: any) {
      if (err.message?.includes('not configured')) {
        alert(
          'El servidor no tiene configuradas las credenciales de Google. ' +
            'Define GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el backend.'
        );
      } else {
        alert(err.message);
      }
    }
  };

  const handleDisconnect = async (accountId: number) => {
    if (!confirm('¿Desconectar esta cuenta? Se quitará de los contextos que la usen.')) return;
    try {
      await api.disconnectGoogleAccount(accountId);
      await loadAccounts();
      await onContextsRefresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAssign = async (contextId: number, accountId: number | null) => {
    try {
      await api.assignContextGoogleAccount(contextId, accountId);
      await onContextsRefresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div
        className="glass-panel animate-fade-in"
        style={styles.panel}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.header}>
          <h2 style={styles.title}>Cuentas Google</h2>
          <button style={styles.closeBtn} onClick={onClose} title="Cerrar">
            ✕
          </button>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>Conectadas</h3>
          {loading ? (
            <p style={styles.muted}>Cargando...</p>
          ) : accounts.length === 0 ? (
            <p style={styles.muted}>No tienes ninguna cuenta conectada todavía.</p>
          ) : (
            <ul style={styles.list}>
              {accounts.map((acc) => (
                <li key={acc.id} className="glass-card" style={styles.accountCard}>
                  <div>
                    <div style={styles.accountEmail}>{acc.email}</div>
                    <div style={styles.accountScopes}>
                      {acc.scopes.split(' ').filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                  <button
                    className="glass-button glass-button-danger"
                    style={styles.disconnectBtn}
                    onClick={() => handleDisconnect(acc.id)}
                  >
                    Desconectar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>Conectar otra cuenta</h3>
          <p style={styles.muted}>Permisos adicionales (opcional):</p>
          <div style={styles.scopeList}>
            {SCOPE_PRESETS.map((preset) => (
              <label key={preset.value} style={styles.scopeLabel}>
                <input
                  type="checkbox"
                  checked={selectedScopes.includes(preset.value)}
                  onChange={() => toggleScope(preset.value)}
                />
                {preset.label}
              </label>
            ))}
          </div>
          <button
            className="glass-button"
            style={styles.connectBtn}
            onClick={handleConnect}
          >
            Conectar cuenta de Google
          </button>
        </section>

        {contexts.length > 0 && accounts.length > 0 && (
          <section style={styles.section}>
            <h3 style={styles.sectionTitle}>Asignación a contextos</h3>
            <ul style={styles.list}>
              {contexts.map((ctx) => (
                <li key={ctx.id} style={styles.assignRow}>
                  <span style={styles.assignName}>{ctx.name}</span>
                  <select
                    className="glass-input"
                    value={ctx.google_account_id ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      handleAssign(ctx.id, v === '' ? null : Number(v));
                    }}
                  >
                    <option value="">Sin asignar</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.email}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </section>
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
    padding: '28px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
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
  section: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '13px',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    color: 'var(--text-muted)',
    marginBottom: '12px',
    fontWeight: 600,
  },
  list: {
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: 0,
    margin: 0,
  },
  accountCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    gap: '12px',
  },
  accountEmail: {
    fontWeight: 500,
    fontSize: '14px',
  },
  accountScopes: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginTop: '4px',
    wordBreak: 'break-all',
  },
  disconnectBtn: {
    padding: '8px 14px',
    fontSize: '12px',
  },
  scopeList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '14px',
  },
  scopeLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },
  connectBtn: {
    padding: '12px 20px',
  },
  assignRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
  },
  assignName: {
    fontSize: '14px',
    fontWeight: 500,
  },
  muted: {
    color: 'var(--text-muted)',
    fontSize: '13px',
    marginBottom: '8px',
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
};
