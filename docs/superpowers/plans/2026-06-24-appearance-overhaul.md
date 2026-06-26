# Appearance Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the terminal's bare appearance settings into a cohesive customization experience: a full theme editor, more presets, new terminal options (cursor/weight/spacing/padding/accent), a theme-aware chrome, a categorized settings modal, and per-profile appearance.

**Architecture:** Move all themeable, pure logic into `src/shared/theme.ts` (testable like `keys.ts`/`pane-tree.ts`): the `TerminalTheme` type, 11 built-in palettes, validation, resolution, hex/luminance helpers, `uiPalette()` (derives chrome CSS variables from the active theme), and `resolveAppearance()` (per-profile override merge). `src/shared/config.ts` gains validated fields. The renderer consumes these to drive xterm options, CSS variables, and a rewritten categorized settings modal.

**Tech Stack:** Electron, xterm.js, TypeScript, electron-vite, Vitest.

## Global Constraints

- **Commit messages:** `[<type>] <imperative summary>` (capitalized, no trailing period, ≤50 chars), types `feat|fix|docs|refactor|test|chore`. **NEVER** add Claude/AI references, co-author lines, or "Generated with" footers.
- **Typecheck gate (every task):** `npx tsc --noEmit -p tsconfig.json` must exit 0.
- **Test gate (logic tasks):** `npm test` (alias for `vitest run`) must pass.
- **node-pty / Electron cannot load in Vitest** — only pure modules under `src/shared/` are unit-tested. GUI behavior is verified by hand via `npm run dev` (project convention).
- **Pure modules stay pure:** `src/shared/theme.ts` and `src/shared/config.ts` must not import Electron, xterm, or DOM-only APIs. `theme.ts` must not import `config.ts` (no cycle); `config.ts` imports from `theme.ts`.
- **DRY / YAGNI / TDD / frequent commits.** Out of scope: background images, configurable scrollback, ligature addon, per-pane (vs per-profile) theming.

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/theme.ts` | **new** — `TerminalTheme` type + color keys, 11 built-ins, hex/luminance helpers, `isTerminalTheme`, `resolveTheme`, `uiPalette`, `resolveAppearance` |
| `src/shared/config.ts` | new validated fields (`customThemes`, `accent`, `cursorStyle`, `cursorBlink`, `fontWeight`, `letterSpacing`, `padding`); profile override sanitize |
| `src/renderer/themes.ts` | Task 5: reduced to re-export of `shared/theme`; Task 6: deleted |
| `src/renderer/term-pane.ts` | apply new xterm options + per-profile resolved appearance |
| `src/renderer/main.ts` | `applyAppearance` (CSS vars via `uiPalette` + padding), pass profile to panes, modal focus/keydown guards, tab colors |
| `src/renderer/settings-ui.ts` | rewritten categorized modal + theme editor + `syncFromConfig` |
| `src/renderer/styles.css` | theme-aware chrome via CSS vars + modal styling + polish |
| `src/renderer/tab-bar.ts` | profile color dot |
| `tests/theme.test.ts` | **new** — theme/palette/appearance pure-logic tests |
| `tests/config.test.ts` | new-field + custom-theme + profile-override cases |

**Task order:** 1–4 are pure-logic TDD (real tests). 5–8 are renderer (typecheck + build + manual verify). Each task leaves the app compiling and runnable.

---

### Task 1: Theme model — types, palettes, hex helpers, validation, resolution

**Files:**
- Create: `src/shared/theme.ts`
- Test: `tests/theme.test.ts`

**Interfaces:**
- Produces:
  - `interface TerminalTheme` — 21 required hex-string color fields.
  - `const THEME_COLOR_KEYS: readonly (keyof TerminalTheme)[]`
  - `const BUILTIN_THEMES: Record<string, TerminalTheme>` (11 themes; `dracula` is the fallback)
  - `isHexColor(v: unknown): v is string`
  - `parseHex(hex: string): { r: number; g: number; b: number }`
  - `toHex(rgb: { r: number; g: number; b: number }): string`
  - `isTerminalTheme(v: unknown): v is TerminalTheme`
  - `resolveTheme(name: string, custom?: Record<string, TerminalTheme>): TerminalTheme`

- [ ] **Step 1: Write the failing test** — `tests/theme.test.ts`

```ts
import { describe, expect, test } from 'vitest'
import {
  BUILTIN_THEMES, THEME_COLOR_KEYS, isHexColor, parseHex, toHex,
  isTerminalTheme, resolveTheme
} from '../src/shared/theme'

describe('hex helpers', () => {
  test('isHexColor accepts 3- and 6-digit hex, rejects others', () => {
    expect(isHexColor('#fff')).toBe(true)
    expect(isHexColor('#ff8800')).toBe(true)
    expect(isHexColor('fff')).toBe(false)
    expect(isHexColor('#ggg')).toBe(false)
    expect(isHexColor(42)).toBe(false)
  })

  test('parseHex expands shorthand and toHex round-trips', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(parseHex('#000000')).toEqual({ r: 0, g: 0, b: 0 })
    expect(toHex({ r: 128, g: 128, b: 128 })).toBe('#808080')
    expect(toHex(parseHex('#bd93f9'))).toBe('#bd93f9')
  })
})

