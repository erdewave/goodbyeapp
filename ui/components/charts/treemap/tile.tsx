import { memo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";
import type { TreemapTile } from "./model";

// Plain and memoised on purpose: a map holds thousands of tiles, so they carry no handlers or context
// (TreemapPlot delegates events) and only re-render when their own props change.
export const TreemapCell = memo(function TreemapCell({
  tile,
  plotWidth,
  plotHeight,
  selected,
  tabbable,
  formatValue,
  className,
  renderTile,
}: {
  tile: TreemapTile;
  plotWidth: number;
  plotHeight: number;
  selected: boolean;
  tabbable: boolean;
  formatValue: (value: number) => string;
  className?: string;
  renderTile?: (tile: TreemapTile) => ReactNode;
}) {
  return (
    <button
      type="button"
      data-treemap-tile={tile.id}
      tabIndex={tabbable ? 0 : -1}
      aria-label={[tile.path.join(" / "), formatValue(tile.value), t.ofTotal((tile.share * 100).toFixed(1)), tile.description]
        .filter(Boolean)
        .join(". ")}
      aria-pressed={selected}
      className={cn(
        "absolute overflow-hidden border border-popover text-left outline-none transition-[filter] duration-150 hover:brightness-115 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/50",
        // Inset rings need no z-index; changing z-index on one of thousands of positioned tiles relayouts them all.
        selected && "ring-2 ring-inset ring-foreground",
        className,
      )}
      style={{
        left: `${(tile.x / plotWidth) * 100}%`,
        top: `${(tile.y / plotHeight) * 100}%`,
        width: `${(tile.width / plotWidth) * 100}%`,
        height: `${(tile.height / plotHeight) * 100}%`,
        // 4px corners, smaller on small tiles so they stay squares rather than dots.
        borderRadius: Math.min(4, tile.width / 5, tile.height / 5),
        backgroundColor: tile.color,
        color: tile.textColor,
      }}
    >
      {renderTile ? (
        <span aria-hidden="true" className="absolute inset-x-2 top-2 min-w-0 sm:inset-x-3 sm:top-3">
          {renderTile(tile)}
        </span>
      ) : null}
    </button>
  );
});
