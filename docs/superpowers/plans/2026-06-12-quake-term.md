# quake-term Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Guake-style dropdown terminal for Windows with global hotkey toggle, tabs, split panes, multiple shells, and live appearance customization.

**Architecture:** Electron main process owns OS concerns (window placement/animation, global hotkey, tray, ConPTY processes via node-pty, config persistence). A framework-free TypeScript renderer hosts xterm.js terminals arranged in a binary pane tree per tab. Renderer and main talk over a small typed IPC bridge (contextIsolation on).

**Tech Stack:** Electron, electron-vite, TypeScript, xterm.js (`@xterm/*`), node-pty, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-12-quake-term-design.md`

**NOTE — no git:** Per user instruction this project uses no git for now. Every "Commit" step is replaced by a **Checkpoint** step (run tests / run the app). Do not run git commands.

**Build prerequisite:** node-pty is a native module. `npm install` triggers `electron-rebuild`, which requires Visual Studio Build Tools (C++ workload) and Python. If the rebuild fails, install those first.

---

## File structure

```
package.json, tsconfig.json, electron.vite.config.ts
assets/icon.png                  — tray icon (generated in Task 11)
src/shared/config.ts             — Config types, defaults, validation (pure)
src/shared/pane-tree.ts          — split-tree logic: split/close/layout/neighbor (pure)
src/shared/keys.ts               — keybinding parse/match (pure)
src/main/index.ts                — app entry: wiring, IPC handlers, tray, hotkey
src/main/config-store.ts         — load/save config.json, corrupt-file recovery
src/main/profiles.ts             — shell auto-detection (pwsh, PowerShell, cmd, WSL, Git Bash)
src/main/pty-manager.ts          — pty registry, injectable spawn fn
src/main/window-manager.ts       — frameless dropdown window, animation, multi-monitor
src/preload/index.ts             — contextBridge API
src/renderer/index.html
src/renderer/styles.css
src/renderer/global.d.ts         — window.api typing
src/renderer/themes.ts           — bundled color schemes
src/renderer/term-pane.ts        — xterm.js wrapper (one per pane)
src/renderer/pane-view.ts        — DOM layout of the pane tree + drag splitters
src/renderer/tab-bar.ts          — tab strip + new-tab profile dropdown
src/renderer/find-bar.ts         — find-in-terminal overlay
src/renderer/settings-ui.ts      — settings overlay panel
src/renderer/main.ts             — renderer orchestrator (tabs/panes state, keybindings)
tests/config.test.ts
tests/pane-tree.test.ts
tests/keys.test.ts
tests/config-store.test.ts
tests/profiles.test.ts
tests/pty-manager.test.ts
```

Testing note: node-pty gets rebuilt for Electron's ABI, so it cannot load inside Vitest (plain Node). `PtyManager` therefore takes an injected spawn function and is unit-tested with a fake; real ConPTY behavior is verified manually in Task 8's end-to-end check. This deviates from the spec's "IPC contract tests against real ConPTY" for that reason.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `electron.vite.config.ts`
- Create: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "quake-term",
  "version": "0.1.0",
  "private": true,
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "test": "vitest run",
    "postinstall": "electron-rebuild -f -w node-pty"
  },
  "devDependencies": {
    "@electron/rebuild": "^3.6.0",
    "@types/node": "^20.14.0",
    "electron": "^31.0.0",
    "electron-vite": "^2.3.0",
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^1.6.0"
  },
  "dependencies": {
    "@xterm/addon-fit": "^0.10.0",
    "@xterm/addon-search": "^0.15.0",
    "@xterm/addon-web-links": "^0.11.0",
    "@xterm/addon-webgl": "^0.18.0",
    "@xterm/xterm": "^5.5.0",
    "node-pty": "^1.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Create `electron.vite.config.ts`**

```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {}
})
```

(electron-vite's default entry points are `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html` — we use those, no extra config.)

- [ ] **Step 4: Create minimal `src/main/index.ts`**

```ts
import { app, BrowserWindow } from 'electron'
import path from 'node:path'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1000,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
```

- [ ] **Step 5: Create minimal `src/preload/index.ts`**

```ts
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('api', { ping: () => 'pong' })
```

- [ ] **Step 6: Create `src/renderer/index.html`**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; style-src 'self' 'unsafe-inline'"
    />
    <title>quake-term</title>
  </head>
  <body>
    <div id="app">
      <div id="tabbar"></div>
      <div id="panes"></div>
    </div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 7: Create minimal `src/renderer/main.ts`**

```ts
document.querySelector('#app')!.textContent = 'quake-term scaffold OK'
```

- [ ] **Step 8: Install and verify**

Run: `npm install`
Expected: completes; `electron-rebuild` rebuilds node-pty without errors. (If it fails, install VS Build Tools C++ workload and retry.)

Run: `npm run dev`
Expected: an Electron window opens showing "quake-term scaffold OK". Close it (Ctrl+C in the terminal stops dev mode).

- [ ] **Step 9: Checkpoint** — scaffold runs. No git.

---

### Task 2: Config types, defaults, validation (pure)

**Files:**
- Create: `src/shared/config.ts`
- Test: `tests/config.test.ts`

- [ ] **Step 1: Write the failing tests — `tests/config.test.ts`**

```ts
import { describe, expect, test } from 'vitest'
import { DEFAULT_CONFIG, mergeConfig } from '../src/shared/config'

