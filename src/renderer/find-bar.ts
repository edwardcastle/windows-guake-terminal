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

  isOpen(): boolean {
    return !this.el.classList.contains('hidden')
  }
}
