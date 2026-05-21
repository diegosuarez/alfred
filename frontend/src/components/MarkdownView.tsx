import React from 'react';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownViewProps {
  source: string;
  /** Compact style used in card snippets (single-line clamp, no spacing). */
  compact?: boolean;
}

/** Renders markdown with sane defaults for task descriptions.
 *  Uses GFM so tables, strikethrough and task lists work out of the box.
 *  Links open in a new tab; no raw HTML allowed (react-markdown's
 *  default) so the user-supplied content is safe to render. */
export const MarkdownView: React.FC<MarkdownViewProps> = ({ source, compact }) => {
  return (
    <div style={compact ? styles.compact : styles.normal} className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  normal: {
    fontSize: '14px',
    lineHeight: 1.55,
    color: 'var(--text-primary)',
  },
  compact: {
    fontSize: '12px',
    lineHeight: 1.4,
    color: 'var(--text-secondary)',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
};
