import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Avatar } from './Avatar';

interface Contact {
  id: number;
  name: string;
  email?: string | null;
  image_url?: string | null;
  is_favorite: boolean;
  source: 'manual' | 'google';
  google_account_id?: number | null;
}

interface GoogleAccount {
  id: number;
  email: string;
  scopes: string;
}

interface ContactsSettingsProps {
  onClose: () => void;
  onChanged: () => void;
}

const CONTACTS_SCOPE = 'https://www.googleapis.com/auth/contacts.readonly';

export const ContactsSettings: React.FC<ContactsSettingsProps> = ({
  onClose,
  onChanged,
}) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const [contactsData, accountsData] = await Promise.all([
        api.getContacts(),
        api.getGoogleAccounts(),
      ]);
      setContacts(contactsData);
      setAccounts(accountsData);
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
  }, [onClose]);

  const handleSync = async (accountId: number) => {
    try {
      setSyncingId(accountId);
      setSyncMessage(null);
      const result = await api.syncGoogleContacts(accountId);
      setSyncMessage(
        `${result.added} añadidos, ${result.updated} actualizados (${result.total} en Google).`
      );
      await load();
      onChanged();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSyncingId(null);
    }
  };

  const handleFavoriteToggle = async (c: Contact) => {
    try {
      await api.updateContact(c.id, { is_favorite: !c.is_favorite });
      await load();
      onChanged();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (c: Contact) => {
    const isGoogle = c.source === 'google';
    const msg = isGoogle
      ? `¿Quitar a "${c.name}" del listado local? Volverá a aparecer la próxima vez que sincronices con Google.`
      : `¿Borrar "${c.name}"?`;
    if (!confirm(msg)) return;
    try {
      await api.deleteContact(c.id);
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
          <h2 style={styles.title}>Contactos</h2>
          <button style={styles.closeBtn} onClick={onClose} title="Cerrar">
            ✕
          </button>
        </div>

        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>Importar de Google</h3>
          {accounts.length === 0 ? (
            <p style={styles.muted}>
              No tienes ninguna cuenta de Google conectada. Conéctala desde
              ⚙️ Cuentas Google con el permiso de Contactos.
            </p>
          ) : (
            <ul style={styles.accountList}>
              {accounts.map((acc) => {
                const hasScope = acc.scopes.includes(CONTACTS_SCOPE);
                const busy = syncingId === acc.id;
                return (
                  <li key={acc.id} className="glass-card" style={styles.accountRow}>
                    <div style={styles.accountInfo}>
                      <div style={styles.accountEmail}>{acc.email}</div>
                      {!hasScope && (
                        <div style={styles.accountHint}>
                          Sin permiso de Contactos — re-conecta marcando esa casilla.
                        </div>
                      )}
                    </div>
                    <button
                      className="glass-button"
                      style={styles.syncBtn}
                      disabled={!hasScope || busy}
                      onClick={() => handleSync(acc.id)}
                    >
                      {busy ? 'Sincronizando...' : 'Sincronizar'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {syncMessage && <div style={styles.syncMessage}>{syncMessage}</div>}
        </section>

        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>
            Tus contactos ({contacts.length})
          </h3>
          {loading ? (
            <p style={styles.muted}>Cargando...</p>
          ) : contacts.length === 0 ? (
            <p style={styles.muted}>
              Aún no tienes contactos. Sincroniza desde una cuenta Google.
            </p>
          ) : (
            <ul style={styles.list}>
              {contacts.map((c) => (
                <li key={c.id} className="glass-card" style={styles.row}>
                  <Avatar name={c.name} imageUrl={c.image_url} size={36} />
                  <div style={styles.contactBody}>
                    <div style={styles.contactName}>
                      {c.name}
                      {c.source === 'google' && (
                        <span style={styles.googleBadge} title="Sincronizado desde Google">
                          G
                        </span>
                      )}
                    </div>
                    {c.email && <div style={styles.contactEmail}>{c.email}</div>}
                  </div>
                  <div style={styles.actions}>
                    <button
                      type="button"
                      style={{
                        ...styles.actionBtn,
                        color: c.is_favorite ? '#f59e0b' : 'var(--text-muted)',
                      }}
                      onClick={() => handleFavoriteToggle(c)}
                      title={c.is_favorite ? 'Quitar de habituales' : 'Marcar habitual'}
                    >
                      {c.is_favorite ? '★' : '☆'}
                    </button>
                    <button
                      type="button"
                      style={styles.actionBtn}
                      onClick={() => handleDelete(c)}
                      title="Borrar"
                    >
                      🗑️
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
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
    maxWidth: '640px',
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
  title: { fontSize: '20px', fontWeight: 600 },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: '16px',
    cursor: 'pointer',
  },
  section: { marginBottom: '24px' },
  sectionTitle: {
    fontSize: '13px',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    color: 'var(--text-muted)',
    marginBottom: '12px',
    fontWeight: 600,
  },
  accountList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  accountRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    gap: '12px',
  },
  accountInfo: { flex: 1, minWidth: 0 },
  accountEmail: {
    fontSize: '14px',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  accountHint: {
    fontSize: '11px',
    color: 'var(--accent-warning)',
    marginTop: '4px',
  },
  syncBtn: {
    padding: '8px 14px',
    fontSize: '12px',
  },
  syncMessage: {
    marginTop: '8px',
    padding: '8px 12px',
    background: 'rgba(16,185,129,0.10)',
    border: '1px solid rgba(16,185,129,0.40)',
    borderRadius: 'var(--border-radius-sm)',
    fontSize: '12px',
    color: '#a7f3d0',
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
    padding: '10px 14px',
  },
  contactBody: { flex: 1, minWidth: 0 },
  contactName: {
    fontSize: '14px',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  googleBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #4285F4, #DB4437 60%, #F4B400)',
    color: '#ffffff',
    fontSize: '9px',
    fontWeight: 700,
  },
  contactEmail: {
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  actions: { display: 'flex', gap: '4px' },
  actionBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '4px 6px',
    borderRadius: '6px',
  },
  muted: {
    color: 'var(--text-muted)',
    fontSize: '13px',
    textAlign: 'center',
  },
};
