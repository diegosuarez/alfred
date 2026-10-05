import React from 'react';
import { Avatar } from '../Avatar';
import { MarkdownView } from '../MarkdownView';
import { useAuthedImage } from '../../hooks/useAuthedImage';
import type { CardMenuState, Task } from './types';
import { formatFocusTime, getPriorityLabel, relativeCreated } from './utils';

const CardCoverImage: React.FC<{ url: string; alt: string }> = ({ url, alt }) => {
  const src = useAuthedImage(url);
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      style={{
        width: 'calc(100% + 32px)',
        marginLeft: '-16px',
        marginRight: '-16px',
        marginTop: '8px',
        marginBottom: '8px',
        height: '120px',
        objectFit: 'cover',
        display: 'block',
        borderRadius: '4px',
      }}
    />
  );
};

interface TaskCardProps {
  task: Task;
  columnId: number;
  dropIndex: number | null;
  isChild?: boolean;
  draggingTaskId: number | null;
  handleDragStart: (e: React.DragEvent, taskId: number) => void;
  handleDragEnd: () => void;
  handleCardDragOver: (
    e: React.DragEvent,
    columnId: number,
    visibleIndex: number,
  ) => void;
  handleTaskDrop: (
    e: React.DragEvent,
    targetColId: number,
    visibleIndex: number,
    targetTaskId: number,
  ) => Promise<void>;
  setSelectedTask: (task: Task) => void;
  setCardMenu: (menu: CardMenuState) => void;
  onStartFocus: (task: { id: number; title: string }) => void;
}

/** Render a single task card. `dropIndex` is null for non-draggable
 * subtask cards (the column-level drop handler does its own indexing). */