describe('themes', () => {
  test('every built-in is a complete theme', () => {
    for (const name of Object.keys(BUILTIN_THEMES)) {
      expect(isTerminalTheme(BUILTIN_THEMES[name])).toBe(true)
    }
    expect(Object.keys(BUILTIN_THEMES).length).toBe(11)
    expect(THEME_COLOR_KEYS.length).toBe(21)
  })

  test('isTerminalTheme rejects missing or non-hex colors', () => {
    expect(isTerminalTheme({ ...BUILTIN_THEMES.dracula, red: 'tomato' })).toBe(false)
    const { red, ...missing } = BUILTIN_THEMES.dracula
    expect(isTerminalTheme(missing)).toBe(false)
    expect(isTerminalTheme(null)).toBe(false)
  })

  test('resolveTheme prefers custom, then built-in, else dracula', () => {
    const mine = { ...BUILTIN_THEMES.nord }
    expect(resolveTheme('mine', { mine })).toBe(mine)
    expect(resolveTheme('nord')).toBe(BUILTIN_THEMES.nord)
    expect(resolveTheme('does-not-exist')).toBe(BUILTIN_THEMES.dracula)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/theme.test.ts`
Expected: FAIL — cannot resolve `../src/shared/theme`.

- [ ] **Step 3: Write minimal implementation** — `src/shared/theme.ts`

```ts
export interface TerminalTheme {
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

export const THEME_COLOR_KEYS = [
  'background', 'foreground', 'cursor', 'cursorAccent', 'selectionBackground',
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue',
  'brightMagenta', 'brightCyan', 'brightWhite'
] as const satisfies readonly (keyof TerminalTheme)[]

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && HEX_RE.test(v)
}

export function parseHex(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  const n = parseInt(h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function clamp8(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

export function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const n = (clamp8(r) << 16) | (clamp8(g) << 8) | clamp8(b)
  return '#' + n.toString(16).padStart(6, '0')
}

export function isTerminalTheme(v: unknown): v is TerminalTheme {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return THEME_COLOR_KEYS.every((k) => isHexColor(o[k]))
}

export const BUILTIN_THEMES: Record<string, TerminalTheme> = {
  dracula: {
    background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', cursorAccent: '#282a36',
    selectionBackground: '#44475a',
    black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
    blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
    brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94',
    brightYellow: '#ffffa5', brightBlue: '#d6acff', brightMagenta: '#ff92df',
    brightCyan: '#a4ffff', brightWhite: '#ffffff'
  },
  'one-dark': {
    background: '#282c34', foreground: '#abb2bf', cursor: '#528bff', cursorAccent: '#282c34',
    selectionBackground: '#3e4451',
    black: '#1e2127', red: '#e06c75', green: '#98c379', yellow: '#e5c07b',
    blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
    brightBlack: '#5c6370', brightRed: '#e06c75', brightGreen: '#98c379',
    brightYellow: '#e5c07b', brightBlue: '#61afef', brightMagenta: '#c678dd',
    brightCyan: '#56b6c2', brightWhite: '#ffffff'
  },
  'solarized-dark': {
    background: '#002b36', foreground: '#839496', cursor: '#93a1a1', cursorAccent: '#002b36',
    selectionBackground: '#073642',
    black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
    blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#586e75', brightRed: '#cb4b16', brightGreen: '#859900',
    brightYellow: '#b58900', brightBlue: '#268bd2', brightMagenta: '#6c71c4',
    brightCyan: '#2aa198', brightWhite: '#fdf6e3'
  },
  'solarized-light': {
    background: '#fdf6e3', foreground: '#657b83', cursor: '#586e75', cursorAccent: '#fdf6e3',
    selectionBackground: '#eee8d5',
    black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
    blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#586e75', brightRed: '#cb4b16', brightGreen: '#859900',
    brightYellow: '#b58900', brightBlue: '#268bd2', brightMagenta: '#6c71c4',
    brightCyan: '#2aa198', brightWhite: '#fdf6e3'
  },
  'gruvbox-dark': {
    background: '#282828', foreground: '#ebdbb2', cursor: '#ebdbb2', cursorAccent: '#282828',
    selectionBackground: '#504945',
    black: '#282828', red: '#cc241d', green: '#98971a', yellow: '#d79921',
    blue: '#458588', magenta: '#b16286', cyan: '#689d6a', white: '#a89984',
    brightBlack: '#928374', brightRed: '#fb4934', brightGreen: '#b8bb26',
    brightYellow: '#fabd2f', brightBlue: '#83a598', brightMagenta: '#d3869b',
    brightCyan: '#8ec07c', brightWhite: '#ebdbb2'
  },
  nord: {
    background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9', cursorAccent: '#2e3440',
    selectionBackground: '#434c5e',
    black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b',
    blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
    brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c',
    brightYellow: '#ebcb8b', brightBlue: '#81a1c1', brightMagenta: '#b48ead',
    brightCyan: '#8fbcbb', brightWhite: '#eceff4'
  },
  'tokyo-night': {
    background: '#1a1b26', foreground: '#c0caf5', cursor: '#c0caf5', cursorAccent: '#1a1b26',
    selectionBackground: '#283457',
    black: '#15161e', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68',
    blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
    brightBlack: '#414868', brightRed: '#f7768e', brightGreen: '#9ece6a',
    brightYellow: '#e0af68', brightBlue: '#7aa2f7', brightMagenta: '#bb9af7',
    brightCyan: '#7dcfff', brightWhite: '#c0caf5'
  },
  'catppuccin-mocha': {
    background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc', cursorAccent: '#1e1e2e',
    selectionBackground: '#585b70',
    black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
    blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
    brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1',
    brightYellow: '#f9e2af', brightBlue: '#89b4fa', brightMagenta: '#f5c2e7',
    brightCyan: '#94e2d5', brightWhite: '#a6adc8'
  },
  'github-dark': {
    background: '#0d1117', foreground: '#c9d1d9', cursor: '#c9d1d9', cursorAccent: '#0d1117',
    selectionBackground: '#264f78',
    black: '#484f58', red: '#ff7b72', green: '#3fb950', yellow: '#d29922',
    blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39c5cf', white: '#b1bac4',
    brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364',
    brightYellow: '#e3b341', brightBlue: '#79c0ff', brightMagenta: '#d2a8ff',
    brightCyan: '#56d4dd', brightWhite: '#f0f6fc'
  },
  monokai: {
    background: '#272822', foreground: '#f8f8f2', cursor: '#f8f8f0', cursorAccent: '#272822',
    selectionBackground: '#49483e',
    black: '#272822', red: '#f92672', green: '#a6e22e', yellow: '#f4bf75',
    blue: '#66d9ef', magenta: '#ae81ff', cyan: '#a1efe4', white: '#f8f8f2',
    brightBlack: '#75715e', brightRed: '#f92672', brightGreen: '#a6e22e',
    brightYellow: '#f4bf75', brightBlue: '#66d9ef', brightMagenta: '#ae81ff',
    brightCyan: '#a1efe4', brightWhite: '#f9f8f5'
  },
  'rose-pine': {
    background: '#191724', foreground: '#e0def4', cursor: '#e0def4', cursorAccent: '#191724',
    selectionBackground: '#403d52',
    black: '#26233a', red: '#eb6f92', green: '#31748f', yellow: '#f6c177',
    blue: '#9ccfd8', magenta: '#c4a7e7', cyan: '#ebbcba', white: '#e0def4',
    brightBlack: '#6e6a86', brightRed: '#eb6f92', brightGreen: '#31748f',
    brightYellow: '#f6c177', brightBlue: '#9ccfd8', brightMagenta: '#c4a7e7',
    brightCyan: '#ebbcba', brightWhite: '#e0def4'
  }
}

export function resolveTheme(
  name: string,
  custom: Record<string, TerminalTheme> = {}
): TerminalTheme {
  return custom[name] ?? BUILTIN_THEMES[name] ?? BUILTIN_THEMES.dracula
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/theme.test.ts`
Expected: PASS (all in the two describe blocks).

- [ ] **Step 5: Commit**

```bash
git add src/shared/theme.ts tests/theme.test.ts
git commit -m "[feat] add shared theme model, palettes, and validation"
```

---

### Task 2: Chrome palette — luminance, accent derivation, `uiPalette`

**Files:**
- Modify: `src/shared/theme.ts` (append)
- Test: `tests/theme.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `TerminalTheme`, `parseHex`, `toHex`, `isHexColor`, `BUILTIN_THEMES` (Task 1)
- Produces:
  - `mix(a: string, b: string, t: number): string`
  - `relativeLuminance(hex: string): number`
  - `isLight(theme: TerminalTheme): boolean`
  - `deriveAccent(theme: TerminalTheme, accent: string): string`
  - `interface UiPalette { termBg; uiBg; uiFg; uiAccent; uiBorder; uiMuted }`
  - `uiPalette(theme: TerminalTheme, accent: string): UiPalette`

- [ ] **Step 1: Write the failing test** — append to `tests/theme.test.ts`

```ts
import { mix, relativeLuminance, isLight, deriveAccent, uiPalette } from '../src/shared/theme'

describe('palette math', () => {
  test('mix blends two colors at t', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff')
  })

  test('relativeLuminance ranks white above black', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#ffffff')).toBeGreaterThan(relativeLuminance('#808080'))
  })

  test('isLight is true only for light backgrounds', () => {
    expect(isLight(BUILTIN_THEMES['solarized-light'])).toBe(true)
    expect(isLight(BUILTIN_THEMES.dracula)).toBe(false)
  })

  test('deriveAccent returns override when hex, else theme blue', () => {
    expect(deriveAccent(BUILTIN_THEMES.dracula, '#ff0000')).toBe('#ff0000')
    expect(deriveAccent(BUILTIN_THEMES.dracula, '')).toBe(BUILTIN_THEMES.dracula.blue)
    expect(deriveAccent(BUILTIN_THEMES.dracula, 'garbage')).toBe(BUILTIN_THEMES.dracula.blue)
  })

  test('uiPalette passes through and derives a matching-lightness chrome', () => {
    const dark = uiPalette(BUILTIN_THEMES.dracula, '')
    expect(dark.termBg).toBe(BUILTIN_THEMES.dracula.background)
    expect(dark.uiFg).toBe(BUILTIN_THEMES.dracula.foreground)
    expect(dark.uiAccent).toBe(BUILTIN_THEMES.dracula.blue)
    expect(relativeLuminance(dark.uiBg)).toBeLessThan(0.5)

    const light = uiPalette(BUILTIN_THEMES['solarized-light'], '#112233')
    expect(light.uiAccent).toBe('#112233')
    expect(relativeLuminance(light.uiBg)).toBeGreaterThan(0.5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/theme.test.ts`
Expected: FAIL — `mix`/`uiPalette` not exported.

- [ ] **Step 3: Write minimal implementation** — append to `src/shared/theme.ts`

```ts
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a)
  const y = parseHex(b)
  return toHex({
    r: x.r + (y.r - x.r) * t,
    g: x.g + (y.g - x.g) * t,
    b: x.b + (y.b - x.b) * t
  })
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex)
  const lin = (c: number): number => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function isLight(theme: TerminalTheme): boolean {
  return relativeLuminance(theme.background) > 0.5
}

export function deriveAccent(theme: TerminalTheme, accent: string): string {
  return isHexColor(accent) ? accent : theme.blue
}

export interface UiPalette {
  termBg: string
  uiBg: string
  uiFg: string
  uiAccent: string
  uiBorder: string
  uiMuted: string
}

export function uiPalette(theme: TerminalTheme, accent: string): UiPalette {
  const light = isLight(theme)
  const contrast = light ? '#000000' : '#ffffff'
  return {
    termBg: theme.background,
    uiBg: mix(theme.background, '#000000', light ? 0.06 : 0.18),
    uiFg: theme.foreground,
    uiAccent: deriveAccent(theme, accent),
    uiBorder: mix(theme.background, contrast, 0.16),
    uiMuted: mix(theme.foreground, theme.background, 0.45)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/theme.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/theme.ts tests/theme.test.ts
git commit -m "[feat] derive theme-aware chrome palette"
```

---

### Task 3: Per-profile appearance resolution

**Files:**
- Modify: `src/shared/theme.ts` (append)
- Test: `tests/theme.test.ts` (append a describe block)

**Interfaces:**
- Produces:
  - `interface AppearanceGlobals { theme: string; fontFamily: string; fontSize: number }`
  - `interface ProfileAppearance { theme?: string; fontFamily?: string; fontSize?: number }`
  - `resolveAppearance(globals: AppearanceGlobals, profile?: ProfileAppearance): AppearanceGlobals`
  - (`AppearanceGlobals` is reused as the return type — same three fields, all required.)

- [ ] **Step 1: Write the failing test** — append to `tests/theme.test.ts`

```ts
import { resolveAppearance } from '../src/shared/theme'

describe('resolveAppearance', () => {
  const globals = { theme: 'dracula', fontFamily: 'Cascadia Mono', fontSize: 14 }

  test('returns globals when no profile overrides', () => {
    expect(resolveAppearance(globals)).toEqual(globals)
    expect(resolveAppearance(globals, {})).toEqual(globals)
  })

  test('profile overrides win field-by-field', () => {
    expect(resolveAppearance(globals, { theme: 'nord' }))
      .toEqual({ theme: 'nord', fontFamily: 'Cascadia Mono', fontSize: 14 })
    expect(resolveAppearance(globals, { fontSize: 20 }))
      .toEqual({ theme: 'dracula', fontFamily: 'Cascadia Mono', fontSize: 20 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/theme.test.ts`
Expected: FAIL — `resolveAppearance` not exported.

- [ ] **Step 3: Write minimal implementation** — append to `src/shared/theme.ts`

```ts
export interface AppearanceGlobals {
  theme: string
  fontFamily: string
  fontSize: number
}

export interface ProfileAppearance {
  theme?: string
  fontFamily?: string
  fontSize?: number
}

export function resolveAppearance(
  globals: AppearanceGlobals,
  profile?: ProfileAppearance
): AppearanceGlobals {
  return {
    theme: profile?.theme ?? globals.theme,
    fontFamily: profile?.fontFamily ?? globals.fontFamily,
    fontSize: profile?.fontSize ?? globals.fontSize
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/theme.test.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS; tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/shared/theme.ts tests/theme.test.ts
git commit -m "[feat] resolve per-profile appearance overrides"
```

---

### Task 4: Config schema — new appearance fields + profile sanitize

**Files:**
- Modify: `src/shared/config.ts`
- Test: `tests/config.test.ts` (append cases; existing tests must stay green)

**Interfaces:**
- Consumes: `TerminalTheme`, `isTerminalTheme`, `isHexColor` (Task 1)
- Produces (additions to `Config`): `customThemes: Record<string, TerminalTheme>`, `accent: string`, `cursorStyle: CursorStyle`, `cursorBlink: boolean`, `fontWeight: number`, `letterSpacing: number`, `padding: number`; `type CursorStyle = 'block' | 'bar' | 'underline'`; `Profile` gains optional `theme?`, `fontFamily?`, `fontSize?` (and existing `color?`).

- [ ] **Step 1: Write the failing test** — append cases to `tests/config.test.ts`

```ts
import { BUILTIN_THEMES } from '../src/shared/theme'

describe('mergeConfig appearance fields', () => {
  test('defaults include the new fields', () => {
    const c = mergeConfig({})
    expect(c.customThemes).toEqual({})
    expect(c.accent).toBe('')
    expect(c.cursorStyle).toBe('block')
    expect(c.cursorBlink).toBe(true)
    expect(c.fontWeight).toBe(400)
    expect(c.letterSpacing).toBe(0)
    expect(c.padding).toBe(6)
  })

  test('cursorStyle accepts the enum, else falls back', () => {
    expect(mergeConfig({ cursorStyle: 'bar' }).cursorStyle).toBe('bar')
    expect(mergeConfig({ cursorStyle: 'fancy' }).cursorStyle).toBe('block')
  })

  test('numeric appearance fields clamp to range', () => {
    expect(mergeConfig({ fontWeight: 700 }).fontWeight).toBe(700)
    expect(mergeConfig({ fontWeight: 5000 }).fontWeight).toBe(400)
    expect(mergeConfig({ letterSpacing: 1 }).letterSpacing).toBe(1)
    expect(mergeConfig({ letterSpacing: -9 }).letterSpacing).toBe(0)
    expect(mergeConfig({ padding: 12 }).padding).toBe(12)
    expect(mergeConfig({ padding: 99 }).padding).toBe(6)
  })

  test('accent keeps strings, rejects non-strings', () => {
    expect(mergeConfig({ accent: '#abcdef' }).accent).toBe('#abcdef')
    expect(mergeConfig({ accent: 42 }).accent).toBe('')
  })

  test('customThemes keep valid entries and drop malformed', () => {
    const c = mergeConfig({
      customThemes: { good: BUILTIN_THEMES.nord, bad: { background: '#000' } }
    })
    expect(c.customThemes.good).toEqual(BUILTIN_THEMES.nord)
    expect('bad' in c.customThemes).toBe(false)
  })

  test('profile appearance overrides are validated, profile still loads', () => {
    const base = { id: 'ps', name: 'PowerShell', exe: 'pwsh.exe', args: [] }
    const c = mergeConfig({
      profiles: [{
        ...base, color: '#ff8800', theme: 'nord', fontFamily: 'Hack',
        fontSize: 99
      }]
    })
    const p = c.profiles[0]
    expect(p.color).toBe('#ff8800')
    expect(p.theme).toBe('nord')
    expect(p.fontFamily).toBe('Hack')
    expect('fontSize' in p).toBe(false) // 99 out of range -> dropped

    const c2 = mergeConfig({ profiles: [{ ...base, color: 'notacolor' }] })
    expect('color' in c2.profiles[0]).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL — new fields undefined; `customThemes` etc. missing.

- [ ] **Step 3: Write the implementation** — edit `src/shared/config.ts`

Add the import at the top of the file:

```ts
import { TerminalTheme, isTerminalTheme, isHexColor } from './theme'
```

Add the `CursorStyle` type near `Action`:

```ts
export type CursorStyle = 'block' | 'bar' | 'underline'
```

Extend the `Profile` interface (add the three optional fields; `color?` already exists):

```ts
export interface Profile {
  id: string
  name: string
  exe: string
  args: string[]
  cwd?: string
  color?: string
  theme?: string
  fontFamily?: string
  fontSize?: number
}
```

Extend the `Config` interface — add these fields (place them after `theme: string`):

```ts
  theme: string
  customThemes: Record<string, TerminalTheme>
  accent: string
  cursorStyle: CursorStyle
  cursorBlink: boolean
  fontWeight: number
  letterSpacing: number
  padding: number
```

Extend `DEFAULT_CONFIG` — add after `theme: 'dracula',`:

```ts
  theme: 'dracula',
  customThemes: {},
  accent: '',
  cursorStyle: 'block',
  cursorBlink: true,
  fontWeight: 400,
  letterSpacing: 0,
  padding: 6,
```

Add these helpers next to `num`/`bool`/`str`:

```ts
function oneOf<T extends string>(v: unknown, opts: readonly T[], def: T): T {
  return typeof v === 'string' && (opts as readonly string[]).includes(v) ? (v as T) : def
}

function mergeCustomThemes(v: unknown): Record<string, TerminalTheme> {
  const out: Record<string, TerminalTheme> = {}
  if (v && typeof v === 'object') {
    for (const [name, t] of Object.entries(v as Record<string, unknown>)) {
      if (name && isTerminalTheme(t)) out[name] = t
    }
  }
  return out
}

function sanitizeProfile(v: unknown): Profile | null {
  if (!isProfile(v)) return null
  const p = v as Profile & Record<string, unknown>
  const out: Profile = { id: p.id, name: p.name, exe: p.exe, args: p.args }
  if (typeof p.cwd === 'string') out.cwd = p.cwd
  if (isHexColor(p.color)) out.color = p.color
  if (typeof p.theme === 'string' && p.theme) out.theme = p.theme
  if (typeof p.fontFamily === 'string' && p.fontFamily) out.fontFamily = p.fontFamily
  if (typeof p.fontSize === 'number' && Number.isFinite(p.fontSize) &&
      p.fontSize >= 6 && p.fontSize <= 40) out.fontSize = p.fontSize
  return out
}
```

In `mergeConfig`, replace the `profiles:` line:

```ts
    profiles: Array.isArray(r.profiles)
      ? r.profiles.map(sanitizeProfile).filter((p): p is Profile => p !== null)
      : [],
```

And add the new fields to the returned object (after `theme: str(r.theme, d.theme),`):

```ts
    theme: str(r.theme, d.theme),
    customThemes: mergeCustomThemes(r.customThemes),
    accent: typeof r.accent === 'string' ? r.accent : d.accent,
    cursorStyle: oneOf(r.cursorStyle, ['block', 'bar', 'underline'] as const, d.cursorStyle),
    cursorBlink: bool(r.cursorBlink, d.cursorBlink),
    fontWeight: num(r.fontWeight, d.fontWeight, 100, 900),
    letterSpacing: num(r.letterSpacing, d.letterSpacing, -2, 4),
    padding: num(r.padding, d.padding, 0, 24),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npx tsc --noEmit -p tsconfig.json`
Expected: all config + theme tests PASS (including the pre-existing `malformed profiles are filtered out` case — `sanitizeProfile` returns `{id,name,exe,args}` which still equals the `good` fixture); tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/shared/config.ts tests/config.test.ts
git commit -m "[feat] validate new appearance config fields"
```

---

### Task 5: Appearance engine — apply new options, per-profile, theme-aware chrome vars

Wires the new config into xterm and the chrome. After this task the terminal honors
cursor style/blink, font weight, letter spacing, padding, custom themes, and
per-profile overrides; the whole chrome recolors with the theme (the old docked
settings panel still works as before). **No automated test** — verified by hand.

**Files:**
- Modify: `src/renderer/themes.ts` (reduce to re-export)
- Modify: `src/renderer/term-pane.ts`
- Modify: `src/renderer/main.ts`

**Interfaces:**
- Consumes: `resolveTheme`, `resolveAppearance`, `uiPalette` (Tasks 1–3); `Config`, `Profile` (Task 4)
- Produces: `TermPane` constructor signature `(id: string, profile: Profile | undefined, cfg: Config)` with public `readonly profileId: string`; `applyAppearance(cfg: Config): void` in `main.ts`.

- [ ] **Step 1: Reduce `src/renderer/themes.ts` to a re-export**

The old docked `settings-ui.ts` still imports `THEMES` from here until Task 6.
Replace the **entire** file contents with:

```ts
export { BUILTIN_THEMES as THEMES } from '../shared/theme'
```

- [ ] **Step 2: Rewrite `src/renderer/term-pane.ts`**

Replace the **entire** file with:

```ts
import { Terminal } from '@xterm/xterm'
import type { FontWeight } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import type { Config, Profile } from '../shared/config'
import { resolveAppearance, resolveTheme } from '../shared/theme'

export class TermPane {
  readonly el = document.createElement('div')
  readonly term: Terminal
  readonly fit = new FitAddon()
  readonly search = new SearchAddon()
  readonly profileId: string
  exited = false
  onTitle?: (title: string) => void

  constructor(
    readonly id: string,
    private profile: Profile | undefined,
    cfg: Config
  ) {
    this.profileId = profile?.id ?? ''
    this.el.className = 'pane'
    const app = resolveAppearance(cfg, profile)
    this.term = new Terminal({
      allowProposedApi: true,
      cursorBlink: cfg.cursorBlink,
      cursorStyle: cfg.cursorStyle,
      fontWeight: cfg.fontWeight as FontWeight,
      letterSpacing: cfg.letterSpacing,
      scrollback: 10000,
      fontFamily: app.fontFamily,
      fontSize: app.fontSize,
      lineHeight: cfg.lineHeight,
      theme: resolveTheme(app.theme, cfg.customThemes)
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
    const app = resolveAppearance(cfg, this.profile)
    const o = this.term.options
    o.fontFamily = app.fontFamily
    o.fontSize = app.fontSize
    o.lineHeight = cfg.lineHeight
    o.fontWeight = cfg.fontWeight as FontWeight
    o.letterSpacing = cfg.letterSpacing
    o.cursorStyle = cfg.cursorStyle
    o.cursorBlink = cfg.cursorBlink
    o.theme = resolveTheme(app.theme, cfg.customThemes)
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

- [ ] **Step 3: Update `src/renderer/main.ts` imports**

Remove:

```ts
import { themeOf } from './themes'
```

Add (next to the other `./` and `../shared` imports):

```ts
import { uiPalette, resolveTheme } from '../shared/theme'
```

- [ ] **Step 4: Replace `applyUiTheme` with `applyAppearance`**

Replace the whole `applyUiTheme` function:

```ts
function applyUiTheme(cfg: Config): void {
  const bg = String(themeOf(cfg.theme).background)
  document.documentElement.style.setProperty('--term-bg', bg)
}
```

with:

```ts
function applyAppearance(cfg: Config): void {
  const pal = uiPalette(resolveTheme(cfg.theme, cfg.customThemes), cfg.accent)
  const s = document.documentElement.style
  s.setProperty('--term-bg', pal.termBg)
  s.setProperty('--ui-bg', pal.uiBg)
  s.setProperty('--ui-fg', pal.uiFg)
  s.setProperty('--ui-accent', pal.uiAccent)
  s.setProperty('--ui-border', pal.uiBorder)
  s.setProperty('--ui-muted', pal.uiMuted)
  s.setProperty('--term-padding', `${cfg.padding}px`)
}
```

- [ ] **Step 5: Pass the profile object into `createPane`**

Replace the first two lines of `createPane`:

```ts
function createPane(profileId: string): TermPane {
  const pane = new TermPane(uid('p'), profileId, config)
```

with:

```ts
function createPane(profileId: string): TermPane {
  const profile = profiles.find((p) => p.id === profileId)
  const pane = new TermPane(uid('p'), profile, config)
```

- [ ] **Step 6: Repoint the two `applyUiTheme` call sites**

In `boot()`, change `applyUiTheme(config)` → `applyAppearance(config)`.
In the `onConfigChanged` handler, reorder so the CSS vars are set before panes
refit. Replace the handler body:

```ts
  window.api.onConfigChanged((c) => {
    config = c as Config
    panes.forEach((p) => p.applyConfig(config))
    applyUiTheme(config)
    settings.rebuild()
    render()
  })
```

with:

```ts
  window.api.onConfigChanged((c) => {
    config = c as Config
    applyAppearance(config)
    panes.forEach((p) => p.applyConfig(config))
    settings.rebuild()
    render()
  })
```

- [ ] **Step 7: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: tsc exits 0; build succeeds.

- [ ] **Step 8: Manual verification**

Run: `npm run dev`. Confirm:
- Terminal still launches and accepts input.
- Edit `%AppData%/quake-term/config.json` (or on this dev box the equivalent
  `appData/quake-term/config.json`), set `"cursorStyle": "bar"`, `"padding": 16`,
  `"theme": "solarized-light"`, save, then toggle the window — the **chrome
  (tab bar) recolors light** to match the theme, the cursor is a bar, and there's
  visible padding around the terminal. (Live in-app editing comes in Task 6.)

- [ ] **Step 9: Commit**

```bash
git add src/renderer/themes.ts src/renderer/term-pane.ts src/renderer/main.ts
git commit -m "[feat] apply themed chrome and new terminal options"
```

---

### Task 6: Categorized settings modal + theme editor + modal wiring

Rewrites the settings UI as a centered modal with a left category nav, a live
theme editor (duplicate/rename/delete/import/export + per-color swatches), and an
editable keybindings tab. Wires `main.ts` so live edits don't lose focus and
shortcuts don't fire while typing in the modal. **No automated test** — verified
by hand. Deletes the now-unused `src/renderer/themes.ts`.

**Files:**
- Rewrite: `src/renderer/settings-ui.ts`
- Modify: `src/renderer/main.ts`
- Delete: `src/renderer/themes.ts`

**Interfaces:**
- Consumes: `Config`, `Profile`, `CursorStyle`, `ACTIONS` (Task 4); `BUILTIN_THEMES`, `THEME_COLOR_KEYS`, `TerminalTheme`, `isTerminalTheme`, `isHexColor`, `parseHex`, `toHex`, `resolveTheme` (Tasks 1–3)
- Produces: `SettingsUI` with the same constructor `(parent, getConfig, getProfiles, patch)` plus methods `toggle()`, `open()`, `close()`, `isOpen(): boolean`, `syncFromConfig(): void` (replaces `rebuild()`).

- [ ] **Step 1: Rewrite `src/renderer/settings-ui.ts`**

Replace the **entire** file with:

```ts
import type { Config, Profile, CursorStyle } from '../shared/config'
import { ACTIONS } from '../shared/config'
import type { TerminalTheme } from '../shared/theme'
import {
  BUILTIN_THEMES, THEME_COLOR_KEYS,
  isTerminalTheme, isHexColor, parseHex, toHex, resolveTheme
} from '../shared/theme'

type Patch = (patch: Partial<Config>) => void
type Category = 'Appearance' | 'Terminal' | 'Window' | 'Profiles' | 'Keybindings'
const CATEGORIES: Category[] = ['Appearance', 'Terminal', 'Window', 'Profiles', 'Keybindings']

const COLOR_LABELS: Record<string, string> = {
  background: 'Background', foreground: 'Foreground', cursor: 'Cursor',
  cursorAccent: 'Cursor text', selectionBackground: 'Selection',
  black: 'Black', red: 'Red', green: 'Green', yellow: 'Yellow', blue: 'Blue',
  magenta: 'Magenta', cyan: 'Cyan', white: 'White',
  brightBlack: 'Br. black', brightRed: 'Br. red', brightGreen: 'Br. green',
  brightYellow: 'Br. yellow', brightBlue: 'Br. blue', brightMagenta: 'Br. magenta',
  brightCyan: 'Br. cyan', brightWhite: 'Br. white'
}

function fullHex(v: string): string {
  return isHexColor(v) ? toHex(parseHex(v)) : '#000000'
}

function makeButton(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'btn'
  b.textContent = text
  b.addEventListener('click', onClick)
  return b
}

export class SettingsUI {
  private el = document.createElement('div')
  private dialog = document.createElement('div')
  private nav = document.createElement('div')
  private content = document.createElement('div')
  private active: Category = 'Appearance'

  constructor(
    parent: HTMLElement,
    private getConfig: () => Config,
    private getProfiles: () => Profile[],
    private patch: Patch
  ) {
    this.el.id = 'settings'
    this.el.className = 'overlay hidden'
    this.el.addEventListener('mousedown', (e) => {
      if (e.target === this.el) this.close()
    })
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); this.close() }
    })

    this.dialog.className = 'settings-dialog'
    this.dialog.tabIndex = -1
    const head = document.createElement('div')
    head.className = 'settings-head'
    const title = document.createElement('h2')
    title.textContent = 'Settings'
    const close = document.createElement('span')
    close.className = 'close'
    close.textContent = '✕'
    close.title = 'Close (Esc)'
    close.addEventListener('click', () => this.close())
    head.append(title, close)

    const body = document.createElement('div')
    body.className = 'settings-body'
    this.nav.className = 'settings-nav'
    this.content.className = 'settings-content'
    body.append(this.nav, this.content)
    this.dialog.append(head, body)
    this.el.appendChild(this.dialog)
    parent.appendChild(this.el)
  }

  toggle(): void { this.isOpen() ? this.close() : this.open() }
  isOpen(): boolean { return !this.el.classList.contains('hidden') }

  open(): void {
    this.buildNav()
    this.renderCategory()
    this.el.classList.remove('hidden')
    this.dialog.focus()
  }

  close(): void { this.el.classList.add('hidden') }

  syncFromConfig(): void {
    if (!this.isOpen()) return
    if (this.el.contains(document.activeElement)) return
    this.buildNav()
    this.renderCategory()
  }

  private buildNav(): void {
    this.nav.textContent = ''
    for (const cat of CATEGORIES) {
      const item = document.createElement('div')
      item.className = 'nav-item' + (cat === this.active ? ' active' : '')
      item.textContent = cat
      item.addEventListener('click', () => {
        this.active = cat
        this.buildNav()
        this.renderCategory()
      })
      this.nav.appendChild(item)
    }
  }

  private renderCategory(): void {
    this.content.textContent = ''
    const cfg = this.getConfig()
    switch (this.active) {
      case 'Appearance': this.renderAppearance(cfg); break
      case 'Terminal': this.renderTerminal(cfg); break
      case 'Window': this.renderWindow(cfg); break
      case 'Profiles': this.renderProfiles(cfg); break
      case 'Keybindings': this.renderKeybindings(cfg); break
    }
  }

  // ---- control builders ----

  private fieldRow(label: string, control: HTMLElement): void {
    const f = document.createElement('div')
    f.className = 'field'
    const l = document.createElement('label')
    l.textContent = label
    f.append(l, control)
    this.content.appendChild(f)
  }

  private sectionTitle(text: string): void {
    const s = document.createElement('div')
    s.className = 'section-title'
    s.textContent = text
    this.content.appendChild(s)
  }

  private textField(label: string, value: string, set: (v: string) => void): void {
    const i = document.createElement('input')
    i.type = 'text'
    i.value = value
    i.addEventListener('change', () => set(i.value))
    this.fieldRow(label, i)
  }

  private selectField(
    label: string, options: { value: string; text: string }[],
    value: string, set: (v: string) => void
  ): void {
    const s = document.createElement('select')
    for (const opt of options) {
      const o = document.createElement('option')
      o.value = opt.value
      o.textContent = opt.text
      o.selected = opt.value === value
      s.appendChild(o)
    }
    s.addEventListener('change', () => set(s.value))
    this.fieldRow(label, s)
  }

  private checkField(label: string, value: boolean, set: (v: boolean) => void): void {
    const i = document.createElement('input')
    i.type = 'checkbox'
    i.checked = value
    i.addEventListener('change', () => set(i.checked))
    this.fieldRow(label, i)
  }

  private sliderField(
    label: string, value: number, min: number, max: number, step: number,
    fmt: (v: number) => string, set: (v: number) => void
  ): void {
    const ctl = document.createElement('div')
    ctl.className = 'slider-control'
    const i = document.createElement('input')
    i.type = 'range'
    i.min = String(min); i.max = String(max); i.step = String(step); i.value = String(value)
    const out = document.createElement('span')
    out.className = 'range-val'
    out.textContent = fmt(value)
    i.addEventListener('input', () => {
      const v = Number(i.value)
      out.textContent = fmt(v)
      set(v)
    })
    ctl.append(i, out)
    this.fieldRow(label, ctl)
  }

  private colorField(label: string, value: string, set: (v: string) => void): void {
    const ctl = document.createElement('div')
    ctl.className = 'color-control'
    const sw = document.createElement('input')
    sw.type = 'color'
    sw.value = fullHex(value)
    const hex = document.createElement('input')
    hex.type = 'text'
    hex.className = 'hex-input'
    hex.value = value
    sw.addEventListener('input', () => { hex.value = sw.value; set(sw.value) })
    hex.addEventListener('change', () => {
      if (isHexColor(hex.value)) { sw.value = fullHex(hex.value); set(hex.value) }
    })
    ctl.append(sw, hex)
    this.fieldRow(label, ctl)
  }

  // ---- categories ----

  private renderAppearance(cfg: Config): void {
    this.sectionTitle('Theme')
    const themeOpts = [
      ...Object.keys(BUILTIN_THEMES).map((k) => ({ value: k, text: k })),
      ...Object.keys(cfg.customThemes).map((k) => ({ value: k, text: `${k} (custom)` }))
    ]
    this.selectField('Theme', themeOpts, cfg.theme, (v) => this.patch({ theme: v }))
    this.renderThemeEditor(cfg)

    this.sectionTitle('Accent')
    const derived = resolveTheme(cfg.theme, cfg.customThemes).blue
    this.checkField('Auto (match theme)', cfg.accent === '', (auto) =>
      this.patch({ accent: auto ? '' : derived }))
    if (cfg.accent !== '') {
      this.colorField('Accent color', cfg.accent, (v) => this.patch({ accent: v }))
    }

    this.sectionTitle('Cursor')
    this.selectField('Style', [
      { value: 'block', text: 'Block' },
      { value: 'bar', text: 'Bar' },
      { value: 'underline', text: 'Underline' }
    ], cfg.cursorStyle, (v) => this.patch({ cursorStyle: v as CursorStyle }))
    this.checkField('Blink', cfg.cursorBlink, (v) => this.patch({ cursorBlink: v }))
  }

  private renderThemeEditor(cfg: Config): void {
    const name = cfg.theme
    const isCustom = name in cfg.customThemes
    const theme = resolveTheme(name, cfg.customThemes)

    const preview = document.createElement('div')
    preview.className = 'theme-preview'
    for (const k of ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'] as const) {
      const span = document.createElement('span')
      span.style.background = theme[k]
      preview.appendChild(span)
    }
    this.content.appendChild(preview)

    if (isCustom) {
      this.textField('Theme name', name, (v) => this.renameTheme(cfg, name, v.trim()))
    }

    const importArea = document.createElement('div')
    importArea.className = 'import-area hidden'

    const actions = document.createElement('div')
    actions.className = 'editor-actions'
    actions.appendChild(makeButton('Duplicate to custom…', () => {
      const base = isCustom ? name : `${name}-custom`
      const newName = this.uniqueThemeName(cfg, base)
      this.patch({ customThemes: { ...cfg.customThemes, [newName]: { ...theme } }, theme: newName })
    }))
    if (isCustom) {
      actions.appendChild(makeButton('Delete', () => this.deleteTheme(cfg, name)))
    }
    actions.appendChild(makeButton('Copy JSON', () => {
      void navigator.clipboard.writeText(JSON.stringify(theme, null, 2))
    }))
    actions.appendChild(makeButton('Paste JSON', () => importArea.classList.toggle('hidden')))
    this.content.appendChild(actions)

    const ta = document.createElement('textarea')
    ta.placeholder = 'Paste a complete theme JSON object…'
    const err = document.createElement('div')
    err.className = 'editor-error'
    importArea.append(ta, makeButton('Import as custom theme', () => {
      err.textContent = ''
      let parsed: unknown
      try { parsed = JSON.parse(ta.value) } catch { err.textContent = 'Invalid JSON'; return }
      if (!isTerminalTheme(parsed)) { err.textContent = 'Not a complete theme (missing colors)'; return }
      const newName = this.uniqueThemeName(cfg, 'imported')
      this.patch({ customThemes: { ...cfg.customThemes, [newName]: parsed }, theme: newName })
    }), err)
    this.content.appendChild(importArea)

    this.sectionTitle(isCustom ? 'Edit colors' : 'Built-in theme — duplicate to edit')
    const grid = document.createElement('div')
    grid.className = 'swatch-grid'
    for (const key of THEME_COLOR_KEYS) {
      const cell = document.createElement('div')
      cell.className = 'swatch'
      const sw = document.createElement('input')
      sw.type = 'color'
      sw.value = fullHex(theme[key])
      sw.disabled = !isCustom
      const lbl = document.createElement('label')
      lbl.textContent = COLOR_LABELS[key] ?? key
      sw.addEventListener('input', () => {
        const c = this.getConfig()
        const cur = resolveTheme(name, c.customThemes)
        const updated: TerminalTheme = { ...cur, [key]: sw.value }
        this.patch({ customThemes: { ...c.customThemes, [name]: updated } })
      })
      cell.append(sw, lbl)
      grid.appendChild(cell)
    }
    this.content.appendChild(grid)
  }

  private uniqueThemeName(cfg: Config, base: string): string {
    const taken = (x: string): boolean => x in cfg.customThemes || x in BUILTIN_THEMES
    let n = base
    let i = 2
    while (taken(n)) n = `${base}-${i++}`
    return n
  }

  private renameTheme(cfg: Config, oldName: string, next: string): void {
    if (!next || next === oldName || next in cfg.customThemes || next in BUILTIN_THEMES) return
    const themes: Record<string, TerminalTheme> = {}
    for (const [k, v] of Object.entries(cfg.customThemes)) themes[k === oldName ? next : k] = v
    this.patch({ customThemes: themes, theme: cfg.theme === oldName ? next : cfg.theme })
  }

  private deleteTheme(cfg: Config, name: string): void {
    const themes = { ...cfg.customThemes }
    delete themes[name]
    this.patch({ customThemes: themes, theme: cfg.theme === name ? 'dracula' : cfg.theme })
  }

  private renderTerminal(cfg: Config): void {
    this.sectionTitle('Font')
    this.textField('Family', cfg.fontFamily, (v) => this.patch({ fontFamily: v }))
    this.sliderField('Size', cfg.fontSize, 6, 40, 1, (v) => `${v}px`, (v) => this.patch({ fontSize: v }))
    this.sliderField('Line height', cfg.lineHeight, 1, 2, 0.05, (v) => v.toFixed(2), (v) => this.patch({ lineHeight: v }))
    this.sliderField('Weight', cfg.fontWeight, 100, 900, 100, (v) => String(v), (v) => this.patch({ fontWeight: v }))
    this.sliderField('Letter spacing', cfg.letterSpacing, -2, 4, 0.5, (v) => `${v}px`, (v) => this.patch({ letterSpacing: v }))
    this.sectionTitle('Layout')
    this.sliderField('Padding', cfg.padding, 0, 24, 1, (v) => `${v}px`, (v) => this.patch({ padding: v }))
  }

  private renderWindow(cfg: Config): void {
    this.sectionTitle('Window')
    this.sliderField('Opacity', cfg.opacity, 0.3, 1, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => this.patch({ opacity: v }))
    this.checkField('Acrylic blur (Win11)', cfg.acrylic, (v) => this.patch({ acrylic: v }))
    this.sliderField('Width', cfg.widthPct, 20, 100, 5, (v) => `${v}%`, (v) => this.patch({ widthPct: v }))
    this.sliderField('Height', cfg.heightPct, 20, 100, 5, (v) => `${v}%`, (v) => this.patch({ heightPct: v }))
    this.sliderField('Animation', cfg.animationMs, 0, 1000, 25, (v) => `${v}ms`, (v) => this.patch({ animationMs: v }))
    this.sectionTitle('Behavior')
    this.checkField('Hide on focus loss', cfg.hideOnBlur, (v) => this.patch({ hideOnBlur: v }))
    this.checkField('Start with Windows', cfg.startWithWindows, (v) => this.patch({ startWithWindows: v }))
    this.textField('Toggle hotkey', cfg.hotkey, (v) => this.patch({ hotkey: v }))
  }

  private renderProfiles(cfg: Config): void {
    const profiles = this.getProfiles()
    this.sectionTitle('Default profile')
    this.selectField('Default', profiles.map((p) => ({ value: p.id, text: p.name })),
      cfg.defaultProfileId, (v) => this.patch({ defaultProfileId: v }))

    const themeOpts = [
      { value: '', text: '(use global)' },
      ...Object.keys(BUILTIN_THEMES).map((k) => ({ value: k, text: k })),
      ...Object.keys(cfg.customThemes).map((k) => ({ value: k, text: `${k} (custom)` }))
    ]
    for (const p of profiles) {
      this.sectionTitle(p.name)
      this.colorField('Tab color', p.color ?? '#888888', (v) => this.patchProfile(p.id, { color: v }))
      this.selectField('Theme', themeOpts, p.theme ?? '', (v) => this.patchProfile(p.id, { theme: v || undefined }))
      this.textField('Font family', p.fontFamily ?? '', (v) => this.patchProfile(p.id, { fontFamily: v || undefined }))
    }
  }

  private patchProfile(id: string, over: Partial<Profile>): void {
    const profiles = this.getProfiles().map((p) => (p.id === id ? { ...p, ...over } : p))
    this.patch({ profiles })
  }

  private renderKeybindings(cfg: Config): void {
    this.sectionTitle('Shortcuts (Electron accelerator strings)')
    for (const action of ACTIONS) {
      this.textField(action, cfg.keybindings[action], (v) =>
        this.patch({ keybindings: { ...cfg.keybindings, [action]: v } }))
    }
  }
}
```

- [ ] **Step 2: `main.ts` — refresh profiles and sync (not rebuild) on config change**

Replace the `onConfigChanged` handler body (from Task 5):

```ts
  window.api.onConfigChanged((c) => {
    config = c as Config
    applyAppearance(config)
    panes.forEach((p) => p.applyConfig(config))
    settings.rebuild()
    render()
  })
```

with:

```ts
  window.api.onConfigChanged((c) => {
    config = c as Config
    profiles = config.profiles
    applyAppearance(config)
    panes.forEach((p) => p.applyConfig(config))
    settings.syncFromConfig()
    render()
  })
```

- [ ] **Step 3: `main.ts` — don't steal focus from the open modal**

In `render()`, change the focus line:

```ts
    if (!findBar.isOpen()) panes.get(tab.activePane)?.term.focus()
```

to:

```ts
    if (!findBar.isOpen() && !settings.isOpen()) panes.get(tab.activePane)?.term.focus()
```

- [ ] **Step 4: `main.ts` — don't fire shortcuts while typing in the modal/find bar**

In the global `keydown` capture listener, add the guard as the first lines inside
the handler (right after `if (!config) return`):

```ts
  (e) => {
    if (!config) return
    const ae = document.activeElement as HTMLElement | null
    if (ae && ae.closest && ae.closest('#settings, #findbar')) return
    const action = matchAction(config.keybindings, e)
    if (action) {
      e.preventDefault()
      e.stopPropagation()
      void runAction(action)
    }
  },
```

(This guards only the settings/find-bar inputs — the xterm helper `<textarea>` is
not inside `#settings`/`#findbar`, so terminal shortcuts keep working.)

- [ ] **Step 5: Delete the now-unused renderer themes shim**

```bash
git rm src/renderer/themes.ts
```

Verify nothing imports it:

Run: `grep -rn "renderer/themes\|from './themes'" src` → expect no matches.

- [ ] **Step 6: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: tsc exits 0; build succeeds. (`settings.rebuild()` no longer referenced
anywhere; `SettingsUI` now exposes `syncFromConfig`/`isOpen`.)

- [ ] **Step 7: Manual verification**

Run: `npm run dev`. Press `Ctrl+,` and confirm:
- A centered modal opens with left nav (Appearance / Terminal / Window / Profiles /
  Keybindings); clicking categories swaps the body; the terminal behind is
  inert (typing does not reach the shell).
- **Appearance:** changing Theme updates terminal + chrome instantly. Click
  "Duplicate to custom…", then drag a color swatch — the terminal recolors live
  and the swatch keeps focus (no flicker/reset). Rename it; Delete falls back to
  dracula. "Copy JSON" then "Paste JSON" round-trips into a new custom theme;
  pasting junk shows an inline error.
- **Terminal:** dragging Size/Weight/Letter spacing/Padding sliders updates the
  terminal live without losing the slider grab.
- **Profiles:** set a Tab color and a per-profile Theme; new tabs from that profile
  use the override.
- **Keybindings:** changing an accelerator (e.g. `newTab` → `Ctrl+N`) takes effect.
- `Esc` or clicking the backdrop closes the modal.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/settings-ui.ts src/renderer/main.ts
git commit -m "[feat] add categorized settings modal with theme editor"
```

---

### Task 7: Theme-aware chrome styling + modal CSS + polish

Reworks the stylesheet so every chrome element consumes the CSS variables set by
`applyAppearance` (Task 5) and styles the new modal (Task 6). **No automated
test** — verified by hand. (`.tab .dot` / `.tab .title` rules are included now so
Task 8 only touches `tab-bar.ts`/`main.ts`.)

**Files:**
- Rewrite: `src/renderer/styles.css`

- [ ] **Step 1: Replace the entire `src/renderer/styles.css`** with:

```css
:root {
  --term-bg: #282a36;
  --ui-bg: #21222c;
  --ui-fg: #f8f8f2;
  --ui-accent: #bd93f9;
  --ui-border: #3a3c4e;
  --ui-muted: #8a8aa0;
  --term-padding: 6px;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

html, body, #app {
  height: 100%;
  overflow: hidden;
  background: var(--term-bg);
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 13px;
  color: var(--ui-fg);
  user-select: none;
}

#app { display: flex; flex-direction: column; }

/* ---- tab bar ---- */
#tabbar {
  display: flex;
  align-items: stretch;
  background: var(--ui-bg);
  height: 34px;
  flex: none;
  border-bottom: 1px solid var(--ui-border);
}
.tab {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  height: 100%;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  white-space: nowrap;
  max-width: 220px;
  overflow: hidden;
  color: var(--ui-muted);
  transition: color 0.12s, background 0.12s;
}
.tab:hover { color: var(--ui-fg); }
.tab.active {
  color: var(--ui-fg);
  border-bottom-color: var(--ui-accent);
  background: var(--term-bg);
}
.tab .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.tab .title { overflow: hidden; text-overflow: ellipsis; }
.tab .close { opacity: 0.5; padding: 0 2px; border-radius: 3px; }
.tab .close:hover { opacity: 1; color: #ff5555; }

.tab-btn {
  padding: 0 12px;
  height: 100%;
  display: flex;
  align-items: center;
  cursor: pointer;
  color: var(--ui-muted);
}
.tab-btn:hover { color: var(--ui-fg); }

#profile-menu {
  position: absolute;
  z-index: 50;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  padding: 4px 0;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
}
#profile-menu div { padding: 6px 16px; cursor: pointer; }
#profile-menu div:hover { background: var(--ui-accent); color: var(--ui-bg); }

/* ---- panes ---- */
#panes { position: relative; flex: 1; }
.tab-container { position: absolute; inset: 0; }
.tab-container.hidden { display: none; }
.pane { position: absolute; padding: var(--term-padding); }
.pane.active-pane { outline: 1px solid var(--ui-accent); outline-offset: -1px; }
.xterm { height: 100%; }

.splitter { position: absolute; z-index: 10; }
.splitter.row { cursor: ew-resize; }
.splitter.col { cursor: ns-resize; }
.splitter:hover { background: var(--ui-accent); opacity: 0.4; }

/* ---- overlays ---- */
.overlay { position: absolute; z-index: 100; }

#findbar {
  top: 8px;
  right: 16px;
  padding: 6px 8px;
  display: flex;
  gap: 6px;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
}
#findbar input {
  background: var(--term-bg);
  border: 1px solid var(--ui-border);
  color: var(--ui-fg);
  padding: 4px 7px;
  border-radius: 6px;
  outline: none;
  width: 220px;
}
#findbar input:focus { border-color: var(--ui-accent); }

/* ---- settings modal ---- */
#settings {
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 6vh;
  background: rgba(0, 0, 0, 0.45);
}
.settings-dialog {
  width: 620px;
  max-width: calc(100% - 32px);
  max-height: 84vh;
  display: flex;
  flex-direction: column;
  background: var(--ui-bg);
  color: var(--ui-fg);
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  box-shadow: 0 16px 56px rgba(0, 0, 0, 0.55);
  overflow: hidden;
  outline: none;
}
.settings-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--ui-border);
}
.settings-head h2 { font-size: 14px; color: var(--ui-accent); }
.settings-head .close { cursor: pointer; opacity: 0.6; font-size: 15px; }
.settings-head .close:hover { opacity: 1; }
.settings-body { display: flex; min-height: 0; flex: 1; }
.settings-nav {
  flex: none;
  width: 132px;
  padding: 8px;
  border-right: 1px solid var(--ui-border);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.nav-item { padding: 7px 10px; border-radius: 7px; cursor: pointer; color: var(--ui-muted); }
.nav-item:hover { background: var(--ui-border); color: var(--ui-fg); }
.nav-item.active { background: var(--ui-accent); color: var(--ui-bg); }
.settings-content { flex: 1; overflow-y: auto; padding: 14px 18px; }

.section-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ui-muted);
  margin: 14px 0 8px;
}
.section-title:first-child { margin-top: 0; }

