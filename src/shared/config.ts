import { TerminalTheme, isTerminalTheme, isHexColor } from './theme'

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

export const ACTIONS = [
  'newTab', 'closePane', 'nextTab', 'prevTab',
  'splitRight', 'splitDown',
  'focusLeft', 'focusRight', 'focusUp', 'focusDown',
  'copy', 'paste', 'find',
  'fontBigger', 'fontSmaller', 'fontReset', 'settings'
] as const
export type Action = (typeof ACTIONS)[number]

export type CursorStyle = 'block' | 'bar' | 'underline'

export interface Config {
  hotkey: string
  defaultProfileId: string
  profiles: Profile[]
  keybindings: Record<Action, string>
  theme: string
  customThemes: Record<string, TerminalTheme>
  accent: string
  cursorStyle: CursorStyle
  cursorBlink: boolean
  fontWeight: number
  letterSpacing: number
  padding: number
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
    settings: 'Ctrl+Shift+A'
  },
  theme: 'dracula',
  customThemes: {},
  accent: '',
  cursorStyle: 'block',
  cursorBlink: true,
  fontWeight: 400,
  letterSpacing: 0,
  padding: 6,
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
    profiles: Array.isArray(r.profiles)
      ? r.profiles.map(sanitizeProfile).filter((p): p is Profile => p !== null)
      : [],
    keybindings: kb,
    theme: str(r.theme, d.theme),
    customThemes: mergeCustomThemes(r.customThemes),
    accent: typeof r.accent === 'string' ? r.accent : d.accent,
    cursorStyle: oneOf(r.cursorStyle, ['block', 'bar', 'underline'] as const, d.cursorStyle),
    cursorBlink: bool(r.cursorBlink, d.cursorBlink),
    fontWeight: num(r.fontWeight, d.fontWeight, 100, 900),
    letterSpacing: num(r.letterSpacing, d.letterSpacing, -2, 4),
    padding: num(r.padding, d.padding, 0, 24),
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
