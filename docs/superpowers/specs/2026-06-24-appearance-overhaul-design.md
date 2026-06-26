# Appearance Overhaul — Design Spec

**Branch:** `customize-appearance`
**Date:** 2026-06-24
**Status:** Approved (brainstorming complete)

## Goal

Turn the terminal's functional-but-bare appearance settings into a comprehensive,
cohesive customization experience covering four areas the user selected:

1. **Richer customization** — a full theme editor, more presets, cursor style/blink,
   font weight, letter spacing, terminal padding, and a configurable accent color.
2. **Polished settings UI** — replace the bare right-docked list with a categorized
   modal (left nav + two-column body).
3. **Polished app chrome** — make the tab bar, splitters, active-pane indicator,
   find bar, and settings all derive from the active theme so the whole shell is
   cohesive (today only the terminal background follows the theme).
4. **Per-profile appearance** — each shell profile (PowerShell, WSL, …) can carry
   its own theme/font/color so tabs are visually distinguishable.

## Current state (what exists)

- **Config** (`src/shared/config.ts`): `Config` with `theme` (string key), `opacity`,
  `acrylic`, `fontFamily`, `fontSize`, `lineHeight`, `widthPct`, `heightPct`,
  `animationMs`, plus keybindings/profiles/window flags. `mergeConfig` validates
  per-field with `num`/`bool`/`str` helpers; corrupt/partial configs still load.
- **Themes** (`src/renderer/themes.ts`): 5 built-ins typed as xterm `ITheme`
  (renderer-only, so not unit-testable). `themeOf(name)` falls back to dracula.
- **Apply path**: a settings control calls `patch()` → `window.api.setConfig(patch)`
  → IPC `config:set` → `ConfigStore.set` (merge + validate + persist) → broadcast
  `config:changed` → renderer re-applies to every pane (`TermPane.applyConfig`),
  updates `--term-bg`, rebuilds the settings panel, and re-renders. Main process
  applies opacity/acrylic/bounds/hotkey/login on the same event.
- **Chrome** (`src/renderer/styles.css`): `--ui-bg`, `--ui-fg`, `--ui-accent` are
  **hardcoded**; only `--term-bg` is theme-derived. Light themes therefore leave
  the tab bar and settings dark and unreadable.
- **Settings** (`src/renderer/settings-ui.ts`): a right-docked overlay; a flat list
  of label+input rows, fully rebuilt on every open and on every `config:changed`.
- **Profiles**: `Profile` has an unused optional `color?` field. Keybindings exist
  in config but have **no editing UI**.

## Architecture decision: move themeable logic into `src/shared/`

The theme data and color logic must be **pure and unit-testable** (like `keys.ts`
and `pane-tree.ts`), not trapped in the renderer behind an xterm import. Introduce:

**`src/shared/theme.ts`** containing:

- `TerminalTheme` — a concrete type where every color is a required hex string
  (`background`, `foreground`, `cursor`, `cursorAccent`, `selectionBackground`,
  and the 16 ANSI: `black/red/green/yellow/blue/magenta/cyan/white` + `bright*`).
  Structurally compatible with xterm's `ITheme`, so the renderer can pass a
  `TerminalTheme` straight to `new Terminal({ theme })`.
- `BUILTIN_THEMES: Record<string, TerminalTheme>` — the 11 presets.
- `isTerminalTheme(v): v is TerminalTheme` — validates a candidate (all keys
  present, each a `#rrggbb`/`#rgb` hex string).
- `resolveTheme(name, custom): TerminalTheme` — look up `name` in custom themes,
  then built-ins, else fall back to `dracula`.
- Hex helpers: `parseHex`, `clampChannel`, `mix(a, b, t)`, `lighten/darken`,
  `relativeLuminance`, `isLight(theme)`.
- `uiPalette(theme, accent): UiPalette` — derives chrome CSS-variable values
  (`termBg`, `uiBg`, `uiFg`, `uiAccent`, `uiBorder`, `uiMuted`) from the theme,
  luminance-aware (light themes get a light chrome). `accent === ''` ⇒ derive a
  sensible accent from the theme (its `blue`), and `uiMuted` is the most-dimmed
  foreground that still clears a 3:1 contrast floor on the chrome background.
