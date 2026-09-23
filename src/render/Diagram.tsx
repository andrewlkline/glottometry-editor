import type { Scene } from './scene.js';
import { NODE_FILL, NODE_STROKE, NODE_TEXT } from './styles.js';

export interface DiagramProps {
  scene: Scene;
  /** Subgroup key currently hovered, if any. */
  highlighted?: string | null;
  onHover?: (key: string | null) => void;
}

/**
 * The glottometric diagram.
 *
 * Contours are drawn widest-first so the strong inner ones stay on top. Each
 * carries a transparent fat hit-path so hovering a 1px line is not a test of
 * mouse precision.
 */
export function Diagram({ scene, highlighted, onHover }: DiagramProps) {
  const { layout, contours, width, height } = scene;
  const dimmed = highlighted != null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label="Glottometric diagram"
      style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
    >
      <rect width={width} height={height} fill="#fff" />

      <g fill="none" strokeLinejoin="round" strokeLinecap="round">
        {contours.map((c) => {
          const active = highlighted === c.key;
          const opacity = !dimmed ? 1 : active ? 1 : 0.12;
          return (
            <g
              key={c.key}
              opacity={opacity}
              onMouseEnter={() => onHover?.(c.key)}
              onMouseLeave={() => onHover?.(null)}
              style={{ cursor: onHover ? 'pointer' : undefined }}
            >
              {/* Invisible, generous hit area. */}
              {c.paths.map((d, i) => (
                <path key={`hit-${i}`} d={d} stroke="transparent" strokeWidth={14} />
              ))}
              {c.paths.map((d, i) => (
                <path
                  key={`path-${i}`}
                  d={d}
                  stroke={c.style.stroke}
                  strokeWidth={c.style.strokeWidth}
                />
              ))}
            </g>
          );
        })}
      </g>

      <g>
        {layout.nodes.map((n) => (
          <g key={n.language}>
            <circle
              cx={n.x}
              cy={n.y}
              r={layout.nodeRadius}
              fill={NODE_FILL}
              stroke={NODE_STROKE}
              strokeWidth={1.2}
            />
            <text
              x={n.x}
              y={n.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="system-ui, sans-serif"
              fontSize={11}
              fill={NODE_TEXT}
            >
              {n.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
