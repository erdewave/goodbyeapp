import { memo, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";
import { useTreemap } from "./context";
import type { TreemapFrame, TreemapTile } from "./model";
import { TreemapCell } from "./tile";

export interface TreemapPlotProps {
  /** Sets the plot height; default 20rem. The layout follows its measured dimensions. */
  className?: string;
  tileClassName?: string;
  /** Return presentation content only; each tile already owns its button and accessible name. */
  renderTile?: (tile: TreemapTile) => ReactNode;
}

const pct = (value: number, of: number) => `${(value / of) * 100}%`;

// A folder: clickable by its header and the gutter around its children. Memoised like the tiles. Its
// selection ring is a separate overlay (see TreemapPlot): children paint over a ring drawn on the frame itself.
const TreemapFrameBox = memo(function TreemapFrameBox({
  frame,
  plotWidth,
  plotHeight,
  formatValue,
}: {
  frame: TreemapFrame;
  plotWidth: number;
  plotHeight: number;
  formatValue: (value: number) => string;
}) {
  return (
    <div
      aria-hidden="true"
      data-treemap-frame={frame.id}
      className="absolute cursor-pointer overflow-hidden rounded-md border border-border transition-colors duration-150 hover:bg-foreground/[0.04]"
      style={{
        left: pct(frame.x, plotWidth),
        top: pct(frame.y, plotHeight),
        width: pct(frame.width, plotWidth),
        height: pct(frame.height, plotHeight),
        backgroundColor: frame.color,
        color: frame.textColor,
      }}
    >
      {frame.header ? (
        <span className="block truncate px-1.5 text-[10px] leading-[13px] font-medium">
          {frame.label} ({formatValue(frame.value)})
        </span>
      ) : null}
    </div>
  );
});

const idOf = (target: EventTarget, attribute: "treemapTile" | "treemapFrame") =>
  (target as Element).closest<HTMLElement>(attribute === "treemapTile" ? "[data-treemap-tile]" : "[data-treemap-frame]")
    ?.dataset[attribute];

export function TreemapPlot({ className, tileClassName, renderTile }: TreemapPlotProps) {
  const { tiles, frames, size, formatValue, plotRef, setSize, cursor, selectedId, setActive, setTooltipOpen, setHoveredId, hoverTile } =
    useTreemap();
  const focusedId = useRef<string | null>(null);
  const hoverId = useRef<string | null>(null);
  const tileButton = (id: string) =>
    plotRef.current?.querySelector<HTMLButtonElement>(`[data-treemap-tile="${CSS.escape(id)}"]`);
  useLayoutEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    const measure = () => {
      const { width, height } = plot.getBoundingClientRect();
      if (width > 0 && height > 0)
        setSize((size) =>
          size.width === width && size.height === height ? size : { width, height },
        );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(plot);
    return () => observer.disconnect();
  }, [plotRef, setSize]);
  useLayoutEffect(() => {
    const id = focusedId.current;
    if (!id || tiles.some((tile) => tile.id === id)) return;
    focusedId.current = null;
    if (document.activeElement === document.body || !document.activeElement?.isConnected) {
      const replacement = tiles[cursor.activeIndex];
      if (replacement) tileButton(replacement.id)?.focus();
      else plotRef.current?.focus();
    }
  });
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLButtonElement)) return;
    const id = event.target.dataset.treemapTile;
    const current = tiles.find((tile) => tile.id === id);
    if (!current) return;
    if (event.key === "Escape") {
      setTooltipOpen(false);
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key))
      return;
    event.preventDefault();
    let next = current;
    if (event.key === "Home") next = tiles[0];
    else if (event.key === "End") next = tiles[tiles.length - 1];
    else {
      const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
      const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      const cx = current.x + current.width / 2;
      const cy = current.y + current.height / 2;
      let best = Number.POSITIVE_INFINITY;
      for (const tile of tiles) {
        const dx = tile.x + tile.width / 2 - cx;
        const dy = tile.y + tile.height / 2 - cy;
        const forward = (horizontal ? dx : dy) * direction;
        const cross = Math.abs(horizontal ? dy : dx);
        const score = forward + cross * 2;
        if (forward > 0.01 && score < best) {
          next = tile;
          best = score;
        }
      }
    }
    setTooltipOpen(true);
    if (next.id !== current.id) tileButton(next.id)?.focus();
  };
  const tabbableId = tiles[cursor.activeIndex]?.id;
  const selectedFrame = frames.find((frame) => frame.id === selectedId);
  return (
    // biome-ignore lint/a11y/useSemanticElements: This group is a chart, not a collection of form fields.
    <div
      ref={plotRef}
      role="group"
      aria-label={t.chartTiles}
      tabIndex={-1}
      data-slot="treemap-plot"
      className={cn(
        "relative h-80 w-full min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        const id = idOf(event.target, "treemapTile") ?? idOf(event.target, "treemapFrame");
        if (id) setActive(id);
      }}
      onPointerOver={(event) => {
        if (event.pointerType === "touch") return;
        const id = idOf(event.target, "treemapTile") ?? null;
        if (id === hoverId.current) return;
        hoverId.current = id;
        hoverTile(id);
      }}
      onFocus={(event) => {
        const id = idOf(event.target, "treemapTile");
        if (!id) return;
        focusedId.current = id;
        cursor.moveTo(id);
        setHoveredId(id);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          focusedId.current = null;
          setTooltipOpen(false);
        }
      }}
      onPointerLeave={() => {
        hoverId.current = null;
        hoverTile(null);
        setTooltipOpen(false);
      }}
    >
      {frames.map((frame) => (
        <TreemapFrameBox
          key={frame.id}
          frame={frame}
          plotWidth={size.width}
          plotHeight={size.height}
          formatValue={formatValue}
        />
      ))}
      {tiles.map((tile) => (
        <TreemapCell
          key={tile.id}
          tile={tile}
          plotWidth={size.width}
          plotHeight={size.height}
          selected={tile.id === selectedId}
          tabbable={tile.id === tabbableId}
          formatValue={formatValue}
          className={tileClassName}
          renderTile={renderTile}
        />
      ))}
      {selectedFrame ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-md ring-2 ring-inset ring-foreground"
          style={{
            left: pct(selectedFrame.x, size.width),
            top: pct(selectedFrame.y, size.height),
            width: pct(selectedFrame.width, size.width),
            height: pct(selectedFrame.height, size.height),
          }}
        />
      ) : null}
      {!tiles.length ? (
        <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {t.chartEmpty}
        </p>
      ) : null}
    </div>
  );
}
