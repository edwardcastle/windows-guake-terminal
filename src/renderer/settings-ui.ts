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
