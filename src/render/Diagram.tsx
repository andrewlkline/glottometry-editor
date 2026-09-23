import { useCallback, useRef, useState } from 'react';
import type { Scene } from './scene.js';
import { NODE_FILL, NODE_STROKE, NODE_TEXT } from './styles.js';

export interface DiagramProps {
  scene: Scene;
  highlighted?: string | null;
  selected?: string | null;
  hidden?: Set<string>;
  onHover?: (key: string | null) => void;
  onSelect?: (key: string | null) => void;
  /** Chain layout: the user dragged a node to a new position in the order. */
  onReorder?: (language: number, toPosition: number) => void;
  /** 2-D layouts: the user dragged a node to a new place on the canvas. */
  onMove?: (language: number, x: number, y: number) => void;
}

/**
 * The glottometric diagram.
 *
 * Contours are drawn widest-first so the strong inner ones stay on top. Each
 * carries a transparent fat hit-path so hovering a 1px line is not a test of
 * mouse precision.
 *
 * Dragging behaves differently per layout, because the geometry means
 * different things. In a chain the node column *is* the ordering, so dragging
 * reorders and the contours stay rounded rectangles. In a 2-D layout position
 * is free, so a node simply moves and the routed contours reflow around it.
 */
export function Diagram({
  scene, highlighted, selected, hidden, onHover, onSelect, onReorder, onMove,
}: DiagramProps) {
  const { layout, contours, width, height } = scene;
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const isChain = layout.kind === 'chain';
  const draggable = isChain ? !!onReorder : !!onMove;

  /** Pointer position in the SVG's own coordinate system. */
  const toSvg = useCallback((event: React.PointerEvent): [number, number] | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(ctm.inverse());
    return [local.x, local.y];
  }, []);

  const handleMove = useCallback((event: React.PointerEvent, language: number) => {
    const local = toSvg(event);
    if (!local) return;

    if (isChain) {
      const top = layout.nodes[0]?.y ?? 0;
      const raw = Math.round((local[1] - top) / layout.spacing);
      const target = Math.max(0, Math.min(layout.order.length - 1, raw));
      if (layout.position[language] !== target) onReorder?.(language, target);
    } else {
      onMove?.(language, local[0], local[1]);
    }
  }, [toSvg, isChain, layout, onReorder, onMove]);

  const dimmed = highlighted != null || selected != null;
  const emphasised = highlighted ?? selected;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label="Glottometric diagram"
      style={{ maxWidth: '100%', height: 'auto', display: 'block', touchAction: 'none' }}
    >
      <rect
        width={width}
        height={height}
        fill="#fff"
        onClick={() => onSelect?.(null)}
      />

      <g fill="none" strokeLinejoin="round" strokeLinecap="round">
        {contours.map((c) => {
          if (hidden?.has(c.key)) return null;
          const active = emphasised === c.key;
          const opacity = !dimmed ? 1 : active ? 1 : 0.12;
          return (
            <g
              key={c.key}
              opacity={opacity}
              onMouseEnter={() => onHover?.(c.key)}
              onMouseLeave={() => onHover?.(null)}
              onClick={() => onSelect?.(selected === c.key ? null : c.key)}
              style={{ cursor: onSelect ? 'pointer' : undefined }}
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
          <g
            key={n.language}
            style={{ cursor: draggable ? (dragging === n.language ? 'grabbing' : 'grab') : undefined }}
            onPointerDown={(e) => {
              if (!draggable) return;
              (e.target as Element).setPointerCapture(e.pointerId);
              setDragging(n.language);
              e.stopPropagation();
            }}
            onPointerMove={(e) => {
              if (dragging !== n.language) return;
              handleMove(e, n.language);
            }}
            onPointerUp={(e) => {
              if (dragging === null) return;
              (e.target as Element).releasePointerCapture(e.pointerId);
              setDragging(null);
            }}
          >
            <circle
              cx={n.x}
              cy={n.y}
              r={layout.nodeRadius}
              fill={NODE_FILL}
              stroke={dragging === n.language ? '#06c' : NODE_STROKE}
              strokeWidth={dragging === n.language ? 2 : 1.2}
            />
            <text
              x={n.x}
              y={n.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="system-ui, sans-serif"
              fontSize={11}
              fill={NODE_TEXT}
              style={{ userSelect: 'none', pointerEvents: 'none' }}
            >
              {n.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
