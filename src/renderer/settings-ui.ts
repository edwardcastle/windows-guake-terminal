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
    const profiles = this.getProfiles().map((p) => (p.theme === oldName ? { ...p, theme: next } : p))
    this.patch({ customThemes: themes, theme: cfg.theme === oldName ? next : cfg.theme, profiles })
  }

  private deleteTheme(cfg: Config, name: string): void {
    const themes = { ...cfg.customThemes }
    delete themes[name]
    const profiles = this.getProfiles().map((p) => (p.theme === name ? { ...p, theme: undefined } : p))
    this.patch({ customThemes: themes, theme: cfg.theme === name ? 'dracula' : cfg.theme, profiles })
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
    this.sectionTitle('Shortcuts (Electron accelerator strings)')
    for (const action of ACTIONS) {
      this.textField(action, cfg.keybindings[action], (v) =>
        this.patch({ keybindings: { ...cfg.keybindings, [action]: v } }))
    }
  }
}
