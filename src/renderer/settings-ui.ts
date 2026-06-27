import type { Config, Profile, CursorStyle } from '../shared/config'
import { ACTIONS } from '../shared/config'
import type { TerminalTheme } from '../shared/theme'
import {
  BUILTIN_THEMES, THEME_COLOR_KEYS,
  isHexColor, parseHex, toHex, resolveTheme, adaptTheme
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

// Build an Electron-accelerator string (e.g. "Ctrl+Shift+D") from a keydown,
// compatible with keys.ts parseCombo. Returns null while only modifiers are held.
function formatAccelerator(e: KeyboardEvent): string | null {
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return null
  const mods: string[] = []
  if (e.ctrlKey) mods.push('Ctrl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  let key = e.key
  if (key === ' ') key = 'Space'
  else if (key.length === 1) key = key.toUpperCase()
  return [...mods, key].join('+')
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
  private localFonts: string[] | null = null

  constructor(
    parent: HTMLElement,
    private getConfig: () => Config,
    private getProfiles: () => Profile[],
    private patch: Patch,
    private onClose?: () => void
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
    const foot = document.createElement('div')
    foot.className = 'settings-foot'
    foot.textContent = `quake-term v${window.api.version}`
    this.dialog.append(head, body, foot)
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

  close(): void {
    this.el.classList.add('hidden')
    this.onClose?.()
  }

  syncFromConfig(): void {
    if (!this.isOpen()) return
    // Only suppress the rebuild while a continuous control (a color swatch or a
    // slider) is being dragged — rebuilding mid-drag would drop the grab. Discrete
    // controls (select/checkbox/button/text) must rebuild so the editor body
    // (preview, swatch grid, conditional fields) reflects the new state.
    const ae = document.activeElement
    if (ae instanceof HTMLInputElement && (ae.type === 'range' || ae.type === 'color')) return
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

    this.sectionTitle('Background image')
    this.textField('Image path', cfg.backgroundImage, (v) => this.patch({ backgroundImage: v.trim() }))
    if (cfg.backgroundImage) {
      this.sliderField('Dim', cfg.backgroundDim, 0, 0.9, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => this.patch({ backgroundDim: v }))
      this.sliderField('Blur', cfg.backgroundBlur, 0, 40, 1, (v) => `${v}px`, (v) => this.patch({ backgroundBlur: v }))
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
    this.content.appendChild(this.themeSample(theme))

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
    ta.placeholder = 'Paste a quake-term or Windows Terminal theme JSON…'
    const err = document.createElement('div')
    err.className = 'editor-error'
    importArea.append(ta, makeButton('Import as custom theme', () => {
      err.textContent = ''
      let parsed: unknown
      try { parsed = JSON.parse(ta.value) } catch { err.textContent = 'Invalid JSON'; return }
      const theme = adaptTheme(parsed)
      if (!theme) { err.textContent = 'Not a recognized theme (quake-term or Windows Terminal JSON)'; return }
      const rawName = (parsed as { name?: unknown }).name
      const base = typeof rawName === 'string' && rawName ? rawName : 'imported'
      const newName = this.uniqueThemeName(cfg, base)
      this.patch({ customThemes: { ...cfg.customThemes, [newName]: theme }, theme: newName })
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
    const profiles = this.getProfiles().map((p) => (p.theme === oldName ? { ...p, theme: next } : p))
    this.patch({ customThemes: themes, theme: cfg.theme === oldName ? next : cfg.theme, profiles })
  }

  private deleteTheme(cfg: Config, name: string): void {
    const themes = { ...cfg.customThemes }
    delete themes[name]
    const profiles = this.getProfiles().map((p) => (p.theme === name ? { ...p, theme: undefined } : p))
    this.patch({ customThemes: themes, theme: cfg.theme === name ? 'dracula' : cfg.theme, profiles })
  }

  private themeSample(theme: TerminalTheme): HTMLElement {
    const box = document.createElement('div')
    box.className = 'theme-sample'
    box.style.background = theme.background
    box.style.color = theme.foreground
    const span = (text: string, color?: string, bg?: string): HTMLSpanElement => {
      const s = document.createElement('span')
      s.textContent = text
      if (color) s.style.color = color
      if (bg) s.style.background = bg
      return s
    }
    const l1 = document.createElement('div')
    l1.append(
      span('user', theme.green), span('@'), span('host', theme.green), span(':'),
      span('~/project', theme.blue), span('$ '), span('npm run build')
    )
    const l2 = document.createElement('div')
    l2.append(
      span('ok', theme.green), span('  '), span('warn', theme.yellow), span('  '),
      span('error', theme.red), span('  '), span('info', theme.cyan)
    )
    const l3 = document.createElement('div')
    l3.append(span('selected', theme.foreground, theme.selectionBackground), span(' '), span('▏', theme.cursor))
    const ansi = document.createElement('div')
    ansi.className = 'theme-sample-ansi'
    for (const k of THEME_COLOR_KEYS) {
      if (k === 'background' || k === 'foreground' || k === 'cursor' ||
          k === 'cursorAccent' || k === 'selectionBackground') continue
      ansi.append(span('▆', theme[k]))
    }
    box.append(l1, l2, l3, ansi)
    return box
  }

  private fontField(cfg: Config): void {
    const curated = [
      'Cascadia Mono', 'Cascadia Code', 'Consolas', 'Fira Code', 'JetBrains Mono',
      'Source Code Pro', 'Hack', 'Menlo', 'Monaco', 'Ubuntu Mono',
      'DejaVu Sans Mono', 'Roboto Mono', 'IBM Plex Mono', 'Courier New'
    ]
    const CUSTOM = ' '
    const wrap = document.createElement('div')
    wrap.className = 'font-field'
    const select = document.createElement('select')
    const custom = document.createElement('input')
    custom.type = 'text'
    custom.placeholder = 'Custom font family or stack…'
    custom.value = cfg.fontFamily
    const specimen = document.createElement('div')
    specimen.className = 'font-specimen'
    specimen.textContent = 'The quick brown fox  0123  => != -> =='

    const paint = (value: string): void => {
      specimen.style.fontFamily = value
      specimen.style.fontSize = `${cfg.fontSize}px`
      specimen.style.fontWeight = String(cfg.fontWeight)
    }

    const populate = (families: string[]): void => {
      const current = cfg.fontFamily
      select.textContent = ''
      // Show the current value (e.g. a custom stack) as a selected option so the
      // custom text box stays hidden until the user picks "Custom…".
      if (current && !families.includes(current)) {
        const o = document.createElement('option')
        o.value = current
        o.textContent = current
        o.selected = true
        select.appendChild(o)
      }
      for (const f of families) {
        const o = document.createElement('option')
        o.value = f
        o.textContent = f
        o.selected = f === current
        select.appendChild(o)
      }
      const c = document.createElement('option')
      c.value = CUSTOM
      c.textContent = 'Custom…'
      select.appendChild(c)
      custom.classList.add('hidden')
    }

    populate(this.localFonts && this.localFonts.length ? this.localFonts : curated)
    paint(cfg.fontFamily)

    select.addEventListener('change', () => {
      if (select.value === CUSTOM) {
        custom.classList.remove('hidden')
        custom.focus()
      } else {
        custom.classList.add('hidden')
        paint(select.value)
        this.patch({ fontFamily: select.value })
      }
    })
    custom.addEventListener('input', () => paint(custom.value))
    custom.addEventListener('change', () => this.patch({ fontFamily: custom.value }))

    // Load the system's installed fonts once (needs Local Font Access), then the
    // dropdown lists them instead of the curated fallback.
    const q = (window as unknown as { queryLocalFonts?: () => Promise<{ family: string }[]> }).queryLocalFonts
    if (this.localFonts === null && q) {
      q().then((fonts) => {
        this.localFonts = [...new Set(fonts.map((f) => f.family))].sort()
        if (this.localFonts.length) populate(this.localFonts)
      }).catch(() => { this.localFonts = [] })
    }

    wrap.append(select, custom, specimen)
    this.fieldRow('Family', wrap)
  }

  private renderTerminal(cfg: Config): void {
    this.sectionTitle('Font')
    this.fontField(cfg)
    this.sliderField('Size', cfg.fontSize, 6, 40, 1, (v) => `${v}px`, (v) => this.patch({ fontSize: v }))
    this.sliderField('Line height', cfg.lineHeight, 1, 2, 0.05, (v) => v.toFixed(2), (v) => this.patch({ lineHeight: v }))
    this.sliderField('Weight', cfg.fontWeight, 100, 900, 100, (v) => String(v), (v) => this.patch({ fontWeight: v }))
    this.sliderField('Letter spacing', cfg.letterSpacing, -2, 4, 0.5, (v) => `${v}px`, (v) => this.patch({ letterSpacing: v }))
    this.sectionTitle('Layout')
    this.sliderField('Padding', cfg.padding, 0, 24, 1, (v) => `${v}px`, (v) => this.patch({ padding: v }))
    this.sectionTitle('Buffer')
    this.sliderField('Scrollback', cfg.scrollback, 1000, 100000, 1000, (v) => `${Math.round(v / 1000)}k lines`, (v) => this.patch({ scrollback: v }))
  }

  private renderWindow(cfg: Config): void {
    this.sectionTitle('Window')
    this.sliderField('Opacity', cfg.opacity, 0.3, 1, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => this.patch({ opacity: v }))
    // Acrylic is a Windows-only material; hide the dead control elsewhere.
    if (window.api.platform === 'win32') {
      this.checkField('Acrylic blur (Win11)', cfg.acrylic, (v) => this.patch({ acrylic: v }))
    }
    this.sliderField('Width', cfg.widthPct, 20, 100, 5, (v) => `${v}%`, (v) => this.patch({ widthPct: v }))
    this.sliderField('Height', cfg.heightPct, 20, 100, 5, (v) => `${v}%`, (v) => this.patch({ heightPct: v }))
    this.sliderField('Animation', cfg.animationMs, 0, 1000, 25, (v) => `${v}ms`, (v) => this.patch({ animationMs: v }))
    this.sectionTitle('Dropdown')
    this.selectField('Edge', [
      { value: 'top', text: 'Top' },
      { value: 'bottom', text: 'Bottom' }
    ], cfg.dropdownEdge, (v) => this.patch({ dropdownEdge: v as Config['dropdownEdge'] }))
    this.selectField('Monitor', [
      { value: 'cursor', text: "Cursor's screen" },
      { value: 'primary', text: 'Primary' }
    ], cfg.dropdownMonitor, (v) => this.patch({ dropdownMonitor: v as Config['dropdownMonitor'] }))
    this.sectionTitle('Behavior')
    this.checkField('Restore tabs on launch', cfg.restoreSession, (v) => this.patch({ restoreSession: v }))
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
      this.textField('Font size (blank = global)', p.fontSize ? String(p.fontSize) : '', (v) => {
        const n = Number(v)
        this.patchProfile(p.id, { fontSize: v.trim() && Number.isFinite(n) ? n : undefined })
      })
    }
  }

  private patchProfile(id: string, over: Partial<Profile>): void {
    const profiles = this.getProfiles().map((p) => (p.id === id ? { ...p, ...over } : p))
    this.patch({ profiles })
  }

  private renderKeybindings(cfg: Config): void {
    this.sectionTitle('Shortcuts — click a binding, then press the keys')
    for (const action of ACTIONS) {
      const ctl = document.createElement('div')
      ctl.className = 'keybind-control'
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'btn keybind-btn'
      btn.textContent = cfg.keybindings[action] || '(unset)'
      const warn = document.createElement('span')
      warn.className = 'keybind-warn'
      const dup = ACTIONS.find((a) => a !== action && cfg.keybindings[a] === cfg.keybindings[action])
      if (dup) warn.textContent = `⚠ also ${dup}`
      btn.addEventListener('click', () => {
        btn.textContent = 'Press keys… (Esc to cancel)'
        btn.classList.add('capturing')
        const cleanup = (): void => window.removeEventListener('keydown', onKey, true)
        const onKey = (e: KeyboardEvent): void => {
          e.preventDefault()
          e.stopPropagation()
          if (e.key === 'Escape') {
            cleanup()
            btn.classList.remove('capturing')
            btn.textContent = cfg.keybindings[action] || '(unset)'
            return
          }
          const accel = formatAccelerator(e)
          if (!accel) return
          cleanup()
          this.patch({ keybindings: { ...this.getConfig().keybindings, [action]: accel } })
        }
        window.addEventListener('keydown', onKey, true)
      })
      ctl.append(btn, warn)
      this.fieldRow(action, ctl)
    }
  }
}
