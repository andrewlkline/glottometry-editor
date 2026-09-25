/**
 * Quality as decoration on an already-built scene.
 *
 * Geometry is untouched — the contours are exactly those `buildScene` made,
 * from K&F's unmodified scores. The overlay only restyles them: line style
 * for what each group's exclusive support rests on, and fading for groups
 * that do not survive on high-quality evidence alone.
 */

import type { Glottometry } from '../core/metrics.js';
import { maskOf } from '../core/metrics.js';
import { exclusiveByQuality, supportClass, type QualityClass } from '../core/quality.js';
import type { Scene } from './scene.js';
import { FADED_OPACITY, supportDash } from './styles.js';

export interface QualityOverlay {
  /** Restyle lines by support class. */
  lines: boolean;
  /**
   * Whether a group, by contour key, survives on high-quality evidence alone.
   * Omit to leave everything unfaded.
   */
  survives?: (key: string) => boolean;
}

export function applyQualityOverlay(
  scene: Scene,
  g: Glottometry,
  classOf: (row: number) => QualityClass,
  overlay: QualityOverlay,
): Scene {
  if (!overlay.lines && !overlay.survives) return scene;
  return {
    ...scene,
    contours: scene.contours.map((c) => {
      const support = supportClass(
        exclusiveByQuality(g, maskOf(c.subgroup.members, g.nLanguages), classOf),
      );
      const survives = overlay.survives?.(c.key);
      return {
        ...c,
        style: {
          ...c.style,
          dasharray: overlay.lines ? supportDash(support, c.style.strokeWidth) : undefined,
          opacity: survives === false ? FADED_OPACITY : undefined,
        },
        quality: { support, survives },
      };
    }),
  };
}
