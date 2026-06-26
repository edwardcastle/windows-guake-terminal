import { PaneNode, layout, splitHandles } from '../shared/pane-tree'
import type { TermPane } from './term-pane'

const SPLITTER_PX = 6

export function renderPanes(
  container: HTMLElement,
  root: PaneNode,
  panes: Map<string, TermPane>,
  activePaneId: string,
  onRatio: (splitId: string, ratio: number) => void,
  onFocus: (paneId: string) => void
): void {
  container.querySelectorAll('.splitter').forEach((s) => s.remove())
  const W = container.clientWidth
  const H = container.clientHeight

  for (const [paneId, r] of layout(root)) {
    const pane = panes.get(paneId)
    if (!pane) continue
    if (pane.el.parentElement !== container) container.appendChild(pane.el)
    // Clear inset FIRST: it is the shorthand for top/right/bottom/left, so
    // assigning it after left/top would wipe the geometry we set (the bug that
    // stacked split panes at 0,0).
    pane.el.style.inset = ''
    pane.el.style.left = `${r.x * W}px`
    pane.el.style.top = `${r.y * H}px`
    pane.el.style.width = `${r.w * W}px`
    pane.el.style.height = `${r.h * H}px`
    pane.el.classList.toggle('active-pane', paneId === activePaneId)
    // Capture phase so the pane switch registers even though xterm handles
    // mousedown on its inner elements; also focus this pane's terminal directly
    // so input lands here regardless of render() timing.
    if (pane.el.dataset.focusWired !== '1') {
      pane.el.dataset.focusWired = '1'
      pane.el.addEventListener('mousedown', () => { onFocus(paneId); pane.term.focus() }, true)
    }
    pane.fitNow()
  }

  for (const h of splitHandles(root)) {
    const s = document.createElement('div')
    s.className = `splitter ${h.dir}`
    if (h.dir === 'row') {
      s.style.left = `${h.pos * W - SPLITTER_PX / 2}px`
      s.style.top = `${h.rect.y * H}px`
      s.style.width = `${SPLITTER_PX}px`
      s.style.height = `${h.rect.h * H}px`
    } else {
      s.style.left = `${h.rect.x * W}px`
      s.style.top = `${h.pos * H - SPLITTER_PX / 2}px`
      s.style.width = `${h.rect.w * W}px`
      s.style.height = `${SPLITTER_PX}px`
    }
    s.addEventListener('mousedown', (down) => {
      down.preventDefault()
      const move = (e: MouseEvent): void => {
        const ratio = h.dir === 'row'
          ? (e.clientX / W - h.rect.x) / h.rect.w
          : ((e.clientY - container.getBoundingClientRect().top) / H - h.rect.y) / h.rect.h
        onRatio(h.id, ratio)
      }
      const up = (): void => {
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
      }
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
    })
    container.appendChild(s)
  }
}
