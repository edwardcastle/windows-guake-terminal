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
