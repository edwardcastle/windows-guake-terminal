export interface Command {
  id: string
  label: string
  hint?: string
  run: () => void
}

function matches(query: string, text: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  let i = 0
  for (const ch of t) {
    if (ch === q[i]) i++
    if (i === q.length) return true
  }
  return false
}

export class CommandPalette {
  private el = document.createElement('div')
  private input = document.createElement('input')
  private list = document.createElement('div')
  private filtered: Command[] = []
  private sel = 0

  constructor(
    parent: HTMLElement,
    private getCommands: () => Command[],
    private onClose: () => void
  ) {
    this.el.id = 'command-palette'
    this.el.className = 'overlay hidden'
    const box = document.createElement('div')
    box.className = 'cmd-box'
    this.input.className = 'cmd-input'
    this.input.placeholder = 'Type a command…'
    this.list.className = 'cmd-list'
    box.append(this.input, this.list)
    this.el.appendChild(box)
    parent.appendChild(this.el)

    this.el.addEventListener('mousedown', (e) => { if (e.target === this.el) this.close() })
    this.input.addEventListener('input', () => this.refilter())
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Escape') this.close()
      else if (e.key === 'ArrowDown') { e.preventDefault(); this.move(1) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.move(-1) }
      else if (e.key === 'Enter') { e.preventDefault(); this.runSelected() }
    })
  }

  isOpen(): boolean { return !this.el.classList.contains('hidden') }
  toggle(): void { this.isOpen() ? this.close() : this.open() }

  open(): void {
    this.input.value = ''
    this.refilter()
    this.el.classList.remove('hidden')
    this.input.focus()
  }

  close(): void {
    this.el.classList.add('hidden')
    this.onClose()
  }

  private refilter(): void {
    const q = this.input.value.trim()
    this.filtered = this.getCommands().filter((c) => matches(q, c.label))
    this.sel = 0
    this.renderList()
  }

  private move(d: number): void {
    if (!this.filtered.length) return
    this.sel = (this.sel + d + this.filtered.length) % this.filtered.length
    this.renderList()
  }

  private runSelected(): void {
    const cmd = this.filtered[this.sel]
    this.close()
    cmd?.run()
  }

  private renderList(): void {
    this.list.textContent = ''
    this.filtered.slice(0, 50).forEach((c, i) => {
      const row = document.createElement('div')
      row.className = 'cmd-row' + (i === this.sel ? ' sel' : '')
      const label = document.createElement('span')
      label.textContent = c.label
      row.appendChild(label)
      if (c.hint) {
        const h = document.createElement('span')
        h.className = 'cmd-hint'
        h.textContent = c.hint
        row.appendChild(h)
      }
      row.addEventListener('mousedown', (e) => { e.preventDefault(); this.sel = i; this.runSelected() })
      this.list.appendChild(row)
    })
  }
}
