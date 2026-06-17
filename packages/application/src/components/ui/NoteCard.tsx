import React from 'react';
import { Card } from './Card';
import { Badge } from './Badge';
import { Tag } from './Tag';
import { Checkbox } from './Checkbox';

export interface NoteCardProps {
  course?: string;
  title?: string;
  snippet?: string;
  tags?: string[];
  highlights?: number;
  words?: number;
  when?: string;
  synced?: boolean;
  status?: 'clean' | 'original';
  onClick?: () => void;
  className?: string;
  /** Optional line shown beneath the title, e.g. "Shared by Ana Ruiz · Portuguese 201" */
  sharedBy?: string;
  /** When true, renders a checkbox at the start of the top row for selection mode. */
  selectable?: boolean;
  /** Whether this card is currently selected (only relevant when selectable=true). */
  selected?: boolean;
}

export const NoteCard = function NoteCard({
  course,
  title,
  snippet,
  tags = [],
  highlights,
  words,
  when,
  synced = true,
  status = 'clean',
  onClick,
  className,
  sharedBy,
  selectable = false,
  selected = false,
}: NoteCardProps) {
  return (
    <Card variant={onClick ? 'interactive' : 'default'} onClick={onClick} className={className}>
      <div className="tmn-note">
        <div className="tmn-note__top">
          {selectable && (
            <Checkbox
              checked={selected}
              onChange={onClick}
              aria-label={title ? `Select ${title}` : 'Select note'}
              onClick={(e) => e.stopPropagation()}
              style={{ marginRight: 4, flexShrink: 0 }}
            />
          )}
          {course ? <span className="tmn-note__course">{course}</span> : <span />}
          {status === 'original' ? (
            <Badge tone="warning" dot>
              Original
            </Badge>
          ) : (
            <Badge tone="success" dot>
              {synced ? 'Synced' : 'Clean'}
            </Badge>
          )}
        </div>
        {title ? <h3 className="tmn-note__title">{title}</h3> : null}
        {sharedBy ? <p className="tmn-note__shared-by">{sharedBy}</p> : null}
        {snippet ? (
          <p
            className="tmn-note__snippet"
            dangerouslySetInnerHTML={{ __html: snippet }}
          />
        ) : null}
        {tags.length ? (
          <div className="tmn-note__tags">
            {tags.map((t) => (
              <Tag key={t} hash tone="brand">
                {t}
              </Tag>
            ))}
          </div>
        ) : null}
        <div className="tmn-note__meta">
          {highlights != null ? (
            <span className="tmn-note__meta-item">{'★'} {highlights} highlights</span>
          ) : null}
          {words != null ? (
            <span className="tmn-note__meta-item">{words} words</span>
          ) : null}
          {when ? <span className="tmn-note__meta-item">{when}</span> : null}
        </div>
      </div>
    </Card>
  );
};

NoteCard.displayName = 'NoteCard';
