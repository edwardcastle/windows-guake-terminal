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

// Source key for each TerminalTheme field in a Windows Terminal color scheme
// (which uses purple/brightPurple and cursorColor, and has no cursorAccent).
const WT_KEYS: Record<keyof TerminalTheme, string> = {
  background: 'background', foreground: 'foreground',
  cursor: 'cursorColor', cursorAccent: 'background', selectionBackground: 'selectionBackground',
  black: 'black', red: 'red', green: 'green', yellow: 'yellow', blue: 'blue',
  magenta: 'purple', cyan: 'cyan', white: 'white',
  brightBlack: 'brightBlack', brightRed: 'brightRed', brightGreen: 'brightGreen',
  brightYellow: 'brightYellow', brightBlue: 'brightBlue', brightMagenta: 'brightPurple',
  brightCyan: 'brightCyan', brightWhite: 'brightWhite'
}

// Accept either a complete quake-term theme or a Windows Terminal scheme, else null.
export function adaptTheme(v: unknown): TerminalTheme | null {
  if (isTerminalTheme(v)) return v
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const out = {} as Record<keyof TerminalTheme, string>
  for (const key of THEME_COLOR_KEYS) {
    let src = o[WT_KEYS[key]]
    if (!isHexColor(src) && key === 'cursor') src = o.foreground
    if (!isHexColor(src)) return null
    out[key] = src
  }
  return isTerminalTheme(out) ? out : null
}

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

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

export function uiPalette(theme: TerminalTheme, accent: string): UiPalette {
  const light = isLight(theme)
  const contrast = light ? '#000000' : '#ffffff'
  const uiBg = mix(theme.background, '#000000', light ? 0.06 : 0.18)
  // Muted chrome text: the most-dimmed foreground that still clears a 3:1
  // contrast floor on the chrome background (keeps light themes legible).
  let uiMuted = theme.foreground
  for (let t = 0.45; t > 0; t -= 0.05) {
    const cand = mix(theme.foreground, theme.background, t)
    if (contrastRatio(cand, uiBg) >= 3) { uiMuted = cand; break }
  }
  return {
    termBg: theme.background,
    uiBg,
    uiFg: theme.foreground,
    uiAccent: deriveAccent(theme, accent),
    uiBorder: mix(theme.background, contrast, 0.16),
    uiMuted
  }
}

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
