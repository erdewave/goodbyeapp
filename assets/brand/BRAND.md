# GoodbyeAPP

**Tagline:** Remove apps. Reclaim space.

**GitHub description:** An open-source desktop app for uninstalling applications, reviewing leftovers, and finding large files.

Package name: `goodbyeapp`. Display name: `GoodbyeAPP`.

## Logo

The symbol is a disk treemap: blocks sized like files on a drive (the file analysis). The upper-right block has lifted out of its slot, leaving an empty outline behind (the uninstall).

- `goodbyeapp-icon.svg` — app icon master: white treemap on a blue rounded square (512 grid, corner radius 115).
- `goodbyeapp-mark.svg` — the symbol alone in solid blues, transparent background, for light surfaces.
- `goodbyeapp-logo.svg` — horizontal lockup of the icon and the "GoodbyeAPP" wordmark. The wordmark is drawn from monoline round strokes, not a font, so it renders the same everywhere. It switches to a light color under `prefers-color-scheme: dark`, so one file works on GitHub in both themes.
- `goodbyeapp-icon.png` (1024 px) and `goodbyeapp-icon.ico` (16–256 px) are exported from `goodbyeapp-icon.svg`. To rebuild the ICO, run `powershell -File assets/brand/build-icon.ps1`.
- `png/` — icon at 16–1024 px, the mark at 1024 px and the lockup at 2400 px wide, each rendered straight from its SVG.
- Keep at least the lifted block's width as clear space. Don't put the lifted block back in its slot. Don't add outlines or shadows.

## Colors

| Use | Value |
| --- | --- |
| Icon background | `#2563EB` → `#1E3A8A` (diagonal) |
| Blocks on the icon | `#FFFFFF` at 100 / 85 / 70 / 55 % |
| Lifted block | `#8FD0FF` (icon), `#38BDF8` (mark) |
| Mark blocks | `#1D4ED8`, `#3B6FF0`, `#6D94F5`, `#9DB8F8` |
| Wordmark | `#1B1B1E` light, `#EDEDF0` dark |

Trademark and handle availability for "GoodbyeAPP" have not been verified.
