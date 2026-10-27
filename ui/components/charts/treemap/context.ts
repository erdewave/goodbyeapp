import { useReducedMotion } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { useHoverCapable } from "@/lib/hooks/use-hover-capable";
import { useRowCursor } from "@/lib/hooks/use-row-cursor";
import { buildTreemap, layoutTreemap, TREEMAP_COLORS, type TreemapNode } from "./model";

const defaultFormat = (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: 2 });

export interface TreemapProps extends ComponentProps<"section"> {
  /** Flat leaves or nested groups. Tile area uses leaf values; groups sum their descendants. */
  data: readonly TreemapNode[];
  label?: string;
  formatValue?: (value: number) => string;
  /** Top-level palette; nodes can override their inherited color and textColor. */
  colors?: readonly string[];
  textColor?: string;
  activeId?: string | null;
  defaultActiveId?: string | null;
  onActiveChange?: (id: string | null) => void;
}

export function useTreemapModel({
  data,
  label = "Treemap",
  formatValue = defaultFormat,
  colors = TREEMAP_COLORS,
  textColor = "#ffffff",
  activeId,
  defaultActiveId = null,
  onActiveChange,
}: TreemapProps) {
  const model = useMemo(() => buildTreemap(data, colors, textColor), [data, colors, textColor]);
  const [size, setSize] = useState({ width: 1000, height: 625 });
  const { tiles, frames } = useMemo(
    () => layoutTreemap(model.nodes, size.width, size.height),
    [model.nodes, size],
  );
  const cursor = useRowCursor(tiles, "");
  const [internalId, setInternalId] = useState(defaultActiveId);
  // A selection can be a tile or a folder frame.
  if (internalId !== null && !tiles.some((tile) => tile.id === internalId) && !frames.some((frame) => frame.id === internalId))
    setInternalId(null);
  const requestedId = activeId === undefined ? internalId : activeId;
  const active = tiles.find((tile) => tile.id === requestedId) ?? null;
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hovered = tiles.find((tile) => tile.id === hoveredId) ?? null;
  const plotRef = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const tooltipId = useId();
  const latest = useRef({ activeId, requestedId, onActiveChange, tooltipOpen });
  useLayoutEffect(() => {
    latest.current = { activeId, requestedId, onActiveChange, tooltipOpen };
  });
  // The name shows after the pointer rests on a tile; once open it follows the
  // pointer across tiles, and a short close delay bridges the seams between them.
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hoverTile = useCallback((id: string | null) => {
    clearTimeout(hoverTimer.current);
    if (id === null) {
      hoverTimer.current = setTimeout(() => setTooltipOpen(false), 100);
      return;
    }
    setHoveredId(id);
    if (!latest.current.tooltipOpen) hoverTimer.current = setTimeout(() => setTooltipOpen(true), 600);
  }, []);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  const setActive = useCallback((id: string | null) => {
    const current = latest.current;
    if (current.activeId === undefined) setInternalId(id);
    if (current.requestedId !== id) current.onActiveChange?.(id);
  }, []);
  const registerButton = useCallback((id: string, node: HTMLButtonElement | null) => {
    if (node) buttons.current.set(id, node);
    else buttons.current.delete(id);
  }, []);
  return {
    ...model,
    tiles,
    frames,
    size,
    setSize,
    label,
    formatValue,
    active,
    selectedId: requestedId ?? null,
    setActive,
    cursor,
    tooltipOpen,
    setTooltipOpen,
    hovered,
    setHoveredId,
    hoverTile,
    plotRef,
    buttons,
    registerButton,
    tooltipId,
    reduce: useReducedMotion(),
    canHover: useHoverCapable(),
  };
}

export const TreemapContext = createContext<ReturnType<typeof useTreemapModel> | null>(null);

export function useTreemap() {
  const context = useContext(TreemapContext);
  if (!context) throw new Error("Treemap parts must be rendered inside Treemap.");
  return context;
}
