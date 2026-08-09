import type { TermPane } from './term-pane'

type FindOpts = { caseSensitive: boolean; wholeWord: boolean; regex: boolean }

const DECORATIONS = {
  matchOverviewRuler: '#888888',
  activeMatchColorOverviewRuler: '#f2c94c',
  matchBackground: '#f2c94c55',
  activeMatchBackground: '#ff9900aa'
}

export class FindBar {
  private el = document.createElement('div')
  private input = document.createElement('input')
  private count = document.createElement('span')
  private pane: TermPane | null = null
  private opts: FindOpts = { caseSensitive: false, wholeWord: false, regex: false }
  private results?: { dispose(): void }

  constructor(parent: HTMLElement) {
    this.el.id = 'findbar'
    this.el.className = 'overlay hidden'
    this.input.placeholder = 'Find…'
    this.count.className = 'find-count'

    const toggle = (label: string, title: string, key: keyof FindOpts): HTMLButtonElement => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'find-toggle'
      b.textContent = label
      b.title = title
      b.addEventListener('click', () => {
        this.opts[key] = !this.opts[key]
        b.classList.toggle('on', this.opts[key])
        this.input.focus()
        this.find(true)
      })
      return b
    }

    this.el.append(
      this.input,
      this.count,
      toggle('Aa', 'Match case', 'caseSensitive'),
      toggle('W', 'Whole word', 'wholeWord'),
      toggle('.*', 'Regular expression', 'regex')
    )
    parent.appendChild(this.el)

    this.input.addEventListener('input', () => this.find(true))
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Escape') this.close()
      else if (e.key === 'Enter' && e.shiftKey) this.find(false, true)
      else if (e.key === 'Enter') this.find(false)
    })
  }

  private searchOptions(incremental: boolean): Record<string, unknown> {
    return { ...this.opts, incremental, decorations: DECORATIONS }
  }

  private find(incremental: boolean, prev = false): void {
    if (!this.pane) return
    const term = this.input.value
    if (prev) this.pane.search.findPrevious(term, this.searchOptions(false))
    else this.pane.search.findNext(term, this.searchOptions(incremental))
  }

  open(pane: TermPane): void {
    this.pane = pane
    this.results?.dispose()
    this.results = pane.search.onDidChangeResults(({ resultIndex, resultCount }) => {
      this.count.textContent =
        resultCount > 0 ? `${resultIndex + 1}/${resultCount}` : this.input.value ? '0/0' : ''
    })
    this.el.classList.remove('hidden')
    this.input.select()
    this.input.focus()
    if (this.input.value) this.find(true)
  }

  close(): void {
    this.el.classList.add('hidden')
    this.results?.dispose()
    this.results = undefined
    this.pane?.term.focus()
    this.pane = null
  }

  isOpen(): boolean {
    return !this.el.classList.contains('hidden')
  }
}
