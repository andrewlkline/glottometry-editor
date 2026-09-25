/**
 * A row's quality at a glance: filled for high, hollow for low, a dash when
 * undetermined. Shape carries the distinction, so it survives greyscale
 * printing and colour-blindness; colour only reinforces it.
 */

import type { QualityJudgement } from '../core/quality.js';
import { QUALITY_COLOUR, QUALITY_GLYPH as GLYPH } from '../render/styles.js';

export { QUALITY_COLOUR };

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