describe('mergeConfig', () => {
  test('empty input returns defaults', () => {
    expect(mergeConfig({})).toEqual(DEFAULT_CONFIG)
    expect(mergeConfig(null)).toEqual(DEFAULT_CONFIG)
    expect(mergeConfig('junk')).toEqual(DEFAULT_CONFIG)
  })

  test('valid overrides are kept', () => {
    const c = mergeConfig({ fontSize: 18, hideOnBlur: false, theme: 'gruvbox-dark' })
    expect(c.fontSize).toBe(18)
    expect(c.hideOnBlur).toBe(false)
    expect(c.theme).toBe('gruvbox-dark')
  })

  test('invalid types and out-of-range numbers fall back per-field', () => {
    const c = mergeConfig({ fontSize: 'big', opacity: 7, heightPct: 45 })
    expect(c.fontSize).toBe(DEFAULT_CONFIG.fontSize)
    expect(c.opacity).toBe(DEFAULT_CONFIG.opacity)
    expect(c.heightPct).toBe(45)
  })

  test('keybindings merge per-key', () => {
    const c = mergeConfig({ keybindings: { newTab: 'Ctrl+N', bogus: 'X', closePane: 42 } })
    expect(c.keybindings.newTab).toBe('Ctrl+N')
    expect(c.keybindings.closePane).toBe(DEFAULT_CONFIG.keybindings.closePane)
    expect('bogus' in c.keybindings).toBe(false)
  })

  test('malformed profiles are filtered out', () => {
    const good = { id: 'cmd', name: 'cmd', exe: 'cmd.exe', args: [] }
    const c = mergeConfig({ profiles: [good, { id: 'x' }, 'junk'] })
    expect(c.profiles).toEqual([good])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL — cannot resolve `../src/shared/config`.

- [ ] **Step 3: Implement `src/shared/config.ts`**

```ts
export interface Profile {
  id: string
  name: string
  exe: string
  args: string[]
  cwd?: string
  color?: string
}

export const ACTIONS = [
  'newTab', 'closePane', 'nextTab', 'prevTab',
  'splitRight', 'splitDown',
  'focusLeft', 'focusRight', 'focusUp', 'focusDown',
  'copy', 'paste', 'find',
  'fontBigger', 'fontSmaller', 'fontReset', 'settings'
] as const
export type Action = (typeof ACTIONS)[number]

export interface Config {
  hotkey: string
  defaultProfileId: string
  profiles: Profile[]
  keybindings: Record<Action, string>
  theme: string
  opacity: number
  acrylic: boolean
  fontFamily: string
  fontSize: number
  lineHeight: number
  widthPct: number
  heightPct: number
  animationMs: number
  hideOnBlur: boolean
  startWithWindows: boolean
}

export const DEFAULT_CONFIG: Config = {
  hotkey: 'CommandOrControl+`',
  defaultProfileId: '',
  profiles: [],
  keybindings: {
    newTab: 'Ctrl+Shift+T',
    closePane: 'Ctrl+Shift+W',
    nextTab: 'Ctrl+Tab',
    prevTab: 'Ctrl+Shift+Tab',
    splitRight: 'Ctrl+Shift+D',
    splitDown: 'Ctrl+Shift+E',
    focusLeft: 'Alt+ArrowLeft',
    focusRight: 'Alt+ArrowRight',
    focusUp: 'Alt+ArrowUp',
    focusDown: 'Alt+ArrowDown',
    copy: 'Ctrl+Shift+C',
    paste: 'Ctrl+Shift+V',
    find: 'Ctrl+Shift+F',
    fontBigger: 'Ctrl+=',
    fontSmaller: 'Ctrl+-',
    fontReset: 'Ctrl+0',
    settings: 'Ctrl+,'
  },
  theme: 'dracula',
  opacity: 0.95,
  acrylic: false,
  fontFamily: 'Cascadia Mono, Consolas, monospace',
  fontSize: 14,
  lineHeight: 1.2,
  widthPct: 100,
  heightPct: 45,
  animationMs: 150,
  hideOnBlur: true,
  startWithWindows: true
}

export function isProfile(v: unknown): v is Profile {
  if (!v || typeof v !== 'object') return false
  const p = v as Record<string, unknown>
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.exe === 'string' &&
    Array.isArray(p.args) &&
    p.args.every((a) => typeof a === 'string')
  )
}

function num(v: unknown, def: number, min: number, max: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : def
}
function bool(v: unknown, def: boolean): boolean {
  return typeof v === 'boolean' ? v : def
}
function str(v: unknown, def: string): string {
  return typeof v === 'string' && v.length > 0 ? v : def
}

export function mergeConfig(raw: unknown): Config {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_CONFIG
  const kb = { ...d.keybindings }
  if (r.keybindings && typeof r.keybindings === 'object') {
    for (const a of ACTIONS) {
      const v = (r.keybindings as Record<string, unknown>)[a]
      if (typeof v === 'string' && v) kb[a] = v
    }
  }
  return {
    hotkey: str(r.hotkey, d.hotkey),
    defaultProfileId: typeof r.defaultProfileId === 'string' ? r.defaultProfileId : d.defaultProfileId,
    profiles: Array.isArray(r.profiles) ? r.profiles.filter(isProfile) : [],
    keybindings: kb,
    theme: str(r.theme, d.theme),
    opacity: num(r.opacity, d.opacity, 0.3, 1),
    acrylic: bool(r.acrylic, d.acrylic),
    fontFamily: str(r.fontFamily, d.fontFamily),
    fontSize: num(r.fontSize, d.fontSize, 6, 40),
    lineHeight: num(r.lineHeight, d.lineHeight, 1, 2),
    widthPct: num(r.widthPct, d.widthPct, 20, 100),
    heightPct: num(r.heightPct, d.heightPct, 20, 100),
    animationMs: num(r.animationMs, d.animationMs, 0, 1000),
    hideOnBlur: bool(r.hideOnBlur, d.hideOnBlur),
    startWithWindows: bool(r.startWithWindows, d.startWithWindows)
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/config.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Checkpoint** — `npm test` green.

---

### Task 3: ConfigStore (persistence + corrupt-file recovery)

**Files:**
- Create: `src/main/config-store.ts`
- Test: `tests/config-store.test.ts`

- [ ] **Step 1: Write the failing tests — `tests/config-store.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ConfigStore } from '../src/main/config-store'
import { DEFAULT_CONFIG } from '../src/shared/config'

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qt-test-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('ConfigStore', () => {
  test('missing file loads defaults, not corrupt', () => {
    const s = new ConfigStore(dir)
    expect(s.load()).toEqual(DEFAULT_CONFIG)
    expect(s.corrupt).toBe(false)
  })

  test('set() persists and survives reload', () => {
    const s = new ConfigStore(dir)
    s.load()
    s.set({ fontSize: 20 })
    const s2 = new ConfigStore(dir)
    expect(s2.load().fontSize).toBe(20)
  })

  test('corrupt file: backed up, defaults loaded, flagged', () => {
    fs.writeFileSync(path.join(dir, 'config.json'), '{not json!!')
    const s = new ConfigStore(dir)
    expect(s.load()).toEqual(DEFAULT_CONFIG)
    expect(s.corrupt).toBe(true)
    expect(fs.existsSync(path.join(dir, 'config.json.bak'))).toBe(true)
  })

  test('invalid fields fall back individually, valid kept', () => {
    fs.writeFileSync(
      path.join(dir, 'config.json'),
      JSON.stringify({ fontSize: 'nope', heightPct: 60 })
    )
    const s = new ConfigStore(dir)
    const c = s.load()
    expect(c.fontSize).toBe(DEFAULT_CONFIG.fontSize)
    expect(c.heightPct).toBe(60)
    expect(s.corrupt).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/config-store.test.ts`
Expected: FAIL — cannot resolve `../src/main/config-store`.

- [ ] **Step 3: Implement `src/main/config-store.ts`**

```ts
import fs from 'node:fs'
import path from 'node:path'
import { Config, DEFAULT_CONFIG, mergeConfig } from '../shared/config'

export class ConfigStore {
  readonly file: string
  config: Config = DEFAULT_CONFIG
  corrupt = false

  constructor(dir: string) {
    this.file = path.join(dir, 'config.json')
    fs.mkdirSync(dir, { recursive: true })
  }

  load(): Config {
    this.corrupt = false
    if (fs.existsSync(this.file)) {
      try {
        this.config = mergeConfig(JSON.parse(fs.readFileSync(this.file, 'utf8')))
      } catch {
        fs.copyFileSync(this.file, this.file + '.bak')
        this.config = { ...DEFAULT_CONFIG }
        this.corrupt = true
      }
    } else {
      this.config = { ...DEFAULT_CONFIG }
    }
    return this.config
  }

  set(patch: Partial<Config>): Config {
    this.config = mergeConfig({ ...this.config, ...patch })
    fs.writeFileSync(this.file, JSON.stringify(this.config, null, 2))
    return this.config
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/config-store.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Checkpoint** — `npm test` green.

---

### Task 4: Pane tree (pure split-tree logic)

**Files:**
- Create: `src/shared/pane-tree.ts`
- Test: `tests/pane-tree.test.ts`

- [ ] **Step 1: Write the failing tests — `tests/pane-tree.test.ts`**

```ts
import { describe, expect, test } from 'vitest'
import {
  leaf, leaves, splitPane, closePane, setRatio, layout, neighbor, splitHandles
} from '../src/shared/pane-tree'

describe('splitPane', () => {
  test('splitting a leaf creates a 50/50 split', () => {
    const root = splitPane(leaf('p1'), 'p1', 'row', 'p2', 's1')
    expect(root).toEqual({
      type: 'split', id: 's1', dir: 'row', ratio: 0.5,
      a: { type: 'leaf', id: 'p1' }, b: { type: 'leaf', id: 'p2' }
    })
  })

  test('splits the correct nested leaf only', () => {
    let root = splitPane(leaf('p1'), 'p1', 'row', 'p2', 's1')
    root = splitPane(root, 'p2', 'col', 'p3', 's2')
    expect(leaves(root)).toEqual(['p1', 'p2', 'p3'])
  })
})

describe('closePane', () => {
  test('closing the only leaf returns null', () => {
    expect(closePane(leaf('p1'), 'p1')).toBeNull()
  })

  test('closing one side collapses the split', () => {
    const root = splitPane(leaf('p1'), 'p1', 'row', 'p2', 's1')
    expect(closePane(root, 'p1')).toEqual({ type: 'leaf', id: 'p2' })
  })
})

describe('setRatio', () => {
  test('updates the right split and clamps to [0.1, 0.9]', () => {
    const root = splitPane(leaf('p1'), 'p1', 'row', 'p2', 's1')
    const r1 = setRatio(root, 's1', 0.7)
    expect(r1.type === 'split' && r1.ratio).toBe(0.7)
    const r2 = setRatio(root, 's1', 0.01)
    expect(r2.type === 'split' && r2.ratio).toBe(0.1)
  })
})

describe('layout', () => {
  test('row split divides width by ratio', () => {
    const root = setRatio(splitPane(leaf('p1'), 'p1', 'row', 'p2', 's1'), 's1', 0.25)
    const rects = layout(root)
    expect(rects.get('p1')).toEqual({ x: 0, y: 0, w: 0.25, h: 1 })
    expect(rects.get('p2')).toEqual({ x: 0.25, y: 0, w: 0.75, h: 1 })
  })
})

describe('neighbor', () => {
  test('finds the pane across a row split', () => {
    const root = splitPane(leaf('p1'), 'p1', 'row', 'p2', 's1')
    expect(neighbor(root, 'p1', 'right')).toBe('p2')
    expect(neighbor(root, 'p2', 'left')).toBe('p1')
    expect(neighbor(root, 'p1', 'left')).toBeNull()
  })

  test('picks the adjacent pane with the largest overlap', () => {
    // left pane | right side split vertically -> from top-right going left = p1
    let root = splitPane(leaf('p1'), 'p1', 'row', 'p2', 's1')
    root = splitPane(root, 'p2', 'col', 'p3', 's2')
    expect(neighbor(root, 'p3', 'left')).toBe('p1')
    expect(neighbor(root, 'p1', 'right')).toBeTruthy()
  })
})

describe('splitHandles', () => {
  test('one handle per split, at the boundary', () => {
    const root = splitPane(leaf('p1'), 'p1', 'row', 'p2', 's1')
    const handles = splitHandles(root)
    expect(handles).toHaveLength(1)
    expect(handles[0]).toMatchObject({ id: 's1', dir: 'row', pos: 0.5 })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/pane-tree.test.ts`
Expected: FAIL — cannot resolve `../src/shared/pane-tree`.

- [ ] **Step 3: Implement `src/shared/pane-tree.ts`**

```ts
export interface Rect { x: number; y: number; w: number; h: number }
export interface Leaf { type: 'leaf'; id: string }
export interface Split {
  type: 'split'
  id: string
  dir: 'row' | 'col'
  ratio: number
  a: PaneNode
  b: PaneNode
}
export type PaneNode = Leaf | Split

export const leaf = (id: string): Leaf => ({ type: 'leaf', id })

export function leaves(n: PaneNode): string[] {
  return n.type === 'leaf' ? [n.id] : [...leaves(n.a), ...leaves(n.b)]
}

export function splitPane(
  root: PaneNode, targetId: string, dir: 'row' | 'col', newId: string, splitId: string
): PaneNode {
  if (root.type === 'leaf') {
    if (root.id !== targetId) return root
    return { type: 'split', id: splitId, dir, ratio: 0.5, a: root, b: leaf(newId) }
  }
  return {
    ...root,
    a: splitPane(root.a, targetId, dir, newId, splitId),
    b: splitPane(root.b, targetId, dir, newId, splitId)
  }
}

export function closePane(root: PaneNode, id: string): PaneNode | null {
  if (root.type === 'leaf') return root.id === id ? null : root
  const a = closePane(root.a, id)
  const b = closePane(root.b, id)
  if (a === null) return b
  if (b === null) return a
  if (a === root.a && b === root.b) return root
  return { ...root, a, b }
}

export function setRatio(root: PaneNode, splitId: string, ratio: number): PaneNode {
  if (root.type === 'leaf') return root
  const r = Math.min(0.9, Math.max(0.1, ratio))
  if (root.id === splitId) return { ...root, ratio: r }
  return { ...root, a: setRatio(root.a, splitId, ratio), b: setRatio(root.b, splitId, ratio) }
}

export function layout(
  root: PaneNode,
  rect: Rect = { x: 0, y: 0, w: 1, h: 1 },
  out: Map<string, Rect> = new Map()
): Map<string, Rect> {
  if (root.type === 'leaf') {
    out.set(root.id, rect)
    return out
  }
  const { x, y, w, h } = rect
  if (root.dir === 'row') {
    layout(root.a, { x, y, w: w * root.ratio, h }, out)
    layout(root.b, { x: x + w * root.ratio, y, w: w * (1 - root.ratio), h }, out)
  } else {
    layout(root.a, { x, y, w, h: h * root.ratio }, out)
    layout(root.b, { x, y: y + h * root.ratio, w, h: h * (1 - root.ratio) }, out)
  }
  return out
}

export function neighbor(
  root: PaneNode, fromId: string, dir: 'left' | 'right' | 'up' | 'down'
): string | null {
  const rects = layout(root)
  const from = rects.get(fromId)
  if (!from) return null
  const EPS = 1e-6
  let best: string | null = null
  let bestOverlap = 0
  for (const [id, r] of rects) {
    if (id === fromId) continue
    const adjacent =
      dir === 'left' ? Math.abs(r.x + r.w - from.x) < EPS :
      dir === 'right' ? Math.abs(from.x + from.w - r.x) < EPS :
      dir === 'up' ? Math.abs(r.y + r.h - from.y) < EPS :
      Math.abs(from.y + from.h - r.y) < EPS
    if (!adjacent) continue
    const overlap = dir === 'left' || dir === 'right'
      ? Math.min(from.y + from.h, r.y + r.h) - Math.max(from.y, r.y)
      : Math.min(from.x + from.w, r.x + r.w) - Math.max(from.x, r.x)
    if (overlap > bestOverlap) {
      bestOverlap = overlap
      best = id
    }
  }
  return best
}

export interface SplitHandle {
  id: string
  dir: 'row' | 'col'
  rect: Rect // the split node's own rect (for drag math)
  pos: number // boundary coordinate in container fractions (x for row, y for col)
}

export function splitHandles(
  n: PaneNode,
  rect: Rect = { x: 0, y: 0, w: 1, h: 1 },
  out: SplitHandle[] = []
): SplitHandle[] {
  if (n.type === 'leaf') return out
  if (n.dir === 'row') {
    const bx = rect.x + rect.w * n.ratio
    out.push({ id: n.id, dir: 'row', rect, pos: bx })
    splitHandles(n.a, { ...rect, w: rect.w * n.ratio }, out)
    splitHandles(n.b, { x: bx, y: rect.y, w: rect.w * (1 - n.ratio), h: rect.h }, out)
  } else {
    const by = rect.y + rect.h * n.ratio
    out.push({ id: n.id, dir: 'col', rect, pos: by })
    splitHandles(n.a, { ...rect, h: rect.h * n.ratio }, out)
    splitHandles(n.b, { x: rect.x, y: by, w: rect.w, h: rect.h * (1 - n.ratio) }, out)
  }
  return out
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/pane-tree.test.ts`
Expected: 9 tests PASS.

- [ ] **Step 5: Checkpoint** — `npm test` green.

---

### Task 5: Keybinding parse/match (pure)

**Files:**
- Create: `src/shared/keys.ts`
- Test: `tests/keys.test.ts`

- [ ] **Step 1: Write the failing tests — `tests/keys.test.ts`**

```ts
import { describe, expect, test } from 'vitest'
import { parseCombo, comboMatches, matchAction } from '../src/shared/keys'

const ev = (key: string, mods: Partial<{ ctrl: boolean; shift: boolean; alt: boolean }> = {}) => ({
  key, ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift, altKey: !!mods.alt
})

describe('parseCombo', () => {
  test('parses modifiers and key', () => {
    expect(parseCombo('Ctrl+Shift+T')).toEqual({ ctrl: true, shift: true, alt: false, key: 't' })
    expect(parseCombo('Alt+ArrowLeft')).toEqual({ ctrl: false, shift: false, alt: true, key: 'ArrowLeft' })
    expect(parseCombo('Ctrl+=')).toEqual({ ctrl: true, shift: false, alt: false, key: '=' })
    expect(parseCombo('Ctrl+,')).toEqual({ ctrl: true, shift: false, alt: false, key: ',' })
  })
})

describe('comboMatches', () => {
  test('matches case-insensitively on single chars', () => {
    expect(comboMatches(parseCombo('Ctrl+Shift+C'), ev('C', { ctrl: true, shift: true }))).toBe(true)
  })
  test('rejects wrong modifiers', () => {
    expect(comboMatches(parseCombo('Ctrl+Shift+C'), ev('c', { ctrl: true }))).toBe(false)
  })
  test('matches named keys exactly', () => {
    expect(comboMatches(parseCombo('Ctrl+Tab'), ev('Tab', { ctrl: true }))).toBe(true)
    expect(comboMatches(parseCombo('Ctrl+Shift+Tab'), ev('Tab', { ctrl: true, shift: true }))).toBe(true)
  })
})

describe('matchAction', () => {
  const kb = { newTab: 'Ctrl+Shift+T', find: 'Ctrl+Shift+F' }
  test('returns the matching action name', () => {
    expect(matchAction(kb, ev('t', { ctrl: true, shift: true }))).toBe('newTab')
  })
  test('returns null when nothing matches', () => {
    expect(matchAction(kb, ev('x', { ctrl: true }))).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/keys.test.ts`
Expected: FAIL — cannot resolve `../src/shared/keys`.

- [ ] **Step 3: Implement `src/shared/keys.ts`**

```ts
export interface KeyCombo {
  ctrl: boolean
  shift: boolean
  alt: boolean
  key: string
}

export interface KeyEventLike {
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  key: string
}

export function parseCombo(s: string): KeyCombo {
  const parts = s.split('+')
  const key = parts.pop() ?? ''
  const mods = parts.map((p) => p.toLowerCase())
  return {
    ctrl: mods.includes('ctrl'),
    shift: mods.includes('shift'),
    alt: mods.includes('alt'),
    key: key.length === 1 ? key.toLowerCase() : key
  }
}

export function comboMatches(combo: KeyCombo, e: KeyEventLike): boolean {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
  return (
    e.ctrlKey === combo.ctrl &&
    e.shiftKey === combo.shift &&
    e.altKey === combo.alt &&
    k === combo.key
  )
}

export function matchAction(
  keybindings: Record<string, string>,
  e: KeyEventLike
): string | null {
  for (const [action, binding] of Object.entries(keybindings)) {
    if (comboMatches(parseCombo(binding), e)) return action
  }
  return null
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/keys.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 5: Checkpoint** — `npm test` green.

---

### Task 6: Shell profile detection

**Files:**
- Create: `src/main/profiles.ts`
- Test: `tests/profiles.test.ts`

- [ ] **Step 1: Write the failing tests — `tests/profiles.test.ts`**

```ts
import { describe, expect, test } from 'vitest'
import { listWslDistros } from '../src/main/profiles'

describe('listWslDistros', () => {
  test('decodes UTF-16LE output and filters docker distros', () => {
    const out = Buffer.from('Ubuntu\r\ndocker-desktop\r\nDebian\r\n', 'utf16le')
    expect(listWslDistros(() => out)).toEqual(['Ubuntu', 'Debian'])
  })

  test('returns empty when wsl.exe fails', () => {
    expect(listWslDistros(() => { throw new Error('not installed') })).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/profiles.test.ts`
Expected: FAIL — cannot resolve `../src/main/profiles`.

- [ ] **Step 3: Implement `src/main/profiles.ts`**

WSL gotcha: `wsl.exe -l -q` prints UTF-16LE, hence the explicit decode.

```ts
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { Profile } from '../shared/config'

export function listWslDistros(
  run: () => Buffer = () => execFileSync('wsl.exe', ['-l', '-q'])
): string[] {
  try {
    return run()
      .toString('utf16le')
      .split(/\r?\n/)
      .map((s) => s.replace(/\0/g, '').trim())
      .filter((s) => s && s !== 'docker-desktop' && s !== 'docker-desktop-data')
  } catch {
    return []
  }
}

export function detectProfiles(): Profile[] {
  const profiles: Profile[] = []

  const pwsh = [
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    'C:\\Program Files (x86)\\PowerShell\\7\\pwsh.exe'
  ].find((p) => fs.existsSync(p))
  if (pwsh) profiles.push({ id: 'pwsh', name: 'PowerShell 7', exe: pwsh, args: ['-NoLogo'] })

  profiles.push({
    id: 'powershell', name: 'Windows PowerShell', exe: 'powershell.exe', args: ['-NoLogo']
  })
  profiles.push({ id: 'cmd', name: 'cmd', exe: process.env.ComSpec ?? 'cmd.exe', args: [] })

  for (const distro of listWslDistros()) {
    profiles.push({ id: `wsl-${distro}`, name: `WSL: ${distro}`, exe: 'wsl.exe', args: ['-d', distro] })
  }

  const gitBash = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    `${process.env.LOCALAPPDATA ?? ''}\\Programs\\Git\\bin\\bash.exe`
  ].find((p) => p && fs.existsSync(p))
  if (gitBash) {
    profiles.push({ id: 'gitbash', name: 'Git Bash', exe: gitBash, args: ['--login', '-i'] })
  }

  return profiles
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/profiles.test.ts`
Expected: 2 tests PASS.

- [ ] **Step 5: Checkpoint** — `npm test` green.

---

### Task 7: PtyManager (injectable spawn, unit-tested with a fake)

**Files:**
- Create: `src/main/pty-manager.ts`
- Test: `tests/pty-manager.test.ts`

- [ ] **Step 1: Write the failing tests — `tests/pty-manager.test.ts`**

```ts
import { describe, expect, test } from 'vitest'
import { PtyManager, PtyLike, SpawnFn } from '../src/main/pty-manager'

class FakePty implements PtyLike {
  written: string[] = []
  size = { cols: 0, rows: 0 }
  killed = false
  private dataCb: ((d: string) => void) | null = null
  private exitCb: ((e: { exitCode: number }) => void) | null = null

  write(d: string) { this.written.push(d) }
  resize(cols: number, rows: number) { this.size = { cols, rows } }
  kill() { this.killed = true }
  onData(cb: (d: string) => void) { this.dataCb = cb }
  onExit(cb: (e: { exitCode: number }) => void) { this.exitCb = cb }

  emitData(d: string) { this.dataCb?.(d) }
  emitExit(code: number) { this.exitCb?.({ exitCode: code }) }
}

const profile = { id: 'cmd', name: 'cmd', exe: 'cmd.exe', args: [] }

function setup() {
  const spawned: FakePty[] = []
  const spawnFn: SpawnFn = () => {
    const p = new FakePty()
    spawned.push(p)
    return p
  }
  return { mgr: new PtyManager(spawnFn), spawned }
}

describe('PtyManager', () => {
  test('spawn wires data and exit callbacks', () => {
    const { mgr, spawned } = setup()
    const data: string[] = []
    let exit = -1
    mgr.spawn('a', profile, 80, 24, (d) => data.push(d), (c) => { exit = c })
    spawned[0].emitData('hello')
    expect(data).toEqual(['hello'])
    spawned[0].emitExit(0)
    expect(exit).toBe(0)
  })

  test('write and resize route to the right pty', () => {
    const { mgr, spawned } = setup()
    mgr.spawn('a', profile, 80, 24, () => {}, () => {})
    mgr.spawn('b', profile, 80, 24, () => {}, () => {})
    mgr.write('b', 'x')
    mgr.resize('a', 100, 30)
    expect(spawned[1].written).toEqual(['x'])
    expect(spawned[0].size).toEqual({ cols: 100, rows: 30 })
  })

  test('respawning the same id kills the old pty', () => {
    const { mgr, spawned } = setup()
    mgr.spawn('a', profile, 80, 24, () => {}, () => {})
    mgr.spawn('a', profile, 80, 24, () => {}, () => {})
    expect(spawned[0].killed).toBe(true)
    expect(spawned).toHaveLength(2)
  })

  test('exit removes the pty; killAll kills everything', () => {
    const { mgr, spawned } = setup()
    mgr.spawn('a', profile, 80, 24, () => {}, () => {})
    mgr.spawn('b', profile, 80, 24, () => {}, () => {})
    spawned[0].emitExit(1)
    mgr.write('a', 'ignored')
    expect(spawned[0].written).toEqual([])
    mgr.killAll()
    expect(spawned[1].killed).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/pty-manager.test.ts`
Expected: FAIL — cannot resolve `../src/main/pty-manager`.

- [ ] **Step 3: Implement `src/main/pty-manager.ts`**

```ts
import type { Profile } from '../shared/config'

export interface PtyLike {
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  onData(cb: (data: string) => void): void
  onExit(cb: (e: { exitCode: number }) => void): void
}

export interface SpawnOpts {
  cols: number
  rows: number
  cwd: string
  env: NodeJS.ProcessEnv
}

export type SpawnFn = (exe: string, args: string[], opts: SpawnOpts) => PtyLike

export class PtyManager {
  private ptys = new Map<string, PtyLike>()

  constructor(private spawnFn: SpawnFn) {}

  spawn(
    id: string,
    profile: Profile,
    cols: number,
    rows: number,
    onData: (d: string) => void,
    onExit: (code: number) => void
  ): void {
    this.kill(id)
    const pty = this.spawnFn(profile.exe, profile.args, {
      cols,
      rows,
      cwd: profile.cwd || process.env.USERPROFILE || 'C:\\',
      env: process.env
    })
    pty.onData(onData)
    pty.onExit(({ exitCode }) => {
      this.ptys.delete(id)
      onExit(exitCode)
    })
    this.ptys.set(id, pty)
  }

  write(id: string, data: string): void { this.ptys.get(id)?.write(data) }
  resize(id: string, cols: number, rows: number): void { this.ptys.get(id)?.resize(cols, rows) }

  kill(id: string): void {
    const p = this.ptys.get(id)
    if (p) {
      this.ptys.delete(id)
      p.kill()
    }
  }

  killAll(): void {
    for (const id of [...this.ptys.keys()]) this.kill(id)
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/pty-manager.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Checkpoint** — `npm test` green (all suites so far).

---

### Task 8: IPC bridge + single working terminal (end-to-end)

**Files:**
- Modify: `src/preload/index.ts` (full replacement)
- Modify: `src/main/index.ts` (full replacement)
- Create: `src/renderer/global.d.ts`, `src/renderer/themes.ts`, `src/renderer/term-pane.ts`, `src/renderer/styles.css`
- Modify: `src/renderer/main.ts` (full replacement)

- [ ] **Step 1: Replace `src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron'

const api = {
  spawn: (paneId: string, profileId: string, cols: number, rows: number) =>
    ipcRenderer.invoke('pty:spawn', paneId, profileId, cols, rows) as Promise<string | null>,
  write: (paneId: string, data: string) => ipcRenderer.send('pty:write', paneId, data),
  resize: (paneId: string, cols: number, rows: number) =>
    ipcRenderer.send('pty:resize', paneId, cols, rows),
  kill: (paneId: string) => ipcRenderer.send('pty:kill', paneId),
  onData: (cb: (paneId: string, data: string) => void) =>
    ipcRenderer.on('pty:data', (_e, id: string, d: string) => cb(id, d)),
  onExit: (cb: (paneId: string, code: number) => void) =>
    ipcRenderer.on('pty:exit', (_e, id: string, c: number) => cb(id, c)),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch: unknown) => ipcRenderer.invoke('config:set', patch),
  onConfigChanged: (cb: (config: unknown) => void) =>
    ipcRenderer.on('config:changed', (_e, c) => cb(c)),
  getProfiles: () => ipcRenderer.invoke('profiles:get'),
  onOpenSettings: (cb: () => void) => ipcRenderer.on('ui:open-settings', () => cb()),
  hideWindow: () => ipcRenderer.send('window:hide')
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
```

- [ ] **Step 2: Replace `src/main/index.ts`** (interim version — plain window; the dropdown window arrives in Task 11)

```ts
import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import * as nodePty from 'node-pty'
import { ConfigStore } from './config-store'
import { detectProfiles } from './profiles'
import { PtyManager, SpawnFn } from './pty-manager'

const realSpawn: SpawnFn = (exe, args, opts) =>
  nodePty.spawn(exe, args, {
    name: 'xterm-256color',
    useConpty: true,
    cols: opts.cols,
    rows: opts.rows,
    cwd: opts.cwd,
    env: opts.env as { [k: string]: string }
  })

const store = new ConfigStore(path.join(app.getPath('appData'), 'quake-term'))
const ptys = new PtyManager(realSpawn)
let win: BrowserWindow

function registerIpc(): void {
  ipcMain.handle('pty:spawn', (_e, paneId: string, profileId: string, cols: number, rows: number) => {
    const profile = store.config.profiles.find((p) => p.id === profileId)
    if (!profile) return `unknown profile: ${profileId}`
    try {
      ptys.spawn(
        paneId, profile, cols, rows,
        (d) => win.webContents.send('pty:data', paneId, d),
        (c) => win.webContents.send('pty:exit', paneId, c)
      )
      return null
    } catch (err) {
      return `${profile.exe}: ${String(err)}`
    }
  })
  ipcMain.on('pty:write', (_e, id: string, data: string) => ptys.write(id, data))
  ipcMain.on('pty:resize', (_e, id: string, cols: number, rows: number) => ptys.resize(id, cols, rows))
  ipcMain.on('pty:kill', (_e, id: string) => ptys.kill(id))
  ipcMain.handle('config:get', () => store.config)
  ipcMain.handle('profiles:get', () => store.config.profiles)
  ipcMain.handle('config:set', (_e, patch) => {
    const c = store.set(patch as object)
    win.webContents.send('config:changed', c)
    return c
  })
  ipcMain.on('window:hide', () => win.hide())
}

app.whenReady().then(() => {
  store.load()
  if (store.config.profiles.length === 0) {
    const detected = detectProfiles()
    store.set({ profiles: detected, defaultProfileId: detected[0]?.id ?? '' })
  }
  registerIpc()
  win = new BrowserWindow({
    width: 1200,
    height: 700,
    backgroundColor: '#282a36',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
})

app.on('will-quit', () => ptys.killAll())
app.on('window-all-closed', () => app.quit())
```

- [ ] **Step 3: Create `src/renderer/global.d.ts`**

```ts
import type { Api } from '../preload/index'

declare global {
  interface Window { api: Api }
}

export {}
```

- [ ] **Step 4: Create `src/renderer/themes.ts`**

```ts
import type { ITheme } from '@xterm/xterm'

export const THEMES: Record<string, ITheme> = {
  dracula: {
    background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2',
    selectionBackground: '#44475a',
    black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
    blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
    brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94',
    brightYellow: '#ffffa5', brightBlue: '#d6acff', brightMagenta: '#ff92df',
    brightCyan: '#a4ffff', brightWhite: '#ffffff'
  },
  'one-dark': {
    background: '#282c34', foreground: '#abb2bf', cursor: '#528bff',
    selectionBackground: '#3e4451',
    black: '#1e2127', red: '#e06c75', green: '#98c379', yellow: '#e5c07b',
    blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
    brightBlack: '#5c6370', brightRed: '#e06c75', brightGreen: '#98c379',
    brightYellow: '#e5c07b', brightBlue: '#61afef', brightMagenta: '#c678dd',
    brightCyan: '#56b6c2', brightWhite: '#ffffff'
  },
  'solarized-dark': {
    background: '#002b36', foreground: '#839496', cursor: '#93a1a1',
    selectionBackground: '#073642',
    black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
    blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#586e75', brightRed: '#cb4b16', brightGreen: '#859900',
    brightYellow: '#b58900', brightBlue: '#268bd2', brightMagenta: '#6c71c4',
    brightCyan: '#2aa198', brightWhite: '#fdf6e3'
  },
  'solarized-light': {
    background: '#fdf6e3', foreground: '#657b83', cursor: '#586e75',
    selectionBackground: '#eee8d5',
    black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
    blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#586e75', brightRed: '#cb4b16', brightGreen: '#859900',
    brightYellow: '#b58900', brightBlue: '#268bd2', brightMagenta: '#6c71c4',
    brightCyan: '#2aa198', brightWhite: '#fdf6e3'
  },
  'gruvbox-dark': {
    background: '#282828', foreground: '#ebdbb2', cursor: '#ebdbb2',
    selectionBackground: '#504945',
    black: '#282828', red: '#cc241d', green: '#98971a', yellow: '#d79921',
    blue: '#458588', magenta: '#b16286', cyan: '#689d6a', white: '#a89984',
    brightBlack: '#928374', brightRed: '#fb4934', brightGreen: '#b8bb26',
    brightYellow: '#fabd2f', brightBlue: '#83a598', brightMagenta: '#d3869b',
    brightCyan: '#8ec07c', brightWhite: '#ebdbb2'
  }
}

export function themeOf(name: string): ITheme {
  return THEMES[name] ?? THEMES.dracula
}
```

- [ ] **Step 5: Create `src/renderer/term-pane.ts`**

```ts
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import type { Config } from '../shared/config'
import { themeOf } from './themes'

export class TermPane {
  readonly el = document.createElement('div')
  readonly term: Terminal
  readonly fit = new FitAddon()
  readonly search = new SearchAddon()
  exited = false
  onTitle?: (title: string) => void

  constructor(
    readonly id: string,
    readonly profileId: string,
    cfg: Config
  ) {
    this.el.className = 'pane'
    this.term = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      scrollback: 10000,
      fontFamily: cfg.fontFamily,
      fontSize: cfg.fontSize,
      lineHeight: cfg.lineHeight,
      theme: themeOf(cfg.theme)
    })
    this.term.loadAddon(this.fit)
    this.term.loadAddon(this.search)
    this.term.loadAddon(new WebLinksAddon())
    this.term.open(this.el)
    try {
      this.term.loadAddon(new WebglAddon())
    } catch {
      // WebGL unavailable — xterm falls back to the DOM renderer
    }
    this.term.onData((d) => {
      if (!this.exited) window.api.write(this.id, d)
    })
    this.term.onResize(({ cols, rows }) => window.api.resize(this.id, cols, rows))
    this.term.onTitleChange((t) => this.onTitle?.(t))
    this.term.attachCustomKeyEventHandler((e) => {
      if (this.exited && e.type === 'keydown' && e.key === 'Enter') {
        this.respawn()
        return false
      }
      return true
    })
    new ResizeObserver(() => this.fitNow()).observe(this.el)
    this.el.addEventListener('contextmenu', async (e) => {
      e.preventDefault()
      const text = await navigator.clipboard.readText()
      if (text && !this.exited) window.api.write(this.id, text)
    })
  }

  async spawnShell(): Promise<void> {
    this.exited = false
    this.fitNow()
    const err = await window.api.spawn(this.id, this.profileId, this.term.cols, this.term.rows)
    if (err) {
      this.exited = true
      this.term.writeln(`\x1b[31mfailed to start: ${err}\x1b[0m`)
      this.term.writeln('\x1b[2mpress Enter to retry\x1b[0m')
    }
  }

  respawn(): void {
    this.term.reset()
    void this.spawnShell()
  }

  handleExit(code: number): void {
    this.exited = true
    this.term.writeln(
      `\r\n\x1b[2m[process exited with code ${code}] — press Enter to restart\x1b[0m`
    )
  }

  fitNow(): void {
    if (this.el.clientWidth > 0 && this.el.clientHeight > 0) this.fit.fit()
  }

  applyConfig(cfg: Config): void {
    this.term.options.fontFamily = cfg.fontFamily
    this.term.options.fontSize = cfg.fontSize
    this.term.options.lineHeight = cfg.lineHeight
    this.term.options.theme = themeOf(cfg.theme)
    this.fitNow()
  }

  setFontSize(px: number): void {
    this.term.options.fontSize = px
    this.fitNow()
  }

  dispose(): void {
    window.api.kill(this.id)
    this.term.dispose()
    this.el.remove()
  }
}
```

- [ ] **Step 6: Create `src/renderer/styles.css`**

```css
:root {
  --ui-bg: #1e1f29;
  --ui-fg: #c8c8d0;
  --ui-accent: #bd93f9;
  --term-bg: #282a36;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

html, body, #app {
  height: 100%;
  overflow: hidden;
  background: var(--term-bg);
  font-family: 'Segoe UI', sans-serif;
  font-size: 13px;
  color: var(--ui-fg);
  user-select: none;
}

#app { display: flex; flex-direction: column; }

#tabbar {
  display: flex;
  align-items: center;
  background: var(--ui-bg);
  height: 32px;
  flex: none;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  height: 100%;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  white-space: nowrap;
  max-width: 220px;
  overflow: hidden;
}
.tab.active { border-bottom-color: var(--ui-accent); background: var(--term-bg); }
.tab .close { opacity: 0.5; padding: 0 2px; }
.tab .close:hover { opacity: 1; color: #ff5555; }

.tab-btn {
  padding: 0 10px;
  height: 100%;
  display: flex;
  align-items: center;
  cursor: pointer;
  opacity: 0.7;
}
.tab-btn:hover { opacity: 1; }

#profile-menu {
  position: absolute;
  z-index: 50;
  background: var(--ui-bg);
  border: 1px solid #444;
  border-radius: 4px;
  padding: 4px 0;
}
#profile-menu div { padding: 6px 16px; cursor: pointer; }
#profile-menu div:hover { background: var(--ui-accent); color: #000; }

#panes { position: relative; flex: 1; }

.tab-container { position: absolute; inset: 0; }
.tab-container.hidden { display: none; }

.pane { position: absolute; padding: 2px; }
.pane.active-pane { outline: 1px solid var(--ui-accent); outline-offset: -1px; }
.xterm { height: 100%; }

.splitter { position: absolute; z-index: 10; }
.splitter.row { cursor: ew-resize; }
.splitter.col { cursor: ns-resize; }
.splitter:hover { background: var(--ui-accent); opacity: 0.4; }

.overlay {
  position: absolute;
  z-index: 100;
  background: var(--ui-bg);
  border: 1px solid #444;
  border-radius: 6px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
}

#findbar {
  top: 8px;
  right: 16px;
  padding: 6px 8px;
  display: flex;
  gap: 6px;
}
#findbar input {
  background: var(--term-bg);
  border: 1px solid #555;
  color: var(--ui-fg);
  padding: 3px 6px;
  border-radius: 3px;
  outline: none;
  width: 200px;
}

#settings {
  top: 40px;
  right: 16px;
  width: 320px;
  max-height: calc(100% - 60px);
  overflow-y: auto;
  padding: 14px;
}
#settings h2 { font-size: 14px; margin-bottom: 10px; color: var(--ui-accent); }
#settings .row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 8px; }
#settings .row label { flex: none; }
#settings input, #settings select {
  background: var(--term-bg);
  border: 1px solid #555;
  color: var(--ui-fg);
  padding: 3px 6px;
  border-radius: 3px;
  outline: none;
  width: 150px;
}
#settings input[type='checkbox'] { width: auto; }
.hidden { display: none !important; }
```

- [ ] **Step 7: Replace `src/renderer/main.ts`** (single pane for now; tabs in Task 9)

```ts
import '@xterm/xterm/css/xterm.css'
import './styles.css'
import type { Config, Profile } from '../shared/config'
import { TermPane } from './term-pane'

const panes = new Map<string, TermPane>()

async function boot(): Promise<void> {
  const config = (await window.api.getConfig()) as Config
  const profiles = (await window.api.getProfiles()) as Profile[]

  window.api.onData((id, d) => panes.get(id)?.term.write(d))
  window.api.onExit((id, c) => panes.get(id)?.handleExit(c))

  const pane = new TermPane('p1', config.defaultProfileId || profiles[0].id, config)
  pane.el.style.inset = '0'
  document.querySelector('#panes')!.appendChild(pane.el)
  panes.set(pane.id, pane)
  await pane.spawnShell()
  pane.term.focus()
}

void boot()
```

- [ ] **Step 8: End-to-end verification (real ConPTY)**

Run: `npm run dev`
Expected:
1. Window opens with a live shell prompt (your default detected profile).
2. Type `dir` + Enter — directory listing appears.
3. Resize the window — the shell reflows (run `dir` again to confirm new width is used).
4. Type `exit` — pane shows `[process exited with code 0] — press Enter to restart`; pressing Enter restarts the shell.

- [ ] **Step 9: Checkpoint** — `npm test` green, manual end-to-end passes.

---

### Task 9: Tabs

**Files:**
- Create: `src/renderer/tab-bar.ts`
- Modify: `src/renderer/main.ts` (full replacement)

- [ ] **Step 1: Create `src/renderer/tab-bar.ts`**

```ts
import type { Profile } from '../shared/config'

export interface TabInfo { id: string; title: string }

export interface TabBarHandlers {
  select(index: number): void
  close(index: number): void
  newTab(profileId?: string): void
}

export function renderTabBar(
  el: HTMLElement,
  tabs: TabInfo[],
  activeIdx: number,
  profiles: Profile[],
  on: TabBarHandlers
): void {
  el.textContent = ''
  tabs.forEach((tab, i) => {
    const div = document.createElement('div')
    div.className = 'tab' + (i === activeIdx ? ' active' : '')
    const title = document.createElement('span')
    title.textContent = tab.title
    const close = document.createElement('span')
    close.className = 'close'
    close.textContent = '✕'
    close.addEventListener('click', (e) => { e.stopPropagation(); on.close(i) })
    div.append(title, close)
    div.addEventListener('click', () => on.select(i))
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
}
```

- [ ] **Step 2: Replace `src/renderer/main.ts`** (tab state machine; still one pane per tab — splits arrive in Task 10)

```ts
import '@xterm/xterm/css/xterm.css'
import './styles.css'
import type { Config, Profile } from '../shared/config'
import { PaneNode, leaf, leaves } from '../shared/pane-tree'
import { TermPane } from './term-pane'
import { renderTabBar } from './tab-bar'

interface Tab {
  id: string
  title: string
  root: PaneNode
  activePane: string
  container: HTMLDivElement
}

let config: Config
let profiles: Profile[] = []
const panes = new Map<string, TermPane>()
let tabs: Tab[] = []
let activeTabIdx = 0
let nextId = 1
const uid = (prefix: string): string => `${prefix}${nextId++}`

const tabbarEl = document.querySelector('#tabbar') as HTMLElement
const panesEl = document.querySelector('#panes') as HTMLElement

function activeTab(): Tab | undefined { return tabs[activeTabIdx] }
function activePane(): TermPane | undefined {
  const t = activeTab()
  return t ? panes.get(t.activePane) : undefined
}

function createPane(profileId: string): TermPane {
  const pane = new TermPane(uid('p'), profileId, config)
  panes.set(pane.id, pane)
  pane.onTitle = (title) => {
    const tab = tabs.find((t) => leaves(t.root).includes(pane.id))
    if (tab && tab.activePane === pane.id) {
      tab.title = title || profileName(profileId)
      render()
    }
  }
  void pane.spawnShell()
  return pane
}

function profileName(id: string): string {
  return profiles.find((p) => p.id === id)?.name ?? id
}

export function newTab(profileId?: string): void {
  const pid = profileId || config.defaultProfileId || profiles[0].id
  const pane = createPane(pid)
  const container = document.createElement('div')
  container.className = 'tab-container'
  container.appendChild(pane.el)
  pane.el.style.inset = '0'
  panesEl.appendChild(container)
  tabs.push({ id: uid('t'), title: profileName(pid), root: leaf(pane.id), activePane: pane.id, container })
  activeTabIdx = tabs.length - 1
  render()
}

function closeTab(idx: number): void {
  const tab = tabs[idx]
  for (const paneId of leaves(tab.root)) {
    panes.get(paneId)?.dispose()
    panes.delete(paneId)
  }
  tab.container.remove()
  tabs.splice(idx, 1)
  if (activeTabIdx >= tabs.length) activeTabIdx = tabs.length - 1
  if (tabs.length === 0) newTab() // the window never goes empty
  else render()
}

function selectTab(idx: number): void {
  activeTabIdx = idx
  render()
}

export function nextTab(delta: 1 | -1): void {
  if (tabs.length < 2) return
  activeTabIdx = (activeTabIdx + delta + tabs.length) % tabs.length
  render()
}

export function render(): void {
  renderTabBar(
    tabbarEl,
    tabs.map((t) => ({ id: t.id, title: t.title })),
    activeTabIdx,
    profiles,
    { select: selectTab, close: closeTab, newTab }
  )
  tabs.forEach((tab, i) => {
    tab.container.classList.toggle('hidden', i !== activeTabIdx)
  })
  const pane = activePane()
  if (pane) {
    pane.fitNow()
    pane.term.focus()
  }
}

async function boot(): Promise<void> {
  config = (await window.api.getConfig()) as Config
  profiles = (await window.api.getProfiles()) as Profile[]
  window.api.onData((id, d) => panes.get(id)?.term.write(d))
  window.api.onExit((id, c) => panes.get(id)?.handleExit(c))
  newTab()
}

void boot()
```

- [ ] **Step 3: Verify manually**

Run: `npm run dev`
Expected:
1. One tab opens with a live shell; tab title shows the profile name (then the shell's reported title).
2. `+` opens a second tab with the default profile; `▾` lists all detected profiles and opens the chosen one.
3. Clicking tabs switches between live shells (scrollback preserved).
4. `✕` closes a tab; closing the last tab immediately opens a fresh default one.

- [ ] **Step 4: Checkpoint** — `npm test` green, manual tab checks pass.

---

### Task 10: Split panes UI + focus navigation + keybindings

**Files:**
- Create: `src/renderer/pane-view.ts`
- Modify: `src/renderer/main.ts` (add splits, keyboard dispatch — exact edits below)

- [ ] **Step 1: Create `src/renderer/pane-view.ts`**

```ts
import { PaneNode, layout, splitHandles } from '../shared/pane-tree'
import type { TermPane } from './term-pane'

const SPLITTER_PX = 6

export function renderPanes(
  container: HTMLElement,
  root: PaneNode,
  panes: Map<string, TermPane>,
  activePaneId: string,
  onRatio: (splitId: string, ratio: number) => void,
  onFocus: (paneId: string) => void
): void {
  container.querySelectorAll('.splitter').forEach((s) => s.remove())
  const W = container.clientWidth
  const H = container.clientHeight

  for (const [paneId, r] of layout(root)) {
    const pane = panes.get(paneId)
    if (!pane) continue
    if (pane.el.parentElement !== container) container.appendChild(pane.el)
    pane.el.style.left = `${r.x * W}px`
    pane.el.style.top = `${r.y * H}px`
    pane.el.style.width = `${r.w * W}px`
    pane.el.style.height = `${r.h * H}px`
    pane.el.style.inset = ''
    pane.el.classList.toggle('active-pane', paneId === activePaneId)
    pane.el.onmousedown = () => onFocus(paneId)
    pane.fitNow()
  }

  for (const h of splitHandles(root)) {
    const s = document.createElement('div')
    s.className = `splitter ${h.dir}`
    if (h.dir === 'row') {
      s.style.left = `${h.pos * W - SPLITTER_PX / 2}px`
      s.style.top = `${h.rect.y * H}px`
      s.style.width = `${SPLITTER_PX}px`
      s.style.height = `${h.rect.h * H}px`
    } else {
      s.style.left = `${h.rect.x * W}px`
      s.style.top = `${h.pos * H - SPLITTER_PX / 2}px`
      s.style.width = `${h.rect.w * W}px`
      s.style.height = `${SPLITTER_PX}px`
    }
    s.addEventListener('mousedown', (down) => {
      down.preventDefault()
      const move = (e: MouseEvent): void => {
        const ratio = h.dir === 'row'
          ? (e.clientX / W - h.rect.x) / h.rect.w
          : ((e.clientY - container.getBoundingClientRect().top) / H - h.rect.y) / h.rect.h
        onRatio(h.id, ratio)
      }
      const up = (): void => {
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
      }
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
    })
    container.appendChild(s)
  }
}
```

- [ ] **Step 2: Edit `src/renderer/main.ts` — extend imports**

Replace the two import lines for pane-tree/keys with:

```ts
import { PaneNode, leaf, leaves, splitPane, closePane, setRatio, neighbor } from '../shared/pane-tree'
import { matchAction } from '../shared/keys'
import { renderPanes } from './pane-view'
```

- [ ] **Step 3: Edit `src/renderer/main.ts` — replace the per-tab display logic in `render()`**

Replace the `tabs.forEach(...)` block and the trailing focus lines of `render()` with:

```ts
  tabs.forEach((tab, i) => {
    tab.container.classList.toggle('hidden', i !== activeTabIdx)
  })
  const tab = activeTab()
  if (tab) {
    renderPanes(tab.container, tab.root, panes, tab.activePane,
      (splitId, ratio) => {
        tab.root = setRatio(tab.root, splitId, ratio)
        render()
      },
      (paneId) => {
        tab.activePane = paneId
        render()
      }
    )
    panes.get(tab.activePane)?.term.focus()
  }
```

Also remove the now-unused `pane.el.style.inset = '0'` line in `newTab()` (renderPanes positions panes), and add after the `boot()` data/exit wiring:

```ts
  new ResizeObserver(() => render()).observe(panesEl)
```

- [ ] **Step 4: Edit `src/renderer/main.ts` — add split/close/navigate actions + keyboard dispatch** (append at module level)

```ts
function splitActive(dir: 'row' | 'col'): void {
  const tab = activeTab()
  if (!tab) return
  const current = panes.get(tab.activePane)
  const pane = createPane(current?.profileId || config.defaultProfileId || profiles[0].id)
  tab.root = splitPane(tab.root, tab.activePane, dir, pane.id, uid('s'))
  tab.activePane = pane.id
  render()
}

function closeActivePane(): void {
  const tab = activeTab()
  if (!tab) return
  const closingId = tab.activePane
  panes.get(closingId)?.dispose()
  panes.delete(closingId)
  const root = closePane(tab.root, closingId)
  if (root === null) {
    closeTab(activeTabIdx)
    return
  }
  tab.root = root
  tab.activePane = leaves(root)[0]
  render()
}

function focusDirection(dir: 'left' | 'right' | 'up' | 'down'): void {
  const tab = activeTab()
  if (!tab) return
  const target = neighbor(tab.root, tab.activePane, dir)
  if (target) {
    tab.activePane = target
    render()
  }
}

function changeFontSize(delta: number | null): void {
  const next = delta === null ? config.fontSize : (activePane()?.term.options.fontSize ?? config.fontSize) + delta
  const clamped = Math.min(40, Math.max(6, next))
  panes.forEach((p) => p.setFontSize(clamped))
}

async function runAction(action: string): Promise<void> {
  const pane = activePane()
  switch (action) {
    case 'newTab': newTab(); break
    case 'closePane': closeActivePane(); break
    case 'nextTab': nextTab(1); break
    case 'prevTab': nextTab(-1); break
    case 'splitRight': splitActive('row'); break
    case 'splitDown': splitActive('col'); break
    case 'focusLeft': focusDirection('left'); break
    case 'focusRight': focusDirection('right'); break
    case 'focusUp': focusDirection('up'); break
    case 'focusDown': focusDirection('down'); break
    case 'copy': {
      const sel = pane?.term.getSelection()
      if (sel) await navigator.clipboard.writeText(sel)
      break
    }
    case 'paste': {
      const text = await navigator.clipboard.readText()
      if (text && pane && !pane.exited) window.api.write(pane.id, text)
      break
    }
    case 'fontBigger': changeFontSize(1); break
    case 'fontSmaller': changeFontSize(-1); break
    case 'fontReset': changeFontSize(null); break
    // 'find' and 'settings' are wired in Tasks 12 and 13
  }
}

window.addEventListener(
  'keydown',
  (e) => {
    if (!config) return
    const action = matchAction(config.keybindings, e)
    if (action) {
      e.preventDefault()
      e.stopPropagation()
      void runAction(action)
    }
  },
  { capture: true }
)
```

- [ ] **Step 5: Verify manually**

Run: `npm run dev`
Expected:
1. `Ctrl+Shift+D` splits right (new shell, same profile, gets focus, purple outline). `Ctrl+Shift+E` splits down. Nesting works to any depth.
2. Dragging a splitter resizes both sides; terminals reflow.
3. `Alt+Arrow` moves focus to the spatially adjacent pane; clicking a pane focuses it.
4. `Ctrl+Shift+W` closes the focused pane and the layout collapses; closing the last pane closes the tab; closing the last tab spawns a fresh one.
5. Select text, `Ctrl+Shift+C`, then `Ctrl+Shift+V` pastes it. Right-click also pastes.
6. `Ctrl+=` / `Ctrl+-` / `Ctrl+0` change font size live.

- [ ] **Step 6: Checkpoint** — `npm test` green, manual split checks pass.

---

### Task 11: Dropdown window, global hotkey, tray, autostart

**Files:**
- Create: `src/main/window-manager.ts`, `assets/icon.png`
- Modify: `src/main/index.ts` (full replacement)

- [ ] **Step 1: Generate `assets/icon.png`** (solid 32×32 square — fine for v1)

Run in PowerShell:

```powershell
New-Item -ItemType Directory -Force assets | Out-Null
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 32,32
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(255,189,147,249))
$g.Dispose()
$bmp.Save("$PWD\assets\icon.png")
$bmp.Dispose()
```

Expected: `assets\icon.png` exists.

- [ ] **Step 2: Create `src/main/window-manager.ts`**

```ts
import { BrowserWindow, screen } from 'electron'
import path from 'node:path'
import type { Config } from '../shared/config'

export class WindowManager {
  readonly win: BrowserWindow
  private animating = false

  constructor(private getConfig: () => Config) {
    this.win = new BrowserWindow({
      show: false,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      backgroundColor: '#282a36',
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })
    this.win.setAlwaysOnTop(true, 'screen-saver')
    this.win.on('blur', () => {
      if (this.getConfig().hideOnBlur && !this.win.webContents.isDevToolsFocused()) {
        this.hide()
      }
    })
  }

  private targetBounds(): { x: number; y: number; width: number; height: number } {
    const cfg = this.getConfig()
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const wa = display.workArea
    const width = Math.round((wa.width * cfg.widthPct) / 100)
    const height = Math.round((wa.height * cfg.heightPct) / 100)
    return { x: wa.x + Math.round((wa.width - width) / 2), y: wa.y, width, height }
  }

  toggle(): void {
    if (this.win.isVisible() && this.win.isFocused()) this.hide()
    else if (this.win.isVisible()) this.win.focus() // Guake behavior: refocus, don't hide
    else this.show()
  }

  show(): void {
    if (this.animating) return
    const b = this.targetBounds()
    const ms = this.getConfig().animationMs
    if (ms === 0) {
      this.win.setBounds(b)
      this.win.show()
      return
    }
    this.win.setBounds({ ...b, y: b.y - b.height })
    this.win.show()
    this.animate(b.y - b.height, b.y, ms, (y) => this.win.setBounds({ ...b, y }))
  }

  hide(): void {
    if (this.animating || !this.win.isVisible()) return
    const b = this.win.getBounds()
    const ms = this.getConfig().animationMs
    if (ms === 0) {
      this.win.hide()
      return
    }
    this.animate(b.y, b.y - b.height, ms, (y) => this.win.setBounds({ ...b, y }), () =>
      this.win.hide()
    )
  }

  private animate(
    from: number, to: number, ms: number,
    step: (y: number) => void, done?: () => void
  ): void {
    this.animating = true
    const start = Date.now()
    const timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / ms)
      const eased = 1 - (1 - t) * (1 - t) // ease-out
      step(Math.round(from + (to - from) * eased))
      if (t >= 1) {
        clearInterval(timer)
        this.animating = false
        done?.()
      }
    }, 16)
  }

  applyAppearance(): void {
    const cfg = this.getConfig()
    this.win.setOpacity(cfg.opacity)
    try {
      this.win.setBackgroundMaterial(cfg.acrylic ? 'acrylic' : 'none')
    } catch {
      // pre-Win11 — acrylic unsupported, opacity still applies
    }
    if (this.win.isVisible() && !this.animating) this.win.setBounds(this.targetBounds())
  }
}
```

- [ ] **Step 3: Replace `src/main/index.ts`** (final form)

```ts
import { app, globalShortcut, ipcMain, Menu, nativeImage, Tray } from 'electron'
import path from 'node:path'
import * as nodePty from 'node-pty'
import { ConfigStore } from './config-store'
import { detectProfiles } from './profiles'
import { PtyManager, SpawnFn } from './pty-manager'
import { WindowManager } from './window-manager'

if (!app.requestSingleInstanceLock()) app.quit()

const realSpawn: SpawnFn = (exe, args, opts) =>
  nodePty.spawn(exe, args, {
    name: 'xterm-256color',
    useConpty: true,
    cols: opts.cols,
    rows: opts.rows,
    cwd: opts.cwd,
    env: opts.env as { [k: string]: string }
  })

const store = new ConfigStore(path.join(app.getPath('appData'), 'quake-term'))
const ptys = new PtyManager(realSpawn)
let wm: WindowManager
let tray: Tray
let quitting = false
let registeredHotkey = ''

function applyMainConfig(): void {
  const cfg = store.config
  if (registeredHotkey !== cfg.hotkey) {
    if (registeredHotkey) globalShortcut.unregister(registeredHotkey)
    registeredHotkey = ''
    if (globalShortcut.register(cfg.hotkey, () => wm.toggle())) {
      registeredHotkey = cfg.hotkey
    } else {
      tray?.displayBalloon({
        title: 'quake-term',
        content: `Could not register hotkey "${cfg.hotkey}" (in use by another app). Change it in settings; the tray icon still toggles the window.`
      })
    }
  }
  wm.applyAppearance()
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: cfg.startWithWindows, args: ['--hidden'] })
  }
}

function registerIpc(): void {
  ipcMain.handle('pty:spawn', (_e, paneId: string, profileId: string, cols: number, rows: number) => {
    const profile = store.config.profiles.find((p) => p.id === profileId)
    if (!profile) return `unknown profile: ${profileId}`
    try {
      ptys.spawn(
        paneId, profile, cols, rows,
        (d) => wm.win.webContents.send('pty:data', paneId, d),
        (c) => wm.win.webContents.send('pty:exit', paneId, c)
      )
      return null
    } catch (err) {
      return `${profile.exe}: ${String(err)}`
    }
  })
  ipcMain.on('pty:write', (_e, id: string, data: string) => ptys.write(id, data))
  ipcMain.on('pty:resize', (_e, id: string, cols: number, rows: number) => ptys.resize(id, cols, rows))
  ipcMain.on('pty:kill', (_e, id: string) => ptys.kill(id))
  ipcMain.handle('config:get', () => store.config)
  ipcMain.handle('profiles:get', () => store.config.profiles)
  ipcMain.handle('config:set', (_e, patch) => {
    const c = store.set(patch as object)
    applyMainConfig()
    wm.win.webContents.send('config:changed', c)
    return c
  })
  ipcMain.on('window:hide', () => wm.hide())
}

app.whenReady().then(() => {
  store.load()
  if (store.config.profiles.length === 0) {
    const detected = detectProfiles()
    store.set({ profiles: detected, defaultProfileId: detected[0]?.id ?? '' })
  }

  wm = new WindowManager(() => store.config)
  registerIpc()
  if (process.env['ELECTRON_RENDERER_URL']) {
    wm.win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    wm.win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  wm.win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      wm.hide()
    }
  })

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets/icon.png')
    : path.join(app.getAppPath(), 'assets/icon.png')
  tray = new Tray(nativeImage.createFromPath(iconPath))
  tray.setToolTip('quake-term')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Toggle terminal', click: () => wm.toggle() },
    {
      label: 'Settings',
      click: () => {
        wm.show()
        wm.win.webContents.send('ui:open-settings')
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        quitting = true
        app.quit()
      }
    }
  ]))
  tray.on('click', () => wm.toggle())

  applyMainConfig()
  if (store.corrupt) {
    tray.displayBalloon({
      title: 'quake-term',
      content: 'config.json was corrupt — backed up to config.json.bak and reset to defaults.'
    })
  }
  if (!process.argv.includes('--hidden')) wm.show()
})