.field { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.field > label { flex: none; width: 132px; }
.field > *:last-child { flex: 1; }

#settings input[type='text'],
#settings input[type='number'],
#settings select,
#settings textarea {
  background: var(--term-bg);
  border: 1px solid var(--ui-border);
  color: var(--ui-fg);
  padding: 5px 8px;
  border-radius: 6px;
  outline: none;
  width: 100%;
  font-family: inherit;
  font-size: 12px;
}
#settings input:focus,
#settings select:focus,
#settings textarea:focus { border-color: var(--ui-accent); }
#settings input[type='checkbox'] { flex: none; width: auto; accent-color: var(--ui-accent); }

.slider-control { display: flex; align-items: center; gap: 10px; }
.slider-control input[type='range'] { flex: 1; accent-color: var(--ui-accent); }
.range-val {
  flex: none;
  min-width: 42px;
  text-align: right;
  color: var(--ui-muted);
  font-variant-numeric: tabular-nums;
}

.color-control { display: flex; align-items: center; gap: 8px; }
.color-control input[type='color'] {
  flex: none;
  width: 34px; height: 24px;
  padding: 0;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  background: none;
  cursor: pointer;
}
.color-control .hex-input { flex: 1; }

.theme-preview {
  display: flex;
  height: 22px;
  margin: 8px 0;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  overflow: hidden;
}
.theme-preview span { flex: 1; }

