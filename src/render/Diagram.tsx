import { useCallback, useRef, useState } from 'react';
import type { Scene } from './scene.js';
import {
  fitLabel, labelHalfWidth, NODE_FILL, NODE_STROKE, NODE_TEXT, QUALITY_COLOUR, QUALITY_GLYPH, TREE_STROKE,
} from './styles.js';
import { TREE_TEXT, byClade, type TreeDrawing } from './treeDrawing.js';

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
  /**
   * The drag finished.
   *
   * A drag emits an edit per pointer move; this marks where the gesture ends
   * so history can treat the whole thing as one undo, rather than relying on
   * the coalescing time window to guess.
   */
  onDragEnd?: () => void;
  /**
   * Fill for a language's node, overriding the flat default.
   *
   * Used to tint by connected component in the fragmentation view, which makes
   * the current partition legible on the diagram itself rather than only in a
   * side panel.
   */
  nodeFill?: (language: number) => string | undefined;
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
  scene, highlighted, selected, hidden, onHover, onSelect, onReorder, onMove, onDragEnd,
  nodeFill,
}: DiagramProps) {
  const { layout, contours, width, height, viewBox } = scene;
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
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      width={width}
      height={height}
      role="img"
      aria-label="Glottometric diagram"
      style={{ maxWidth: '100%', height: 'auto', display: 'block', touchAction: 'none' }}
    >
      <rect
        x={viewBox.x}
        y={viewBox.y}
        width={viewBox.width}
        height={viewBox.height}
        fill="#fff"
        onClick={() => onSelect?.(null)}
      />

      {scene.tree && (
        <TreeLayer
          tree={scene.tree}
          emphasised={emphasised}
          dimmed={dimmed}
          onSelect={onSelect}
          onHover={onHover}
          selected={selected}
        />
      )}

      <g fill="none" strokeLinejoin="round" strokeLinecap="round">
        {contours.map((c) => {
          if (hidden?.has(c.key)) return null;
          const active = emphasised === c.key;
          const opacity = (c.style.opacity ?? 1) * (!dimmed ? 1 : active ? 1 : 0.12);
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
                  strokeDasharray={c.style.dasharray}
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
              onDragEnd?.();
            }}
            onPointerCancel={() => {
              if (dragging === null) return;
              setDragging(null);
              onDragEnd?.();
            }}
          >
            <NodeShape
              node={n}
              nodeRadius={layout.nodeRadius}
              fill={nodeFill?.(n.language) ?? NODE_FILL}
              active={dragging === n.language}
            />
          </g>
        ))}
      </g>
    </svg>
  );
}

/** A node drawn as a pill wide enough for its label. */
function NodeShape({ node, nodeRadius, fill, active }: {
  node: { x: number; y: number; label: string };
  nodeRadius: number;
  fill: string;
  active: boolean;
}) {
  const half = labelHalfWidth(node.label, nodeRadius);
  const text = fitLabel(node.label, half);

  return (
    <>
      <rect
        x={node.x - half}
        y={node.y - nodeRadius}
        width={half * 2}
        height={nodeRadius * 2}
        rx={nodeRadius}
        fill={fill}
        stroke={active ? '#06c' : NODE_STROKE}
        strokeWidth={active ? 2 : 1.2}
      />
      <text
        x={node.x}
        y={node.y}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="system-ui, sans-serif"
        fontSize={11}
        fill={NODE_TEXT}
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {text}
        {text !== node.label && <title>{node.label}</title>}
      </text>
    </>
  );
}

/**
 * The hypothesis tree, one group per clade so that hovering shows its full
 * list of defining innovations and clicking selects it, as a contour would.
 */
function TreeLayer({ tree, emphasised, dimmed, selected, onSelect, onHover }: {
  tree: TreeDrawing;
  emphasised: string | null | undefined;
  dimmed: boolean;
  selected: string | null | undefined;
  onSelect?: (key: string | null) => void;
  onHover?: (key: string | null) => void;
}) {
  return (
    <g fill="none" stroke={TREE_STROKE} strokeLinecap="round" fontFamily="system-ui, sans-serif">
      {byClade(tree).map((clade) => {
        const isClade = clade.id !== '';
        const active = isClade && emphasised === clade.id;
        const opacity = !dimmed || !isClade ? 1 : active ? 1 : 0.3;
        return (
          <g
            key={clade.id || 'root'}
            opacity={opacity}
            onClick={isClade ? () => onSelect?.(selected === clade.id ? null : clade.id) : undefined}
            onMouseEnter={isClade ? () => onHover?.(clade.id) : undefined}
            onMouseLeave={isClade ? () => onHover?.(null) : undefined}
            style={{ cursor: isClade && onSelect ? 'pointer' : undefined }}
          >
            {tree.titles[clade.id] && <title>{tree.titles[clade.id]}</title>}
            {clade.lines.map((l, i) => (
              <g key={i}>
                {isClade && <path d={l.d} stroke="transparent" strokeWidth={12} />}
                <path d={l.d} strokeWidth={active ? 3.4 : isClade ? 2 : 1.4} />
              </g>
            ))}
            {clade.texts.map((t, i) => {
              const st = TREE_TEXT[t.role];
              return (
                <text
                  key={i} x={t.x} y={t.y} textAnchor="end" stroke="none"
                  fontSize={st.size} fill={st.fill} fontWeight={st.weight}
                  fontStyle={st.italic ? 'italic' : undefined}
                >
                  {t.mark && <tspan fill={QUALITY_COLOUR[t.mark]}>{QUALITY_GLYPH[t.mark]} </tspan>}
                  {t.text}
                </text>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}
