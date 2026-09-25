/**
 * A row's quality at a glance: filled for high, hollow for low, a dash when
 * undetermined. Shape carries the distinction, so it survives greyscale
 * printing and colour-blindness; colour only reinforces it.
 */

import type { QualityClass, QualityJudgement } from '../core/quality.js';

const GLYPH: Record<QualityClass, string> = { high: '●', low: '○', undetermined: '–' };

export const QUALITY_COLOUR: Record<QualityClass, string> = {
  high: '#2a6f3e',
  low: '#b86e12',
  undetermined: '#aaa',
};

export function QualityMark({ judgement, style }: {
  judgement: QualityJudgement;
  style?: React.CSSProperties;
}) {
  const { quality, reason } = judgement;
  return (
    <span
      style={{ color: QUALITY_COLOUR[quality], fontSize: '0.7rem', width: '0.8em',
        display: 'inline-block', textAlign: 'center', flexShrink: 0, ...style }}
      title={`${quality} quality — ${reason}`}
      aria-label={`${quality} quality`}
    >
      {GLYPH[quality]}
    </span>
  );
}
