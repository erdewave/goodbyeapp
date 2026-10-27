import path from 'node:path';
// Treemap nodes in the shape the renderer's Treemap takes: folders carry children, files and remainders carry a value.
// Colours are the renderer's job; remainder ids end in \0.
export type TreeNode = { id: string; label: string; value?: number; color?: string; textColor?: string; children?: TreeNode[] };
// ponytail: entries under 1/4000 of the disk (about 8x8 px on the map) stay as an unlabelled area in their folder,
// unless that area would itself be tile-sized (see buildTree); a finer share means more DOM tiles.
export const SHARE = 1 / 4000;
// Rolls each entry's own bytes up to the root, then keeps the entries worth at least SHARE of the whole disk.
export function buildTree(parent: ArrayLike<number>, name: (i: number) => string, own: ArrayLike<number>, root: number, rootPath: string) {
  const n = parent.length, total = new Float64Array(n), kids = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    if (!own[i]) continue;
    total[i] += own[i];
    for (let p = i, depth = 0; p !== root && depth < 512; depth++) { p = parent[p]; total[p] += own[i]; }
  }
  const min = total[root] * SHARE, kept = new Uint8Array(n);
  const keep = (i: number) => { kept[i] = 1; const list = kids.get(parent[i]); if (list) list.push(i); else kids.set(parent[i], [i]); };
  kept[root] = 1;
  for (let i = 0; i < n; i++) if (i !== root && total[i] >= min) keep(i);
  // Many entries just under min (a game's hundreds of 120 MB packs) would merge into one huge unlabelled area,
  // so a folder whose remainder is still tile-sized also keeps its largest smaller entries, down to min/4 (~4x4 px).
  const near = new Map<number, number[]>();
  for (let i = 0; i < n; i++) if (!kept[i] && total[i] >= min / 4 && kept[parent[i]]) { const list = near.get(parent[i]); if (list) list.push(i); else near.set(parent[i], [i]); }
  for (const [p, list] of near) {
    let rest = total[p] - (kids.get(p) ?? []).reduce((s, c) => s + total[c], 0);
    for (const c of list.sort((a, b) => total[b] - total[a])) { if (rest < min) break; keep(c); rest -= total[c]; }
  }
  // Entries too small for a tile count toward their folder's remainder.
  const node = (i: number, at: string): TreeNode => {
    const list = kids.get(i);
    if (!list) return { id: at, label: name(i), value: total[i] };
    const children = list.sort((a, b) => total[b] - total[a]).map(c => node(c, path.join(at, name(c)))), rest = total[i] - list.reduce((s, c) => s + total[c], 0);
    if (rest > 0) children.push({ id: at + '\0', label: '', value: rest });
    return { id: at, label: name(i), children };
  };
  return node(root, rootPath);
}