app.on('second-instance', () => wm?.toggle())
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  ptys.killAll()
})
app.on('window-all-closed', () => {
  // keep running in the tray
})
```

- [ ] **Step 4: Verify manually**

Run: `npm run dev`
Expected:
1. Window slides down from the top of the screen, full-width, ~45% height, frameless, no taskbar entry.
2. ``Ctrl+` `` hides it (slide up) and shows it again — works while any other app has focus.
3. Clicking another window hides it (hide-on-blur). Hotkey while visible-but-unfocused refocuses instead of hiding.
4. With two monitors: move the mouse to the other monitor, hit the hotkey — it drops down there.
5. Tray icon (purple square) appears: click toggles; right-click menu has Toggle/Settings/Quit. Quit fully exits.
6. Launching a second instance toggles the existing window instead of opening a new one.

- [ ] **Step 5: Checkpoint** — `npm test` green, manual dropdown checks pass.

---

### Task 12: Find bar

**Files:**
- Create: `src/renderer/find-bar.ts`
- Modify: `src/renderer/main.ts` (wire `find` action)

- [ ] **Step 1: Create `src/renderer/find-bar.ts`**

```ts
import type { TermPane } from './term-pane'

export class FindBar {
  private el = document.createElement('div')
  private input = document.createElement('input')
  private pane: TermPane | null = null

  constructor(parent: HTMLElement) {
    this.el.id = 'findbar'
    this.el.className = 'overlay hidden'
    this.input.placeholder = 'Find… (Enter next, Shift+Enter prev, Esc close)'
    this.el.appendChild(this.input)
    parent.appendChild(this.el)

    this.input.addEventListener('input', () => {
      if (this.pane) this.pane.search.findNext(this.input.value, { incremental: true })
    })
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Escape') this.close()
      else if (e.key === 'Enter' && e.shiftKey) this.pane?.search.findPrevious(this.input.value)
      else if (e.key === 'Enter') this.pane?.search.findNext(this.input.value)
    })
  }

  open(pane: TermPane): void {
    this.pane = pane
    this.el.classList.remove('hidden')
    this.input.select()
    this.input.focus()
  }

  close(): void {
    this.el.classList.add('hidden')
    this.pane?.term.focus()
    this.pane = null
  }
}
```

