import React, { useRef, useState } from 'react';

import { api, getToken } from '../services/api';
import { useAuthedImage } from '../hooks/useAuthedImage';

export interface Attachment {
  id: number;
  task_id: number;
  filename: string;
  content_type: string;
  size: number;
  is_image: boolean;
  url: string;
  created_at: string;
}

interface AttachmentsSectionProps {
  taskId: number;
  attachments: Attachment[];
  onChanged: () => void;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const ImageTile: React.FC<{
  att: Attachment;
  onDelete: () => void;
  onPreview: () => void;
}> = ({ att, onDelete, onPreview }) => {
  const src = useAuthedImage(att.url);
  return (
    <div style={styles.tile}>
      <button
        type="button"
        style={styles.imageBtn}
        onClick={onPreview}
        title={att.filename}
      >
        {src ? (
          <img src={src} alt={att.filename} style={styles.imageThumb} />
        ) : (
          <div style={styles.imagePlaceholder}>…</div>
        )}
      </button>
      <div style={styles.tileMeta}>
        <span style={styles.filename} title={att.filename}>
          {att.filename}
        </span>
        <span style={styles.size}>{formatBytes(att.size)}</span>
      </div>
      <button
        type="button"
        style={styles.tileDelete}
        onClick={onDelete}
        title="Borrar adjunto"
      >
        ✕
      </button>
    </div>
  );
};

/** Download `att` by hitting the authed endpoint as a blob and pushing
 *  a synthetic anchor click. Works for any content type. */
async function downloadAttachment(att: Attachment): Promise<void> {
  const token = getToken();
  const resp = await fetch(att.url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!resp.ok) {
    alert('No se pudo descargar el adjunto');
    return;
  }
  const blob = await resp.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = att.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
}

export const AttachmentsSection: React.FC<AttachmentsSectionProps> = ({
  taskId,
  attachments,
  onChanged,
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewAtt, setPreviewAtt] = useState<Attachment | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setUploading(true);
    try {
      for (const f of arr) {
        try {
          await api.uploadAttachment(taskId, f);
        } catch (err: any) {
          alert(`Error subiendo "${f.name}": ${err.message}`);
        }
      }
      onChanged();
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  // Clipboard paste — pick up images (and other files) pasted while the
  // attachments section is mounted. Listens on document so the user can
  // paste anywhere in the modal.
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const f = items[i].getAsFile();
        if (f) files.push(f);
      }
      if (files.length) {
        uploadFiles(files);
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  return (
    <div>
      {/* Drop / paste zone */}
      <div
        style={{
          ...styles.dropZone,
          ...(dragOver ? styles.dropZoneActive : {}),
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files) {
              uploadFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />
        <span style={styles.dropHint}>
          {uploading
            ? 'Subiendo…'
            : '📎 Arrastra archivos aquí, pega desde el portapapeles o haz click'}
        </span>
      </div>

      {/* Listing */}
      {attachments.length > 0 && (
        <div style={styles.list}>
          {attachments.map((att) =>
            att.is_image ? (
              <ImageTile
                key={att.id}
                att={att}
                onPreview={() => setPreviewAtt(att)}
                onDelete={async () => {
                  if (!confirm(`¿Borrar "${att.filename}"?`)) return;
                  try {
                    await api.deleteAttachment(att.id);
                    onChanged();
                  } catch (err: any) {
                    alert(err.message);
                  }
                }}
              />
            ) : (
              <div key={att.id} style={styles.docRow}>
                <span style={styles.docIcon}>📄</span>
                <div style={styles.docMeta}>
                  <span style={styles.filename} title={att.filename}>
                    {att.filename}
                  </span>
                  <span style={styles.size}>{formatBytes(att.size)}</span>
                </div>
                <button
                  type="button"
                  style={styles.docAction}
                  onClick={() => downloadAttachment(att)}
                  title="Descargar"
                >
                  ⬇
                </button>
                <button
                  type="button"
                  style={styles.docAction}
                  onClick={async () => {
                    if (!confirm(`¿Borrar "${att.filename}"?`)) return;
                    try {
                      await api.deleteAttachment(att.id);
                      onChanged();
                    } catch (err: any) {
                      alert(err.message);
                    }
                  }}
                  title="Borrar"
                >
                  ✕
                </button>
              </div>
            ),
          )}
        </div>
      )}

      {/* Lightbox preview for images */}
      {previewAtt && (
        <ImagePreviewOverlay
          att={previewAtt}
          onClose={() => setPreviewAtt(null)}
        />
      )}
    </div>
  );
};

const ImagePreviewOverlay: React.FC<{
  att: Attachment;
  onClose: () => void;
}> = ({ att, onClose }) => {
  const src = useAuthedImage(att.url);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div style={styles.previewOverlay} onClick={onClose}>
      {src ? (
        <img src={src} alt={att.filename} style={styles.previewImg} />
      ) : (
        <span style={{ color: 'white' }}>…</span>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  dropZone: {
    border: '1px dashed rgba(255,255,255,0.18)',
    borderRadius: '8px',
    padding: '16px',
    textAlign: 'center',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '12px',
    transition: 'var(--transition-smooth)',
  },
  dropZoneActive: {
    borderColor: 'var(--primary)',
    background: 'rgba(99,102,241,0.12)',
    color: 'var(--text-primary)',
  },
  dropHint: {
    fontSize: '12px',
  },
  list: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    marginTop: '12px',
  },
  tile: {
    width: '140px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    position: 'relative',
  },
  imageBtn: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: '8px',
    padding: 0,
    height: '100px',
    overflow: 'hidden',
    cursor: 'zoom-in',
  },
  imageThumb: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-muted)',
  },
  tileMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  filename: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '90px',
    color: 'var(--text-primary)',
  },
  size: {},
  tileDelete: {
    position: 'absolute',
    top: '4px',
    right: '4px',
    background: 'rgba(0,0,0,0.55)',
    border: 'none',
    borderRadius: '50%',
    width: '22px',
    height: '22px',
    color: 'white',
    cursor: 'pointer',
    fontSize: '11px',
  },
  docRow: {
    flex: '1 1 240px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: '8px',
    padding: '8px 12px',
  },
  docIcon: {
    fontSize: '20px',
  },
  docMeta: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  docAction: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '13px',
  },
  previewOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.85)',
    zIndex: 200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'zoom-out',
  },
  previewImg: {
    maxWidth: '95vw',
    maxHeight: '90vh',
    borderRadius: '8px',
    boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
  },
};
