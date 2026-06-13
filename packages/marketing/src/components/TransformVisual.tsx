'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ScanLine, Sparkles, Check } from 'lucide-react';
import HighlightText from './ui/HighlightText';
import Badge from './ui/Badge';
import Tag from './ui/Tag';
import SegmentedControl from './ui/SegmentedControl';

const HAND_LINES = [
  'O subjuntivo — dúvida,',
  'desejo, possibilidade.',
  'que eu fale / coma / viva',
  'tomara que chova ☂',
  '* revisar para a prova *',
];

interface TransformVisualProps {
  autoplay?: boolean;
}

export default function TransformVisual({ autoplay = false }: TransformVisualProps) {
  const [view, setView] = useState<'original' | 'clean'>('original');
  const [scanKey, setScanKey] = useState(0);
  const [cleanKey, setCleanKey] = useState(0);
  const [scanning, setScanning] = useState(false);
  const started = useRef(false);

  const goTo = useCallback((next: string) => {
    const nextView = next as 'original' | 'clean';
    setView(nextView);
    if (nextView === 'clean') {
      setScanning(true);
      setScanKey((k) => k + 1);
      setCleanKey((k) => k + 1);
    } else {
      setScanning(false);
    }
  }, []);

  // First-load transform once
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const t = setTimeout(() => goTo('clean'), 1100);
    return () => clearTimeout(t);
  }, [goTo]);

  // Optional gentle autoplay loop
  useEffect(() => {
    if (!autoplay) return;
    const id = setInterval(() => {
      setView((v) => {
        const next = v === 'clean' ? 'original' : 'clean';
        if (next === 'clean') {
          setScanning(true);
          setScanKey((k) => k + 1);
          setCleanKey((k) => k + 1);
        }
        return next;
      });
    }, 3600);
    return () => clearInterval(id);
  }, [autoplay]);

  const clean = view === 'clean';

  return (
    <div className="hero__visual" data-reveal data-delay="2">
      <div className="note-paper">
        <div className="note-paper__meta">
          <span className="note-paper__eyebrow">Portuguese 201</span>
          <span className="note-paper__detail">pt → en · 1,204 words · OCR 98%</span>
        </div>

        <div className="note-stage">
          {/* Original — faux handwriting */}
          <div
            className={`note-layer note-layer--original ${clean ? 'note-layer--hidden' : ''}`}
            aria-hidden={clean}
          >
            <div className="hand-paper">
              {HAND_LINES.map((l, i) => (
                <div
                  key={i}
                  className="hand-line"
                  style={{ transform: `rotate(${i % 2 ? -0.5 : 0.6}deg)` }}
                >
                  {l}
                </div>
              ))}
            </div>
          </div>

          {/* Clean — transformed note */}
          <div
            className={`note-layer note-layer--clean ${clean ? '' : 'note-layer--hidden'}`}
            aria-hidden={!clean}
            key={`clean-${cleanKey}`}
          >
            <div className="clean-note">
              <h3 className="clean-note__title">The subjunctive mood</h3>
              <p className="clean-note__body">
                The <HighlightText animate={clean}>subjunctive</HighlightText> expresses doubt,
                desire and possibility — three verb patterns across <em>-ar</em>, <em>-er</em>,{' '}
                <em>-ir</em>.
              </p>
              <p className="clean-note__es">que eu fale · que você coma · que ele viva</p>
              <div className="clean-note__tags">
                <Tag hash tone="brand">
                  subjunctive
                </Tag>
                <Tag hash>verbs</Tag>
              </div>
            </div>
          </div>

          {scanning ? (
            <div
              className="note-scan note-scan--run"
              key={`scan-${scanKey}`}
              onAnimationEnd={() => setScanning(false)}
              aria-hidden
            />
          ) : null}
        </div>

        <div className="note-paper__foot">
          <SegmentedControl
            value={view}
            onChange={goTo}
            options={[
              { value: 'original', label: 'Original', icon: <ScanLine size={15} aria-hidden /> },
              { value: 'clean', label: 'Clean', icon: <Sparkles size={15} aria-hidden /> },
            ]}
          />
          <Badge tone="success" dot>
            12 highlights
          </Badge>
        </div>
      </div>

      <div className={`hero__chip ${clean ? '' : 'hero__chip--hidden'}`}>
        <span className="hero__chip-ico">
          <Check size={15} aria-hidden />
        </span>
        Note transformed in seconds
      </div>
    </div>
  );
}
