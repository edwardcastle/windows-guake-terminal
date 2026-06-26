# Tab Customization — Design Spec

**Branch:** `customize-appearance`
**Date:** 2026-06-26
**Status:** Approved (brainstorming complete)

## Goal

Let users personalize individual tabs and make the tab-bar controls easier to
use:

1. **Rename a tab** — via a right-click context menu or by double-clicking the
   tab title; an inline editor applies on Enter, cancels on Esc.
2. **Recolor a tab** — via the same right-click menu: preset swatches (the active
   theme's ANSI colors), a native custom color picker, and a "Default" action
   that reverts to the profile color.
3. **Bigger tab-bar icons** — the `+` (new tab), `▾` (profile chooser), and `⚙`
   (settings) glyphs render larger and easier to hit.

Custom name/color are **runtime-only** (per session), consistent with tabs not
being persisted today.

## Current state (what exists)

- **`src/renderer/main.ts`**: a `Tab` is `{ id, title, root, activePane, container }`.
  `render()` maps tabs to `TabInfo` via `tabs.map((t) => ({ id: t.id, title: t.title, color: colorForTab(t) }))`.
  `colorForTab(t)` returns the active pane's profile color. A pane's
  `onTitle` callback sets `tab.title` from the shell's reported title (falling
  back to the profile name).
- **`src/renderer/tab-bar.ts`**: `renderTabBar(el, tabs, activeIdx, profiles, on)`.
  `TabInfo` is `{ id; title; color? }`. `TabBarHandlers` is
  `{ select, close, newTab, openSettings }`. Each tab renders an optional `.dot`,
  a `.title`, and a `.close`. The `+`, `▾`, and `⚙` are `.tab-btn` elements; the
  `▾` chooser builds a transient `#profile-menu` positioned at its rect and
  dismissed on the next document click.
- **`src/renderer/styles.css`**: `.tab`, `.tab .dot`, `.tab .title`, `.tab .close`,
  `.tab-btn`, `.tab-btn.settings-btn`, and `#profile-menu` are styled. `.tab-btn`
  inherits the 13px body font size; `.settings-btn` bumps to 14px.
- **`src/shared/theme.ts`**: `resolveTheme(name, customThemes)` returns the active
  `TerminalTheme`, whose ANSI fields (`red`/`green`/`yellow`/`blue`/`magenta`/`cyan`)
  are the natural swatch source.
- Tabs are **runtime-only**; closing a tab or restarting discards its state.

## Data model

Extend the runtime `Tab` (in `main.ts`) with two optional fields:

```ts
interface Tab {
  id: string
  title: string            // auto title from the shell / profile name
  customTitle?: string     // user rename; takes display precedence
  customColor?: string     // user color; overrides the profile color
  root: PaneNode
  activePane: string
  container: HTMLDivElement
}
```

- **Display title** = `tab.customTitle ?? tab.title`. The pane's `onTitle` keeps
  writing `tab.title`; the custom name simply wins at render time, so a renamed
  tab stays renamed while the underlying auto title updates harmlessly.
- **Display color** = `tab.customColor ?? colorForTab(tab)`.
- Setting either field to `undefined`/empty reverts to the automatic value.

A tiny pure helper keeps the fallback testable:

```ts
// src/shared/tab-label.ts (new, pure)
export function displayTitle(auto: string, custom?: string): string
export function displayColor(profileColor?: string, custom?: string): string | undefined
```

## Rendering changes

In `main.ts` `render()`, compute display values and a theme-derived swatch list:

```ts
tabs.map((t) => ({ id: t.id, title: displayTitle(t.title, t.customTitle), color: displayColor(colorForTab(t), t.customColor) }))
```

`renderTabBar` gains a `swatches: string[]` argument — the preset colors offered in
the color menu. `main.ts` derives them from the active theme:

```ts
const theme = resolveTheme(config.theme, config.customThemes)
const swatches = [theme.red, theme.green, theme.yellow, theme.blue, theme.magenta, theme.cyan]
```

`TabBarHandlers` gains two methods:

```ts
interface TabBarHandlers {
  select(index: number): void
  close(index: number): void
  newTab(profileId?: string): void
  openSettings(): void
  rename(index: number, name: string): void   // '' reverts to auto
  setColor(index: number, color: string): void // '' reverts to profile color
}
```

`main.ts` implements them as:

```ts
rename: (i, name) => { if (tabs[i]) { tabs[i].customTitle = name.trim() || undefined; render() } }
setColor: (i, color) => { if (tabs[i]) { tabs[i].customColor = color || undefined; render() } }
```

## Renaming — in-place inline editor

