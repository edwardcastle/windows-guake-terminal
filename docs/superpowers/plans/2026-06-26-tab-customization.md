# Tab Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users rename and recolor individual tabs (right-click menu + double-click), reverting cleanly to the auto title/profile color, and make the tab-bar icons (`+`/`▾`/`⚙`) larger.

**Architecture:** A tiny pure module (`tab-label.ts`) resolves the displayed title/color from optional per-tab overrides. The runtime `Tab` gains `customTitle`/`customColor` (no persistence). A new `tab-context-menu.ts` owns the right-click menu (mirroring the existing `#profile-menu`), delegating rename to an in-place inline editor in `tab-bar.ts`. `main.ts` computes display values + theme swatches and exposes `rename`/`setColor` handlers.

**Tech Stack:** Electron, TypeScript, electron-vite, Vitest.

## Global Constraints

- **Commit messages:** `[<type>] <imperative summary>` (capitalized, no trailing period, ≤50 chars), types `feat|fix|docs|refactor|test|chore`. **NEVER** add Claude/AI references, co-author lines, or "Generated with" footers.
- **Typecheck gate (every task):** `npx tsc --noEmit -p tsconfig.json` must exit 0.
- **Test gate (logic tasks):** `npm test` must pass.
- **node-pty / Electron / DOM cannot load in Vitest** — only pure modules under `src/shared/` are unit-tested. Renderer/DOM behavior is verified by hand via `npm run dev` (project convention).
- **Pure modules stay pure:** `src/shared/tab-label.ts` must not import Electron, xterm, or DOM APIs.
- **DRY / YAGNI / TDD / frequent commits.** Out of scope: persisting tab name/color, per-pane (vs per-tab) customization, tab reordering.

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/tab-label.ts` | **new** — pure `displayTitle` / `displayColor` fallback helpers |
| `tests/tab-label.test.ts` | **new** — fallback/precedence unit tests |
| `src/renderer/tab-context-menu.ts` | **new** — right-click menu: Rename trigger + color swatches/custom/Default |
| `src/renderer/tab-bar.ts` | `TabBarHandlers` gains `rename`/`setColor`; `swatches` param; `startRename` inline editor; `contextmenu`/`dblclick` wiring |
| `src/renderer/main.ts` | `Tab.customTitle/customColor`; display title/color + theme swatches; `rename`/`setColor` handlers |
| `src/renderer/styles.css` | bigger `.tab-btn`; `#tab-menu` styling; `.tab-rename` input |

**Task order:** Task 1 is pure-logic TDD. Tasks 2–4 are renderer (typecheck + build + manual verify). `renderTabBar`'s signature changes, so Task 3 edits `tab-bar.ts` and `main.ts` together to stay compiling.

---

### Task 1: Pure tab-label helpers

**Files:**
- Create: `src/shared/tab-label.ts`
- Test: `tests/tab-label.test.ts`

**Interfaces:**
- Produces:
  - `displayTitle(auto: string, custom?: string): string`
  - `displayColor(profileColor?: string, custom?: string): string | undefined`

- [ ] **Step 1: Write the failing test** — `tests/tab-label.test.ts`

```ts
import { describe, expect, test } from 'vitest'
import { displayTitle, displayColor } from '../src/shared/tab-label'

describe('displayTitle', () => {
  test('prefers a non-empty custom title, else the auto title', () => {
    expect(displayTitle('bash', 'deploy')).toBe('deploy')
    expect(displayTitle('bash')).toBe('bash')
    expect(displayTitle('bash', '')).toBe('bash')
    expect(displayTitle('bash', '   ')).toBe('bash')
  })
})

describe('displayColor', () => {
  test('prefers custom, else profile color, else undefined', () => {
    expect(displayColor('#888888', '#ff0000')).toBe('#ff0000')
    expect(displayColor('#888888')).toBe('#888888')
    expect(displayColor('#888888', '')).toBe('#888888')
    expect(displayColor(undefined, undefined)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tab-label.test.ts`
Expected: FAIL — cannot resolve `../src/shared/tab-label`.

- [ ] **Step 3: Write minimal implementation** — `src/shared/tab-label.ts`

```ts
export function displayTitle(auto: string, custom?: string): string {
  const c = custom?.trim()
  return c ? c : auto
}

export function displayColor(profileColor?: string, custom?: string): string | undefined {
  return custom || profileColor
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tab-label.test.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS; tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/shared/tab-label.ts tests/tab-label.test.ts
git commit -m "[feat] add pure tab title and color resolution"
```