export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  columnId,
  dropIndex,
  isChild,
  draggingTaskId,
  handleDragStart,
  handleDragEnd,
  handleCardDragOver,
  handleTaskDrop,
  setSelectedTask,
  setCardMenu,
  onStartFocus,
}) => {
  const draggable = dropIndex !== null;
  // Priority drives the card background tint. Medium keeps the default
  // glass surface; high gets a soft red, low gets a soft blue.
  const priorityBackground =
    task.priority === 'high'
      ? 'rgba(239, 68, 68, 0.15)'
      : task.priority === 'low'
      ? 'rgba(59, 130, 246, 0.13)'
      : undefined;
  return (
    <div
      className="glass-card"
      style={{
        ...styles.taskCard,
        ...(isChild ? styles.childTaskCard : {}),
        ...(task.completed ? styles.completedTaskCard : {}),
        ...(priorityBackground ? { background: priorityBackground } : {}),
        ...(draggingTaskId === task.id ? styles.draggingCard : {}),
      }}
      draggable={draggable}
      onDragStart={draggable ? (e) => handleDragStart(e, task.id) : undefined}
      onDragEnd={draggable ? handleDragEnd : undefined}
      onDragOver={
        draggable
          ? (e) => handleCardDragOver(e, columnId, dropIndex as number)
          : undefined
      }
      onDrop={
        draggable
          ? (e) =>
              handleTaskDrop(
                e,
                columnId,
                dropIndex as number,
                task.id,
              )
          : undefined
      }
      onClick={() => setSelectedTask(task)}
      onContextMenu={(e) => {
        e.preventDefault();
        setCardMenu({ task, x: e.clientX, y: e.clientY });
      }}
      title={`Prioridad: ${getPriorityLabel(task.priority)} · Shift+arrastrar para anidar · clic derecho para acciones`}
    >
      <div style={styles.taskCardHeader}>
        {/* Tags take the header slot the priority badge used to occupy. */}
        {(task.tags ?? []).length > 0 ? (
          <div style={styles.headerTags}>
            {(task.tags ?? []).map((tag) => (
              <span
                key={tag.id}
                style={{
                  ...styles.tagChip,
                  ...(tag.color
                    ? { borderColor: tag.color, color: tag.color }
                    : {}),
                }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        ) : (
          <span />
        )}
        <div style={styles.headerBadges}>
          {task.total_focus_time > 0 && (
            <span style={styles.focusTimeBadge}>
              ⏱️ {formatFocusTime(task.total_focus_time)}
            </span>
          )}
          {(task.children ?? []).length > 0 && (
            <span style={styles.subtaskCounter}>
              ☑ {(task.children ?? []).filter((s) => s.completed).length}/
              {(task.children ?? []).length}
            </span>
          )}
          {(task.reminders ?? []).length > 0 && (
            <span
              style={styles.reminderBadge}
              title={`${(task.reminders ?? []).length} recordatorio${
                (task.reminders ?? []).length === 1 ? '' : 's'
              }`}
            >
              🔔 {(task.reminders ?? []).length}
            </span>
          )}
          {(task.attachments ?? []).length > 0 &&
            !(task.attachments ?? []).some((a) => a.is_image) && (
              <span
                style={styles.attachmentBadge}
                title={`${(task.attachments ?? []).length} adjunto${
                  (task.attachments ?? []).length === 1 ? '' : 's'
                }`}
              >
                📎 {(task.attachments ?? []).length}
              </span>
            )}
        </div>
      </div>
      {/* Cover image: first image attachment renders as a thumbnail
          strip across the top of the card body. */}
      {(() => {
        const cover = (task.attachments ?? []).find((a) => a.is_image);
        if (!cover) return null;
        return <CardCoverImage url={cover.url} alt={cover.filename} />;
      })()}
      <h4
        style={{
          ...styles.taskTitle,
          ...(task.completed ? styles.taskTitleDone : {}),
        }}
      >
        {task.title}
      </h4>
      {task.description && (
        <div style={styles.taskDesc}>
          <MarkdownView source={task.description} compact />
        </div>
      )}
      {(task.requester || task.assignees.length > 0) && (
        <div style={styles.peopleRow}>
          {task.requester && (
            <span
              style={styles.peopleGroup}
              title={`Encargada por ${task.requester.name}`}
            >
              <span style={styles.peopleLabel}>de</span>
              <Avatar
                name={task.requester.name}
                imageUrl={task.requester.image_url}
                size={20}
              />
            </span>
          )}
          {task.assignees.length > 0 && (
            <span
              style={styles.peopleGroup}
              title={`Asignado a ${task.assignees.map((c) => c.name).join(', ')}`}
            >
              <span style={styles.peopleLabel}>→</span>
              <div style={styles.assigneeStack}>
                {task.assignees.slice(0, 3).map((c) => (
                  <span key={c.id} style={styles.assigneeAvatar}>
                    <Avatar name={c.name} imageUrl={c.image_url} size={20} />
                  </span>
                ))}
                {task.assignees.length > 3 && (
                  <span style={styles.assigneeMore}>
                    +{task.assignees.length - 3}
                  </span>
                )}
              </div>
            </span>
          )}
        </div>
      )}
      <div style={styles.taskFooter}>
        <div style={styles.footerMeta}>
          {task.due_date && (
            <span style={styles.dueDate}>
              📅 {new Date(task.due_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
            </span>
          )}
          <span
            style={styles.createdHint}
            title={`Creada el ${new Date(task.created_at).toLocaleString('es-ES')}`}
          >
            {relativeCreated(task.created_at)}
          </span>
        </div>
        <button
          className="glass-button"
          style={styles.focusTaskBtn}
          onClick={(e) => {
            e.stopPropagation();
            onStartFocus({ id: task.id, title: task.title });
          }}
          title="Empezar a concentrarse"
        >
          ⏱️
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  taskCard: {
    padding: '16px',
    cursor: 'pointer',
  },
  draggingCard: {
    opacity: 0.4,
  },
  taskCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  },
  priorityBadge: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#ffffff',
    padding: '2px 8px',
    borderRadius: '10px',
  },
  headerTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    flex: 1,
    minWidth: 0,
  },
  headerBadges: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    flexShrink: 0,
  },
  footerMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
    minWidth: 0,
  },
  createdHint: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
  },
  focusTimeBadge: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
  },
  taskTitle: {
    fontSize: '14px',
    fontWeight: 600,
    marginBottom: '6px',
    lineHeight: 1.4,
  },
  taskDesc: {
    // Inner MarkdownView (compact) handles the 2-line clamp; this wrapper
    // just owns the spacing around the snippet.
    marginBottom: '12px',
  },
  taskFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dueDate: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
  },
  focusTaskBtn: {
    padding: '4px 8px',
    fontSize: '12px',
    boxShadow: 'none',
  },
  tagChipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    marginTop: '8px',
  },
  tagChip: {
    fontSize: '10px',
    padding: '2px 8px',
    borderRadius: '999px',
    border: '1px solid rgba(255,255,255,0.15)',
    color: 'var(--text-secondary)',
    background: 'rgba(255,255,255,0.03)',
    letterSpacing: '0.3px',
  },
  subtaskCounter: {
    fontSize: '10px',
    color: 'var(--text-secondary)',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid var(--glass-border)',
    borderRadius: '999px',
    padding: '2px 8px',
    letterSpacing: '0.3px',
  },
  childTaskCard: {
    // Slightly smaller so a child reads as "related to" the parent
    // without losing the full task-card identity.
    padding: '12px 14px',
  },
  completedTaskCard: {
    opacity: 0.6,
  },
  taskTitleDone: {
    textDecoration: 'line-through',
    color: 'var(--text-muted)',
  },
  reminderBadge: {
    fontSize: '10px',
    color: 'var(--accent-warning)',
    background: 'rgba(245,158,11,0.12)',
    border: '1px solid rgba(245,158,11,0.45)',
    borderRadius: '999px',
    padding: '2px 8px',
  },
  attachmentBadge: {
    fontSize: '10px',
    color: 'var(--text-secondary)',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '999px',
    padding: '2px 8px',
  },
  peopleRow: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    marginTop: '8px',
    marginBottom: '4px',
    flexWrap: 'wrap',
  },
  peopleGroup: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  peopleLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  assigneeStack: {
    display: 'inline-flex',
    alignItems: 'center',
  },
  assigneeAvatar: {
    marginLeft: '-4px',
    border: '1.5px solid var(--glass-bg)',
    borderRadius: '50%',
    display: 'inline-flex',
  },
  assigneeMore: {
    marginLeft: '4px',
    fontSize: '10px',
    color: 'var(--text-muted)',
  },
};
