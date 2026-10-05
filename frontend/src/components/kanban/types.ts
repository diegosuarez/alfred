import type { Contact } from '../ContactPicker';
import type { Attachment } from '../AttachmentsSection';

export interface Tag {
  id: number;
  name: string;
  color?: string | null;
}

export interface Reminder {
  id: number;
  task_id: number;
  remind_at: string;
}

export interface Task {
  id: number;
  title: string;
  description?: string;
  priority: string;
  due_date?: string;
  position: number;
  column_id: number;
  board_id: number;
  parent_task_id?: number | null;
  completed: boolean;
  created_at: string;
  total_focus_time: number;
  tags: Tag[];
  requester?: Contact | null;
  assignees: Contact[];
  reminders: Reminder[];
  attachments: Attachment[];
  children: Task[];
}

export interface Column {
  id: number;
  name: string;
  position: number;
  board_id: number;
  tasks: Task[];
}

export interface BoardDetail {
  id: number;
  name: string;
  description?: string;
  context_id?: number | null;
  columns: Column[];
}

export interface BoardSummary {
  id: number;
  name: string;
  context_id?: number | null;
}

/** Right-click context menu on a task card: which task + where. */
export type CardMenuState = { task: Task; x: number; y: number };