.editor-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
.btn {
  background: var(--term-bg);
  border: 1px solid var(--ui-border);
  color: var(--ui-fg);
  border-radius: 6px;
  padding: 5px 10px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
}
.btn:hover { border-color: var(--ui-accent); }

.import-area { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
.import-area textarea { height: 96px; resize: vertical; }
.editor-error { color: #ff5555; font-size: 12px; min-height: 14px; }

.swatch-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.swatch { display: flex; align-items: center; gap: 8px; }
.swatch input[type='color'] {
  flex: none;
  width: 30px; height: 22px;
  padding: 0;
  border: 1px solid var(--ui-border);
  border-radius: 5px;
  background: none;
  cursor: pointer;
}
.swatch input[type='color']:disabled { cursor: default; opacity: 0.6; }
.swatch label { flex: 1; font-size: 12px; color: var(--ui-muted); }

.settings-content::-webkit-scrollbar { width: 10px; }
.settings-content::-webkit-scrollbar-thumb { background: var(--ui-border); border-radius: 6px; }
.settings-content::-webkit-scrollbar-track { background: transparent; }

.hidden { display: none !important; }
```

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: tsc exits 0; build succeeds (CSS-only change).

- [ ] **Step 3: Manual verification**

Run: `npm run dev`. Confirm:
- The modal looks intentional: left nav with an accent-highlighted active item,
  roomy two-column rows, styled sliders/swatches, themed scrollbar.
- Switch theme to `solarized-light` and to `github-dark` — the **entire** chrome
  (tab bar, modal, find bar) recolors to match, staying readable in both.
- The active tab underline, active-pane outline, splitter hover, and focused
  inputs all use the accent color.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/styles.css
git commit -m "[feat] theme the chrome and style the settings modal"
```

---

### Task 8: Per-profile tab color dot

Surfaces the per-profile `color` (set in the Profiles tab) as a dot in each tab so
tabs from different shells are distinguishable. **No automated test** — verified by
hand.

**Files:**
- Modify: `src/renderer/tab-bar.ts`
- Modify: `src/renderer/main.ts`

**Interfaces:**
- Consumes: `Profile.color` (Task 4), `TermPane.profileId` (Task 5)
- Produces: `TabInfo` gains optional `color?: string`.

- [ ] **Step 1: `tab-bar.ts` — accept and render a color dot**

Change the `TabInfo` interface:

```ts
export interface TabInfo { id: string; title: string; color?: string }
```

Replace the `tabs.forEach(...)` body so it prepends a dot and labels the title:

```ts
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
    const close = document.createElement('span')
    close.className = 'close'
    close.textContent = '✕'
    close.addEventListener('click', (e) => { e.stopPropagation(); on.close(i) })
    div.append(title, close)
    div.addEventListener('click', () => on.select(i))
    el.appendChild(div)
  })
```

- [ ] **Step 2: `main.ts` — compute each tab's color and pass it**

Add this helper next to `activeTab()`:

```ts
function colorForTab(t: Tab): string | undefined {
  const pid = panes.get(t.activePane)?.profileId
  return profiles.find((p) => p.id === pid)?.color
}
```

In `render()`, change the tab list mapping:

```ts
    tabs.map((t) => ({ id: t.id, title: t.title })),
```

to:

```ts
    tabs.map((t) => ({ id: t.id, title: t.title, color: colorForTab(t) })),
```

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: tsc exits 0; build succeeds.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. In Settings → Profiles set a distinct Tab color for two
profiles. Open a tab from each (the `▾` tab chooser): each tab shows its colored
dot; the active tab's underline still uses the accent.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/tab-bar.ts src/renderer/main.ts
git commit -m "[feat] show per-profile color dot on tabs"
```

---

## Self-Review (author checklist — completed)

**1. Spec coverage** — every spec section maps to a task:
- Shared `theme.ts` (types, built-ins, validation, resolution, hex/palette helpers,
  `uiPalette`, `resolveAppearance`) → Tasks 1–3.
- Config schema additions + profile sanitize → Task 4.
- 11 presets + full theme editor (duplicate/rename/delete/import/export/live
  swatches/preview) → Tasks 1, 6.
- Theme-aware chrome via `uiPalette` CSS vars → Tasks 5, 7.
- Categorized modal + focus-preserving live apply + editable keybindings → Task 6.
- Per-profile appearance (`resolveAppearance` in panes; color dot) → Tasks 3, 5, 8.
- New options (cursor style/blink, font weight, letter spacing, padding, accent) →
  Tasks 4, 5, 6, 7.
- Testing: pure-logic unit tests → Tasks 1–4; manual GUI checks → Tasks 5–8.
- Out-of-scope items are not built. ✓

**2. Placeholder scan** — no TBD/TODO; every code step shows complete code. ✓

**3. Type consistency** — `TerminalTheme`, `THEME_COLOR_KEYS`, `resolveTheme`,
`resolveAppearance`, `uiPalette`, `CursorStyle`, and the `TermPane(id, profile, cfg)`
signature are defined once and used with matching names/shapes across tasks.
`SettingsUI` exposes `isOpen`/`syncFromConfig` (consumed by `main.ts` in Task 6).
`TabInfo.color` (Task 8) matches `colorForTab`'s return. ✓

**Intermediate compile safety:** after Task 5, `renderer/themes.ts` re-exports
`THEMES` so the still-old `settings-ui.ts` compiles; Task 6 deletes it only once
nothing imports it. Each task's typecheck/test gate passes on its own.
