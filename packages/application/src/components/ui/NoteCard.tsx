import React from 'react';
import { Card } from './Card';
import { Badge } from './Badge';
import { Tag } from './Tag';

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
}: NoteCardProps) {
  return (
    <Card variant={onClick ? 'interactive' : 'default'} onClick={onClick} className={className}>
      <div className="tmn-note">
        <div className="tmn-note__top">
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