---

### Task 2: Tab context-menu module

Creates the right-click menu. Self-contained module with no consumers yet (wired
in Task 3). **No automated test** — DOM module, verified by hand.

**Files:**
- Create: `src/renderer/tab-context-menu.ts`

**Interfaces:**
- Produces:
  - `openTabMenu(x: number, y: number, swatches: string[], on: { startRename: () => void; setColor: (color: string) => void }): void`

- [ ] **Step 1: Create `src/renderer/tab-context-menu.ts`**

```ts
function makeButton(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'btn'
  b.textContent = text
  b.addEventListener('click', onClick)
  return b
}

export function openTabMenu(
  x: number,
  y: number,
  swatches: string[],
  on: { startRename: () => void; setColor: (color: string) => void }
): void {
  document.querySelector('#tab-menu')?.remove()
  const menu = document.createElement('div')
  menu.id = 'tab-menu'
  menu.style.left = `${x}px`
  menu.style.top = `${y}px`

  const onDocDown = (e: MouseEvent): void => {
    if (!menu.contains(e.target as Node)) close()
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close()
  }
  function close(): void {
    menu.remove()
    document.removeEventListener('mousedown', onDocDown, true)
    document.removeEventListener('keydown', onKey, true)
  }

  menu.appendChild(makeButton('Rename', () => { close(); on.startRename() }))

  const colorRow = document.createElement('div')
  colorRow.className = 'tab-menu-row'
  for (const hex of swatches) {
    const dot = document.createElement('span')
    dot.className = 'swatch-dot'
    dot.style.background = hex
    dot.title = hex
    dot.addEventListener('click', () => { close(); on.setColor(hex) })
    colorRow.appendChild(dot)
  }
  const custom = document.createElement('input')
  custom.type = 'color'
  custom.title = 'Custom color'
  custom.addEventListener('input', () => on.setColor(custom.value))
  custom.addEventListener('change', () => close())
  colorRow.appendChild(custom)
  menu.appendChild(colorRow)

  menu.appendChild(makeButton('Default color', () => { close(); on.setColor('') }))

  document.body.appendChild(menu)
  setTimeout(() => {
    document.addEventListener('mousedown', onDocDown, true)
    document.addEventListener('keydown', onKey, true)
  })
}
```

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: tsc exits 0; build succeeds (unused export is fine).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/tab-context-menu.ts
git commit -m "[feat] add tab context menu module"
```

---

### Task 3: Wire rename/recolor into the tab bar and main

Adds the data model, display resolution, theme swatches, handlers, the in-place
rename editor, and the `contextmenu`/`dblclick` wiring. `tab-bar.ts` and `main.ts`
change together because `renderTabBar`'s signature changes. **No automated test** —
verified by hand.

**Files:**
- Modify: `src/renderer/tab-bar.ts`
- Modify: `src/renderer/main.ts`

**Interfaces:**
- Consumes: `openTabMenu` (Task 2); `displayTitle`, `displayColor` (Task 1); `resolveTheme` (existing `shared/theme`)
- Produces: `TabBarHandlers` with `rename(index, name)` / `setColor(index, color)`; `renderTabBar(el, tabs, activeIdx, profiles, swatches, on)`.

- [ ] **Step 1: Replace the entire `src/renderer/tab-bar.ts`** with:

```ts
import type { Profile } from '../shared/config'
import { openTabMenu } from './tab-context-menu'

export interface TabInfo { id: string; title: string; color?: string }

export interface TabBarHandlers {
  select(index: number): void
  close(index: number): void
  newTab(profileId?: string): void
  openSettings(): void
  rename(index: number, name: string): void
  setColor(index: number, color: string): void
}

function startRename(
  titleEl: HTMLElement,
  index: number,
  apply: (i: number, name: string) => void
): void {
  const original = titleEl.textContent ?? ''
  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'tab-rename'
  input.value = original
  let done = false
  const finish = (commit: boolean): void => {
    if (done) return
    done = true
    if (commit) apply(index, input.value)
    else titleEl.textContent = original
  }
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') { e.preventDefault(); finish(true) }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false) }
  })
  input.addEventListener('blur', () => finish(true))
  titleEl.textContent = ''
  titleEl.appendChild(input)
  input.focus()
  input.select()
}