Renaming edits the title **in place**: the tab's `.title` span is swapped for an
`<input>`. This is shared by both entry points (double-click and the menu's
"Rename") so there is one rename implementation. It lives in `tab-bar.ts`
(it needs the tab element) as a local helper:

```ts
function startRename(titleEl: HTMLElement, index: number, apply: (i: number, name: string) => void): void
```

Behavior: replace `titleEl`'s text with an `<input type="text">` prefilled with the
current title, focused and text-selected. `Enter` → `apply(index, input.value)`
(which sets `customTitle` and re-renders, discarding the input); `Esc` → restore
the original title span, no change; `blur` → apply the current value. The input
calls `stopPropagation()` on `keydown` so app shortcuts don't fire while typing.

## Tab context menu (`src/renderer/tab-context-menu.ts`, new)

A small module that owns the right-click menu, mirroring the `#profile-menu`
pattern so `tab-bar.ts` stays focused on tab rendering. It handles color only and
delegates rename back to the in-place editor via a callback.

```ts
export function openTabMenu(
  x: number, y: number,
  swatches: string[],
  on: { startRename(): void; setColor(color: string): void }
): void
```

Behavior:

- Removes any existing `#tab-menu`, creates a new one positioned at `(x, y)`,
  appends to `document.body`.
- **Rename** button → `on.startRename()` (starts the in-place editor) and close.
- **Color row**: the `swatches` rendered as clickable dots (each →
  `on.setColor(hex)` + close), a native `<input type="color">` whose `input`
  event → `on.setColor(value)`, and a **Default** button → `on.setColor('')` +
  close.
- Dismissed on `Esc` or the next outside `mousedown` (same deferred-listener
  trick as `#profile-menu`), and on selecting any action.

## Tab-bar wiring (`src/renderer/tab-bar.ts`)

For each tab element (`div`, with its `.title` element and index `i` in scope):

- `div.addEventListener('contextmenu', (e) => { e.preventDefault(); openTabMenu(e.clientX, e.clientY, swatches, { startRename: () => startRename(title, i, on.rename), setColor: (c) => on.setColor(i, c) }) })`.
- `title.addEventListener('dblclick', (e) => { e.stopPropagation(); startRename(title, i, on.rename) })` — direct in-place rename.

`renderTabBar`'s signature becomes
`renderTabBar(el, tabs, activeIdx, profiles, swatches, on)`.

## Bigger tab-bar icons (`src/renderer/styles.css`)

- `.tab-btn { font-size: 17px; padding: 0 14px; }` (was inherited 13px / `0 12px`).
- Drop the now-redundant `.settings-btn { font-size: 14px }` override (keep
  `margin-left: auto`).
- `#tab-menu` styled like `#profile-menu` (themed via the existing CSS vars):
  positioned, `--ui-bg` background, `--ui-border`, rounded, shadow; a `.tab-menu-row`
  for layout, swatch dots, and the Default button reusing the `.btn` style.

## Testing strategy

- **Unit (vitest):** `tests/tab-label.test.ts` — `displayTitle` prefers custom else
  auto; `displayColor` prefers custom else profile else undefined; empty/whitespace
  custom reverts.
- **Manual/GUI (project convention):** right-click a tab → rename applies on Enter,
  cancels on Esc, empty reverts; double-click title enters rename; preset/custom
  color apply live, Default reverts to profile color; the menu dismisses on Esc and
  outside click; renamed tabs keep their name as the shell title changes; `+`/`▾`/`⚙`
  are visibly larger and clickable.

## Out of scope (YAGNI)

- Persisting tab names/colors across restarts (tabs are not persisted today).
- Renaming/recoloring split panes individually (this is per-tab).
- Reordering tabs, or a global tab-rename settings UI.

## File-level impact summary

| File | Change |
|---|---|
| `src/shared/tab-label.ts` | **new** — pure `displayTitle` / `displayColor` helpers |
| `tests/tab-label.test.ts` | **new** — fallback/precedence cases |
| `src/renderer/tab-context-menu.ts` | **new** — right-click rename + color menu |
| `src/renderer/main.ts` | `Tab.customTitle/customColor`; `rename`/`setColor` handlers; compute display title/color + theme swatches; pass `swatches` to `renderTabBar` |
| `src/renderer/tab-bar.ts` | `TabBarHandlers` gains `rename`/`setColor`; `swatches` param; `startRename` helper; `contextmenu` + `dblclick` wiring (`TabInfo` unchanged — display values computed in `main.ts`) |
| `src/renderer/styles.css` | bigger `.tab-btn`; `#tab-menu` styling |