- [ ] **Step 2: Wire into `src/renderer/main.ts`**

Add import:

```ts
import { FindBar } from './find-bar'
```

Add after the `panesEl` declaration:

```ts
const findBar = new FindBar(document.body)
```

Add to the `switch` in `runAction`:

```ts
    case 'find': {
      if (pane) findBar.open(pane)
      break
    }
```

- [ ] **Step 3: Verify manually**

Run: `npm run dev`. Run `dir` a few times, hit `Ctrl+Shift+F`, type a filename fragment.
Expected: matches highlight as you type; Enter/Shift+Enter cycle; Esc closes and refocuses the terminal.

- [ ] **Step 4: Checkpoint** — `npm test` green.

---

### Task 13: Settings UI + live appearance apply

**Files:**
- Create: `src/renderer/settings-ui.ts`
- Modify: `src/renderer/main.ts` (wire `settings` action, config-changed handling, UI theme)

- [ ] **Step 1: Create `src/renderer/settings-ui.ts`**

```ts
import type { Config, Profile } from '../shared/config'
import { THEMES } from './themes'

type Patch = (patch: Partial<Config>) => void

export class SettingsUI {
  private el = document.createElement('div')

  constructor(parent: HTMLElement, private getConfig: () => Config,
              private getProfiles: () => Profile[], private patch: Patch) {
    this.el.id = 'settings'
    this.el.className = 'overlay hidden'
    parent.appendChild(this.el)
  }

  toggle(): void {
    if (this.el.classList.contains('hidden')) this.open()
    else this.close()
  }

  open(): void {
    this.rebuild()
    this.el.classList.remove('hidden')
  }

  close(): void {
    this.el.classList.add('hidden')
  }

  rebuild(): void {
    const cfg = this.getConfig()
    this.el.textContent = ''
    const h = document.createElement('h2')
    h.textContent = 'Settings'
    this.el.appendChild(h)

    this.select('Theme', Object.keys(THEMES), cfg.theme, (v) => this.patch({ theme: v }))
    this.select('Default profile', this.getProfiles().map((p) => p.id), cfg.defaultProfileId,
      (v) => this.patch({ defaultProfileId: v }),
      (id) => this.getProfiles().find((p) => p.id === id)?.name ?? id)
    this.text('Font family', cfg.fontFamily, (v) => this.patch({ fontFamily: v }))
    this.number('Font size', cfg.fontSize, 6, 40, 1, (v) => this.patch({ fontSize: v }))
    this.number('Line height', cfg.lineHeight, 1, 2, 0.05, (v) => this.patch({ lineHeight: v }))
    this.number('Opacity', cfg.opacity, 0.3, 1, 0.05, (v) => this.patch({ opacity: v }))
    this.check('Acrylic blur (Win11)', cfg.acrylic, (v) => this.patch({ acrylic: v }))
    this.number('Width %', cfg.widthPct, 20, 100, 5, (v) => this.patch({ widthPct: v }))
    this.number('Height %', cfg.heightPct, 20, 100, 5, (v) => this.patch({ heightPct: v }))
    this.number('Animation ms (0 = off)', cfg.animationMs, 0, 1000, 25, (v) => this.patch({ animationMs: v }))
    this.check('Hide on focus loss', cfg.hideOnBlur, (v) => this.patch({ hideOnBlur: v }))
    this.check('Start with Windows', cfg.startWithWindows, (v) => this.patch({ startWithWindows: v }))
    this.text('Toggle hotkey', cfg.hotkey, (v) => this.patch({ hotkey: v }))
  }

  private row(label: string, input: HTMLElement): void {
    const row = document.createElement('div')
    row.className = 'row'
    const l = document.createElement('label')
    l.textContent = label
    row.append(l, input)
    this.el.appendChild(row)
  }

  private text(label: string, value: string, set: (v: string) => void): void {
    const i = document.createElement('input')
    i.value = value
    i.addEventListener('change', () => set(i.value))
    i.addEventListener('keydown', (e) => e.stopPropagation())
    this.row(label, i)
  }

  private number(label: string, value: number, min: number, max: number, step: number,
                 set: (v: number) => void): void {
    const i = document.createElement('input')
    i.type = 'number'
    i.min = String(min)
    i.max = String(max)
    i.step = String(step)
    i.value = String(value)
    i.addEventListener('change', () => set(Number(i.value)))
    i.addEventListener('keydown', (e) => e.stopPropagation())
    this.row(label, i)
  }

  private check(label: string, value: boolean, set: (v: boolean) => void): void {
    const i = document.createElement('input')
    i.type = 'checkbox'
    i.checked = value
    i.addEventListener('change', () => set(i.checked))
    this.row(label, i)
  }

  private select(label: string, options: string[], value: string,
                 set: (v: string) => void, display: (v: string) => string = (v) => v): void {
    const s = document.createElement('select')
    for (const opt of options) {
      const o = document.createElement('option')
      o.value = opt
      o.textContent = display(opt)
      o.selected = opt === value
      s.appendChild(o)
    }
    s.addEventListener('change', () => set(s.value))
    this.row(label, s)
  }
}
```