export function renderTabBar(
  el: HTMLElement,
  tabs: TabInfo[],
  activeIdx: number,
  profiles: Profile[],
  swatches: string[],
  on: TabBarHandlers
): void {
  el.textContent = ''
  tabs.forEach((tab, i) => {
    const div = document.createElement('div')
    div.className = 'tab' + (i === activeIdx ? ' active' : '')
    if (tab.color) {
      const dot = document.createElement('span')
      dot.className = 'dot'
      dot.style.background = tab.color
      div.appendChild(dot)
    }
    const title = document.createElement('span')
    title.className = 'title'
    title.textContent = tab.title
    title.addEventListener('dblclick', (e) => {
      e.stopPropagation()
      startRename(title, i, on.rename)
    })
    const close = document.createElement('span')
    close.className = 'close'
    close.textContent = '✕'
    close.addEventListener('click', (e) => { e.stopPropagation(); on.close(i) })
    div.append(title, close)
    div.addEventListener('click', () => on.select(i))
    div.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      openTabMenu(e.clientX, e.clientY, swatches, {
        startRename: () => startRename(title, i, on.rename),
        setColor: (c) => on.setColor(i, c)
      })
    })
    el.appendChild(div)
  })

  const plus = document.createElement('div')
  plus.className = 'tab-btn'
  plus.textContent = '+'
  plus.title = 'New tab (default profile)'
  plus.addEventListener('click', () => on.newTab())
  el.appendChild(plus)

  const chooser = document.createElement('div')
  chooser.className = 'tab-btn'
  chooser.textContent = '▾'
  chooser.title = 'New tab with profile…'
  chooser.addEventListener('click', () => {
    document.querySelector('#profile-menu')?.remove()
    const menu = document.createElement('div')
    menu.id = 'profile-menu'
    const rect = chooser.getBoundingClientRect()
    menu.style.left = `${rect.left}px`
    menu.style.top = `${rect.bottom}px`
    for (const p of profiles) {
      const item = document.createElement('div')
      item.textContent = p.name
      item.addEventListener('click', () => { menu.remove(); on.newTab(p.id) })
      menu.appendChild(item)
    }
    document.body.appendChild(menu)
    setTimeout(() => {
      document.addEventListener('click', () => menu.remove(), { once: true })
    })
  })
  el.appendChild(chooser)

  const settingsBtn = document.createElement('div')
  settingsBtn.className = 'tab-btn settings-btn'
  settingsBtn.textContent = '⚙'
  settingsBtn.title = 'Appearance & settings (Ctrl+Shift+A)'
  settingsBtn.addEventListener('click', () => on.openSettings())
  el.appendChild(settingsBtn)
}
```

- [ ] **Step 2: `main.ts` — add the import** (next to the other `./` and `../shared` imports)

```ts
import { displayTitle, displayColor } from '../shared/tab-label'
```

(`resolveTheme` is already imported from `../shared/theme`.)

- [ ] **Step 3: `main.ts` — extend the `Tab` interface**

Replace:

```ts
interface Tab {
  id: string
  title: string
  root: PaneNode
  activePane: string
  container: HTMLDivElement
}
```

with:

```ts
interface Tab {
  id: string
  title: string
  customTitle?: string
  customColor?: string
  root: PaneNode
  activePane: string
  container: HTMLDivElement
}
```

- [ ] **Step 4: `main.ts` — update the `renderTabBar` call in `render()`**

Replace:

```ts
  renderTabBar(
    tabbarEl,
    tabs.map((t) => ({ id: t.id, title: t.title, color: colorForTab(t) })),
    activeTabIdx,
    profiles,
    { select: selectTab, close: closeTab, newTab, openSettings: () => settings.open() }
  )
```

with:

```ts
  const theme = resolveTheme(config.theme, config.customThemes)
  const swatches = [theme.red, theme.green, theme.yellow, theme.blue, theme.magenta, theme.cyan]
  renderTabBar(
    tabbarEl,
    tabs.map((t) => ({
      id: t.id,
      title: displayTitle(t.title, t.customTitle),
      color: displayColor(colorForTab(t), t.customColor)
    })),
    activeTabIdx,
    profiles,
    swatches,
    {
      select: selectTab,
      close: closeTab,
      newTab,
      openSettings: () => settings.open(),
      rename: (i, name) => { const t = tabs[i]; if (t) { t.customTitle = name.trim() || undefined; render() } },
      setColor: (i, color) => { const t = tabs[i]; if (t) { t.customColor = color || undefined; render() } }
    }
  )
