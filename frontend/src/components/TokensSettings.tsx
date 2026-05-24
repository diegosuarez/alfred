import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { registerPasskey, supportsWebAuthn } from '../services/webauthn';

interface PAT {
  id: number;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at?: string | null;
  expires_at?: string | null;
  revoked_at?: string | null;
}

interface NewlyMintedPAT extends PAT {
  token: string;
}

interface TokensSettingsProps {
  onClose: () => void;
}

export const TokensSettings: React.FC<TokensSettingsProps> = ({ onClose }) => {
  const [tokens, setTokens] = useState<PAT[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [justCreated, setJustCreated] = useState<NewlyMintedPAT | null>(null);
  const [copied, setCopied] = useState(false);
  const [passkeys, setPasskeys] = useState<
    { id: number; label: string | null; created_at?: string; last_used_at?: string | null }[]
  >([]);
  const [newPasskeyLabel, setNewPasskeyLabel] = useState('');
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  const loadPasskeys = async () => {
    try {
      setPasskeys(await api.listPasskeys());
    } catch (err: any) {
      setPasskeyError(err.message);
    }
  };

  const handleCreatePasskey = async () => {
    setPasskeyError(null);
    setPasskeyBusy(true);
    try {
      await registerPasskey(newPasskeyLabel || undefined);
      setNewPasskeyLabel('');
      await loadPasskeys();
    } catch (err: any) {
      setPasskeyError(
        err.name === 'NotAllowedError'
          ? 'Has cancelado el registro.'
          : err.message || 'No se pudo crear la passkey.',
      );
    } finally {
      setPasskeyBusy(false);
    }
  };

  const handleDeletePasskey = async (id: number) => {
    if (!confirm('¿Borrar esta passkey?')) return;
    try {
      await api.deletePasskey(id);
      await loadPasskeys();
    } catch (err: any) {
      setPasskeyError(err.message);
    }
  };

  const load = async () => {
    try {
      setLoading(true);
      const data = await api.getPats();
      setTokens(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadPasskeys();
  }, []);
  useEscapeKey(onClose);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const minted = await api.createPat(newName.trim());
      setJustCreated(minted);
      setNewName('');
      setCopied(false);
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRevoke = async (id: number) => {
    if (!confirm('¿Revocar este token? Los clientes que lo usen dejarán de poder autenticarse.')) return;
    try {
      await api.revokePat(id);
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCopy = async () => {
    if (!justCreated) return;
    try {
      await navigator.clipboard.writeText(justCreated.token);
      setCopied(true);
    } catch {
      // Older browsers / no permission — fall back silently.
    }
  };

  const handleTestPageNotification = () => {
    if (!('Notification' in window)) {
      alert('Tu navegador no soporta Notification.');
      return;
    }
    if (Notification.permission !== 'granted') {
      alert(`Notification.permission = "${Notification.permission}". Concédelo primero.`);
      return;
    }
    try {
      const n = new Notification('Alfred — prueba directa', {
        body: 'Si ves esto, las notificaciones del navegador funcionan.',
        icon: '/logo.png',
      });
      n.onerror = (err) => console.error('Notification onerror:', err);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const fmt = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString('es-ES') : '—';

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div
        className="glass-panel animate-fade-in"
        style={styles.panel}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.header}>
          <h2 style={styles.title}>Tokens API</h2>
          <button style={styles.closeBtn} onClick={onClose} title="Cerrar">
            ✕
          </button>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        {justCreated && (
          <div style={styles.minted} className="animate-fade-in">
            <div style={styles.mintedTitle}>Token creado — cópialo ahora</div>
            <div style={styles.mintedHint}>
              No volveremos a mostrarlo. Guárdalo en el cliente que lo vaya a usar.
            </div>
            <div style={styles.mintedTokenRow}>
              <code style={styles.mintedToken}>{justCreated.token}</code>
              <button
                className="glass-button"
                style={styles.copyBtn}
                onClick={handleCopy}
              >
                {copied ? 'Copiado ✓' : 'Copiar'}
              </button>
            </div>
            <button
              className="glass-button-secondary"
              style={styles.dismissBtn}
              onClick={() => setJustCreated(null)}
            >
              Ya lo guardé
            </button>
          </div>
        )}

        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>Crear nuevo token</h3>
          <form onSubmit={handleCreate} style={styles.createForm}>
            <input
              type="text"
              className="glass-input"
              placeholder="Nombre (ej. macbook-cli, claude-assistant)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={styles.createInput}
            />
            <button type="submit" className="glass-button">
              Crear
            </button>
          </form>
        </section>

        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>Diagnóstico de notificaciones</h3>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="glass-button-secondary"
              style={{ padding: '8px 14px', fontSize: '12px' }}
              onClick={handleTestPageNotification}
            >
              🔔 Notificación directa (sin SW)
            </button>
          </div>
        </section>

        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>Tokens activos</h3>
          {loading ? (
            <p style={styles.muted}>Cargando...</p>
          ) : tokens.length === 0 ? (
            <p style={styles.muted}>No tienes tokens todavía.</p>
          ) : (
            <ul style={styles.list}>
              {tokens.map((pat) => (
                <li key={pat.id} className="glass-card" style={styles.row}>
                  <div style={styles.rowMain}>
                    <div style={styles.rowName}>
                      {pat.name}
                      {pat.revoked_at && (
                        <span style={styles.revokedTag}>revocado</span>
                      )}
                    </div>
                    <div style={styles.rowMeta}>
                      <code style={styles.prefix}>
                        alfred_pat_{pat.prefix}…
                      </code>
                    </div>
                    <div style={styles.rowDates}>
                      Creado: {fmt(pat.created_at)} · Último uso: {fmt(pat.last_used_at)}
                    </div>
                  </div>
                  {!pat.revoked_at && (
                    <button
                      className="glass-button glass-button-danger"
                      style={styles.revokeBtn}
                      onClick={() => handleRevoke(pat.id)}
                    >
                      Revocar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {supportsWebAuthn() && (
          <section style={styles.section}>
            <h3 style={styles.sectionTitle}>Passkeys</h3>
            <p style={styles.muted}>
              Inicia sesión sin contraseña usando la huella, FaceID o un
              authenticator hardware. Cada passkey queda vinculada a este
              dispositivo / contraseña del navegador.
            </p>
            {passkeyError && <div style={styles.error}>{passkeyError}</div>}
            <div style={styles.createForm}>
              <input
                type="text"
                className="glass-input"
                style={styles.createInput}
                placeholder="Nombre (ej. MacBook Touch ID)"
                value={newPasskeyLabel}
                onChange={(e) => setNewPasskeyLabel(e.target.value)}
              />
              <button
                type="button"
                className="glass-button"
                onClick={handleCreatePasskey}
                disabled={passkeyBusy}
              >
                {passkeyBusy ? 'Registrando…' : 'Añadir passkey'}
              </button>
            </div>
            {passkeys.length === 0 ? (
              <p style={styles.muted}>Aún no has registrado ninguna passkey.</p>
            ) : (
              <ul style={styles.list}>
                {passkeys.map((p) => (
                  <li key={p.id} className="glass-card" style={styles.row}>
                    <div style={styles.rowMain}>
                      <div style={styles.rowName}>{p.label || `Passkey #${p.id}`}</div>
                      <div style={styles.rowDates}>
                        Creada: {fmt(p.created_at)} · Último uso: {fmt(p.last_used_at)}
                      </div>
                    </div>
                    <button
                      className="glass-button glass-button-danger"
                      style={styles.revokeBtn}
                      onClick={() => handleDeletePasskey(p.id)}
                    >
                      Borrar
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
    maxWidth: '600px',
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
  error: {
    background: 'rgba(239,68,68,0.12)',
    border: '1px solid rgba(239,68,68,0.4)',
    padding: '10px 14px',
    borderRadius: 'var(--border-radius-sm)',
    color: '#f87171',
    fontSize: '13px',
    marginBottom: '14px',
  },
  minted: {
    background: 'rgba(16,185,129,0.10)',
    border: '1px solid rgba(16,185,129,0.45)',
    padding: '16px',
    borderRadius: 'var(--border-radius-md)',
    marginBottom: '24px',
  },
  mintedTitle: {
    fontWeight: 600,
    color: '#a7f3d0',
    fontSize: '14px',
    marginBottom: '6px',
  },
  mintedHint: {
    color: 'var(--text-secondary)',
    fontSize: '12px',
    marginBottom: '12px',
  },
  mintedTokenRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'stretch',
    marginBottom: '10px',
  },
  mintedToken: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: '12px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid var(--glass-border)',
    padding: '10px 12px',
    borderRadius: 'var(--border-radius-sm)',
    wordBreak: 'break-all',
  },
  copyBtn: {
    padding: '10px 16px',
    fontSize: '12px',
  },
  dismissBtn: {
    padding: '6px 12px',
    fontSize: '12px',
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
  createForm: {
    display: 'flex',
    gap: '8px',
  },
  createInput: {
    flex: 1,
    padding: '10px 12px',
    fontSize: '13px',
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    gap: '12px',
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
  },
  revokedTag: {
    fontSize: '10px',
    background: 'rgba(239,68,68,0.18)',
    color: '#fca5a5',
    border: '1px solid rgba(239,68,68,0.4)',
    padding: '2px 8px',
    borderRadius: '999px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  rowMeta: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  prefix: {
    fontFamily: 'monospace',
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