- [ ] **Step 2: Wire into `src/renderer/main.ts`**

Add imports:

```ts
import { SettingsUI } from './settings-ui'
import { themeOf } from './themes'
```

Add after the `findBar` declaration:

```ts
const settings = new SettingsUI(
  document.body,
  () => config,
  () => profiles,
  (patch) => void window.api.setConfig(patch)
)

function applyUiTheme(cfg: Config): void {
  const bg = String(themeOf(cfg.theme).background)
  document.documentElement.style.setProperty('--term-bg', bg)
}
```

Add to the `switch` in `runAction`:

```ts
    case 'settings': settings.toggle(); break
```

Add inside `boot()` after the onExit wiring:

```ts
  applyUiTheme(config)
  window.api.onConfigChanged((c) => {
    config = c as Config
    panes.forEach((p) => p.applyConfig(config))
    applyUiTheme(config)
    settings.rebuild()
    render()
  })
  window.api.onOpenSettings(() => settings.open())
```

- [ ] **Step 3: Verify manually**

Run: `npm run dev`
Expected:
1. `Ctrl+,` opens settings; the tray menu's "Settings" does too.
2. Changing theme recolors every terminal and the window background instantly.
3. Font size/family/line height apply live; terminals refit.
4. Opacity slider makes the window translucent; acrylic checkbox blurs (Win11).
5. Height/Width % resize the visible window immediately.
6. Changing the hotkey re-registers it (old one stops working, new one works).
7. Restart the app — all settings persisted in `%APPDATA%\quake-term\config.json`.