```

- [ ] **Step 5: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: tsc exits 0; build succeeds.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`. Confirm:
- Right-click a tab → a menu appears with **Rename**, a row of theme-colored dots,
  a custom color box, and **Default color**.
- **Rename** (or **double-click the tab title**) → an inline input appears; typing +
  Enter renames the tab; Esc cancels; an empty value reverts to the shell title.
- A renamed tab keeps its name while the shell title keeps changing.
- Clicking a swatch or picking a custom color recolors the tab dot live; **Default
  color** reverts to the profile color.
- The menu closes on Esc, on outside click, and after any action.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/tab-bar.ts src/renderer/main.ts
git commit -m "[feat] add tab rename and per-tab color"
```

---

### Task 4: Bigger tab-bar icons + menu styling

Styles the new menu and enlarges the tab-bar controls. **No automated test** —
CSS-only, verified by hand.

**Files:**
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Enlarge `.tab-btn`** — replace:

```css
.tab-btn {
  padding: 0 12px;
  height: 100%;
  display: flex;
  align-items: center;
  cursor: pointer;
  color: var(--ui-muted);
}
.tab-btn:hover { color: var(--ui-fg); }
.tab-btn.settings-btn { margin-left: auto; font-size: 14px; }
```

with:

```css
.tab-btn {
  padding: 0 14px;
  height: 100%;
  display: flex;
  align-items: center;
  cursor: pointer;
  color: var(--ui-muted);
  font-size: 17px;
}
.tab-btn:hover { color: var(--ui-fg); }
.tab-btn.settings-btn { margin-left: auto; }
```

- [ ] **Step 2: Add tab-menu + rename styling** — append to `src/renderer/styles.css`
  (above the final `.hidden { display: none !important; }` rule):

```css
#tab-menu {
  position: absolute;
  z-index: 60;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
}
#tab-menu .btn { width: 100%; text-align: left; }
.tab-menu-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.tab-menu-row .swatch-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  cursor: pointer;
  border: 1px solid var(--ui-border);
}
.tab-menu-row input[type='color'] {
  width: 26px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--ui-border);
  border-radius: 5px;
  background: none;
  cursor: pointer;
}
.tab-rename {
  background: var(--term-bg);
  border: 1px solid var(--ui-accent);
  color: var(--ui-fg);
  font: inherit;
  padding: 0 4px;
  border-radius: 4px;
  outline: none;
  width: 100%;
  min-width: 60px;
}
```

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: tsc exits 0; build succeeds (CSS-only change).

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. Confirm:
- The `+`, `▾`, and `⚙` glyphs are visibly larger and easy to click.
- The tab context menu is themed (matches the chrome), with round swatch dots and
  a readable layout; the inline rename input is themed and fits the tab.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles.css
git commit -m "[feat] enlarge tab-bar icons and style tab menu"
```

---

## Self-Review (author checklist — completed)

**1. Spec coverage** — every spec section maps to a task:
- Pure `displayTitle`/`displayColor` + tests → Task 1.
- `tab-context-menu.ts` (Rename trigger + swatches + custom + Default) → Task 2.
- `Tab.customTitle/customColor`, display resolution, theme swatches, `rename`/`setColor`
  handlers, in-place `startRename`, `contextmenu`/`dblclick` wiring → Task 3.
- Bigger `.tab-btn`, `#tab-menu` styling, `.tab-rename` → Task 4.
- Runtime-only (no persistence), out-of-scope items not built. ✓

**2. Placeholder scan** — no TBD/TODO; every code step shows complete code. ✓

**3. Type consistency** — `openTabMenu(x, y, swatches, { startRename, setColor })`,
`renderTabBar(el, tabs, activeIdx, profiles, swatches, on)`, `TabBarHandlers.rename/setColor`,
`displayTitle`/`displayColor`, and `Tab.customTitle/customColor` are defined once and used
with matching names/signatures across tasks. `renderTabBar`'s caller (Task 3 `main.ts`) and
definition (Task 3 `tab-bar.ts`) change in the same task, so the build stays green. ✓