- `resolveAppearance(cfg, profile): EffectiveAppearance` — merges a profile's
  optional `theme`/`fontFamily`/`fontSize` over the global config, returning the
  effective values a pane should use.

`src/shared/config.ts` imports `TerminalTheme` + `isTerminalTheme` from
`theme.ts`. `theme.ts` imports nothing from `config.ts` (no cycle).
`src/renderer/themes.ts` is reduced to a thin re-export/adapter (or removed, with
imports repointed to `shared/theme.ts`).

## Config schema changes (`src/shared/config.ts`)

Add to `Config` (all validated/clamped in `mergeConfig`, with defaults):

| Field | Type | Default | Validation |
|---|---|---|---|
| `customThemes` | `Record<string, TerminalTheme>` | `{}` | keep only entries passing `isTerminalTheme`; drop the rest |
| `accent` | `string` | `''` | string; `''` means auto-derive |
| `cursorStyle` | `'block' \| 'bar' \| 'underline'` | `'block'` | enum membership, else default |
| `cursorBlink` | `boolean` | `true` | `bool()` |
| `fontWeight` | `number` | `400` | `num(…, 100, 900)` |
| `letterSpacing` | `number` | `0` | `num(…, -2, 4)` |
| `padding` | `number` | `6` | `num(…, 0, 24)` |

Extend `Profile` with optional appearance overrides (all optional, validated in
`isProfile` / a new validator without breaking the existing required-field check):
`theme?: string`, `fontFamily?: string`, `fontSize?: number`, plus existing
`color?: string`. Unknown/invalid override values are dropped, not rejected — the
profile still loads.

`theme` resolution no longer assumes a built-in: a `theme` string may name a
custom theme. `mergeConfig` keeps `theme` as a string (no membership check needed;
`resolveTheme` handles unknown names by falling back to dracula at apply time).

## Theme system — full editor

- **Library:** existing `dracula`, `one-dark`, `solarized-dark`, `solarized-light`,
  `gruvbox-dark` plus 6 curated presets: `nord`, `tokyo-night`,
  `catppuccin-mocha`, `github-dark`, `monokai`, `rose-pine`. Total 11.
- **Editor (Appearance tab):**
  - Theme `<select>` listing built-ins and custom themes (grouped).
  - **"Duplicate to custom…"** clones the selected theme into `customThemes` under
    a new unique name and selects it.
  - When a **custom** theme is selected, show an editable grid: a labeled
    `<input type="color">` (with hex text) for each of the ~22 colors, editing
    **live** (each change patches `customThemes` → broadcast → panes + chrome
    re-apply). Built-in themes are read-only (the grid is shown disabled; editing
    prompts duplicate-first).
  - **Rename** / **Delete** custom theme (delete falls back to dracula if the
    deleted theme was active).
  - **Copy JSON** writes the selected theme to the clipboard
    (`navigator.clipboard.writeText`). **Paste JSON** reveals a textarea; on
    import, `JSON.parse` + `isTerminalTheme` validate; valid → added as a new
    custom theme; invalid → inline error, no state change. (No native file
    dialogs.)
  - A **preview strip** renders the palette swatches for the selected theme.

## Theme-aware chrome + visual polish

- On every apply, the renderer computes `uiPalette(activeTheme, cfg.accent)` and
  sets `--term-bg`, `--ui-bg`, `--ui-fg`, `--ui-accent`, `--ui-border`,
  `--ui-muted`, plus `--term-padding` (from `cfg.padding`) as CSS variables on
  `:root`. `styles.css` is reworked so **all** chrome consumes these vars.
- **Tab bar:** profile **color dot** before the title (from `profile.color`),
  rounded active indicator using `--ui-accent`, refined hover/close states,
  consistent height and spacing.
- **Active pane:** outline uses `--ui-accent`.
- **Splitters / find bar / settings:** consistent inputs, subtle transitions,
  themed (custom) scrollbars in scrollable overlays.
- The main `BrowserWindow` `backgroundColor` stays a safe dark default; the
  renderer paints the real background from the theme.

## Settings UI → categorized modal (`src/renderer/settings-ui.ts`)

Rewrite `SettingsUI` as a **centered modal**:

