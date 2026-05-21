import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Avatar } from './Avatar';

interface Contact {
  id: number;
  name: string;
  email?: string | null;
  image_url?: string | null;
  is_favorite: boolean;
}

interface ContactsSettingsProps {
  onClose: () => void;
  onChanged: () => void;
}

export const ContactsSettings: React.FC<ContactsSettingsProps> = ({
  onClose,
  onChanged,
}) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState<Contact | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setContacts(await api.getContacts());
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.createContact({
        name: name.trim(),
        email: email.trim() || undefined,
        image_url: imageUrl.trim() || undefined,
      });
      setName('');
      setEmail('');
      setImageUrl('');
      await load();
      onChanged();
    } catch (err: any) {
      alert(err.message);
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

  const beginEdit = (c: Contact) => {
    setEditingId(c.id);
    setEditingDraft({ ...c });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingDraft(null);
  };

  const commitEdit = async () => {
    if (!editingDraft) return;
    try {
      await api.updateContact(editingDraft.id, {
        name: editingDraft.name,
        email: editingDraft.email || undefined,
        image_url: editingDraft.image_url || undefined,
      });
      cancelEdit();
      await load();
      onChanged();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (c: Contact) => {
    if (!confirm(`¿Borrar "${c.name}"? Las tareas que le hacen referencia se mantienen, solo se desvincula.`)) return;
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
          <h3 style={styles.sectionTitle}>Nuevo contacto</h3>
          <form onSubmit={handleCreate} style={styles.createForm}>
            <input
              type="text"
              className="glass-input"
              placeholder="Nombre *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={styles.createField}
            />
            <input
              type="email"
              className="glass-input"
              placeholder="email@ejemplo.com (opcional)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.createField}
            />
            <input
              type="url"
              className="glass-input"
              placeholder="URL imagen (opcional)"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              style={styles.createField}
            />
            <button type="submit" className="glass-button" style={styles.createBtn}>
              Añadir
            </button>
          </form>
        </section>

        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>
            Tus contactos ({contacts.length})
          </h3>
          {loading ? (
            <p style={styles.muted}>Cargando...</p>
          ) : contacts.length === 0 ? (
            <p style={styles.muted}>Aún no tienes contactos.</p>
          ) : (
            <ul style={styles.list}>
              {contacts.map((c) => {
                const editing = editingId === c.id && editingDraft;
                return (
                  <li key={c.id} className="glass-card" style={styles.row}>
                    <Avatar name={c.name} imageUrl={c.image_url} size={36} />
                    {editing ? (
                      <div style={styles.editFields}>
                        <input
                          type="text"
                          className="glass-input"
                          style={styles.editInput}
                          value={editingDraft!.name}
                          onChange={(e) =>
                            setEditingDraft({ ...editingDraft!, name: e.target.value })
                          }
                          autoFocus
                        />
                        <input
                          type="email"
                          className="glass-input"
                          style={styles.editInput}
                          placeholder="email"
                          value={editingDraft!.email || ''}
                          onChange={(e) =>
                            setEditingDraft({ ...editingDraft!, email: e.target.value })
                          }
                        />
                        <input
                          type="url"
                          className="glass-input"
                          style={styles.editInput}
                          placeholder="URL imagen"
                          value={editingDraft!.image_url || ''}
                          onChange={(e) =>
                            setEditingDraft({
                              ...editingDraft!,
                              image_url: e.target.value,
                            })
                          }
                        />
                      </div>
                    ) : (
                      <div style={styles.contactBody}>
                        <div style={styles.contactName}>{c.name}</div>
                        {c.email && (
                          <div style={styles.contactEmail}>{c.email}</div>
                        )}
                      </div>
                    )}

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
                      {editing ? (
                        <>
                          <button
                            type="button"
                            style={styles.actionBtn}
                            onClick={commitEdit}
                            title="Guardar"
                          >
                            💾
                          </button>
                          <button
                            type="button"
                            style={styles.actionBtn}
                            onClick={cancelEdit}
                            title="Cancelar"
                          >
                            ✕
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            style={styles.actionBtn}
                            onClick={() => beginEdit(c)}
                            title="Editar"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            style={styles.actionBtn}
                            onClick={() => handleDelete(c)}
                            title="Borrar"
                          >
                            🗑️
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
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
  createForm: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr auto',
    gap: '8px',
  },
  createField: { padding: '8px 12px', fontSize: '12px' },
  createBtn: { padding: '8px 14px', fontSize: '12px' },
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
  },
  contactEmail: {
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  editFields: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
  },
  editInput: { padding: '6px 10px', fontSize: '12px' },
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