- [ ] **Step 4: Checkpoint** — `npm test` green, manual settings checks pass.

---

### Task 14: Packaging + final smoke checklist

**Files:**
- Modify: `package.json` (electron-builder config)

- [ ] **Step 1: Add electron-builder**

Run: `npm install -D electron-builder`

Add to `package.json` scripts:

```json
    "dist": "electron-vite build && electron-builder --win"
```

Add a top-level `build` key to `package.json`:

```json
  "build": {
    "appId": "local.quake-term",
    "productName": "quake-term",
    "files": ["out/**"],
    "extraResources": [{ "from": "assets", "to": "assets" }],
    "win": { "target": ["nsis"] },
    "nsis": { "oneClick": true, "runAfterFinish": true }
  }
```

- [ ] **Step 2: Build the installer**

Run: `npm run dist`
Expected: `dist/quake-term Setup 0.1.0.exe` produced. Install it.

- [ ] **Step 3: Final smoke checklist (installed app)**

- [ ] ``Ctrl+` `` toggles from anywhere; slide animation plays
- [ ] Drops on the monitor where the mouse is
- [ ] Hide-on-blur works; hotkey-refocus-when-unfocused works
- [ ] Tabs: create (default + chosen profile), switch, close; last tab respawns
- [ ] Splits: right/down, nested, drag-resize, Alt+arrow navigation, close collapses
- [ ] All detected shells start (pwsh/PowerShell/cmd/WSL/Git Bash)
- [ ] `exit` in a shell shows restart message; Enter restarts
- [ ] Copy/paste/find/font-size shortcuts work
- [ ] Settings apply live and persist across restart
- [ ] "Start with Windows" registers the login item (check Task Manager → Startup apps)
- [ ] Quit from tray fully exits (no orphan shells in Task Manager)

- [ ] **Step 4: Done** — v1 complete per spec.

---

## Self-review notes

- **Spec coverage:** hotkey/dropdown/animation/multi-monitor/blur-hide (Task 11), tabs (9), splits + focus nav (10), profiles incl. WSL UTF-16 quirk (6), appearance + live apply (13), find/links/clipboard (8/10/12), resilience (8/10: restart-on-Enter, last-pane respawn, spawn-error inline, corrupt-config recovery in 3/11), config (2/3), packaging + start-with-Windows (11/14).
- **Deviation:** real-ConPTY automated tests dropped (Electron-ABI rebuild makes node-pty unloadable under Vitest); covered by injected-fake unit tests + Task 8 manual end-to-end. Noted at top.
- **Type consistency check:** `PtyLike`/`SpawnFn` match node-pty's `IPty` structurally; preload `Api` names match all renderer call sites; `splitHandles`' `pos`/`rect` match pane-view drag math; `Action` union matches `runAction` cases (find/settings wired in 12/13).