- **Left nav:** `Appearance`, `Terminal`, `Window`, `Profiles`, `Keybindings`.
  Selecting a category swaps the body; the modal remembers the open category.
- **Body (two-column):** reusable control builders — `slider` (range + live value
  readout), `colorField` (`<input type=color>` + hex), `select`, `check`, `text`,
  `number`.
  - **Appearance:** theme select + editor (above), accent color, cursor style,
    cursor blink.
  - **Terminal:** font family, font size, line height, font weight, letter
    spacing, padding.
  - **Window:** opacity, acrylic, width %, height %, animation ms, hide-on-blur,
    start with Windows, toggle hotkey.
  - **Profiles:** default profile; per-profile rows to set `color`, `theme`,
    `fontFamily`, `fontSize` overrides.
  - **Keybindings:** an editable accelerator-string input per action (reuses the
    existing per-key validated merge; closes the current no-UI gap).
- **Live-apply without clobbering edits:** while the modal is open, an incoming
  `config:changed` must **not** blow away the DOM the user is editing. Replace the
  unconditional `settings.rebuild()` with `settings.syncFromConfig(cfg)` that
  updates control **values in place** and skips the currently focused element;
  a full DOM rebuild happens only on open and on category switch.

## Per-profile appearance

- `resolveAppearance(cfg, profile)` (in `shared/theme.ts`) returns the effective
  `{ theme, fontFamily, fontSize }` for a pane, profile overrides winning over
  globals.
- `TermPane` takes the resolving inputs (config + its profile) and uses the
  resolved values in its constructor and in `applyConfig`. `main.ts` passes the
  pane's profile through so the right overrides apply.
- The tab bar shows the profile color dot so tabs from different profiles are
  visually distinct at a glance.

## Testing strategy

**Unit tests (vitest, no Electron/xterm), mirroring the existing pure-logic tests:**

- `config.test.ts` additions: defaults for every new field; clamp/fallback for
  `cursorStyle` (bad enum), `fontWeight`/`letterSpacing`/`padding` (out of range),
  `accent` (non-string); `customThemes` drops malformed entries but keeps valid
  ones; profile override fields validated/dropped without rejecting the profile.
- `theme.test.ts` (new): `isTerminalTheme` accepts a full palette and rejects
  missing/!hex colors; `resolveTheme` returns custom > built-in > dracula
  fallback; hex helpers (`parseHex`, `mix`, `relativeLuminance`, `isLight`);
  `uiPalette` yields a light chrome for a light theme and a dark chrome for a dark
  theme, and derives accent when `accent === ''`; `resolveAppearance` applies
  profile overrides over globals and falls back to globals when absent.

**Manual/GUI verification (no automated tests, per the project's existing
GUI-eyeball convention):** the modal navigation, color editing live-apply,
theme-aware chrome on a light theme, per-profile distinct tabs, import/export,
keybinding edits, and focus-preservation on live edits.

## Explicitly out of scope (YAGNI)

- Background images / image wallpapers.
- Configurable scrollback (not appearance).
- Font-ligature addon (extra dependency).
- Per-pane (as opposed to per-profile) theming.

## File-level impact summary

| File | Change |
|---|---|
| `src/shared/theme.ts` | **new** — types, built-ins, validation, resolution, hex/palette helpers, `resolveAppearance` |
| `src/shared/config.ts` | new fields + validation; profile override validation; import from `theme.ts` |
| `src/renderer/themes.ts` | reduced to adapter/re-export of `shared/theme.ts` (or removed) |
| `src/renderer/settings-ui.ts` | rewritten as categorized modal + theme editor + `syncFromConfig` |
| `src/renderer/styles.css` | theme-aware chrome via CSS vars; modal styling; polish |
| `src/renderer/term-pane.ts` | apply cursor/weight/spacing/padding + per-profile resolved appearance |
| `src/renderer/main.ts` | compute & apply `uiPalette`/CSS vars; pass profile to panes; `syncFromConfig` on change |
| `src/renderer/tab-bar.ts` | profile color dot |
| `tests/config.test.ts` | new-field + custom-theme + profile-override cases |
| `tests/theme.test.ts` | **new** — theme/palette/appearance pure-logic tests |
</content>
</invoke>
