import type { Profile } from '../shared/config'
import { openTabMenu } from './tab-context-menu'

export interface TabInfo { id: string; title: string; color?: string }

export interface TabBarHandlers {
  select(index: number): void
  close(index: number): void
  newTab(profileId?: string): void
  openSettings(): void
  rename(index: number, name: string): void
  setColor(index: number, color: string): void
  moveTab(from: number, to: number): void
}

// An in-progress rename has to outlive a re-render: render() runs for reasons
// that have nothing to do with the tab bar (the shell emitting an OSC title,
// selecting a tab, resizing a split), and it rebuilds every tab from scratch.
// Keeping the edit in module state lets renderTabBar restore it afterwards.
interface RenameState { index: number; value: string; selStart: number; selEnd: number }
let renaming: RenameState | null = null
// True only while renderTabBar tears the old tabs down. Removing a focused
// input fires blur, which would otherwise commit and re-enter render().
let tearingDown = false

export function isRenaming(): boolean {
  return renaming !== null
}

function openRename(
  titleEl: HTMLElement,
  index: number,
  apply: (i: number, name: string) => void,
  original: string,
  value: string,
  selStart: number,
  selEnd: number
): void {
  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'tab-rename'
  input.value = value
  let done = false
  const finish = (commit: boolean): void => {
    if (done) return
    done = true
    const text = input.value
    // Clear first: apply() re-renders, and that pass must not restore the input.
    renaming = null
    if (commit) apply(index, text)
    else titleEl.textContent = original
  }
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') { e.preventDefault(); finish(true) }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false) }
  })
  input.addEventListener('blur', () => { if (!tearingDown) finish(true) })
  titleEl.textContent = ''
  titleEl.appendChild(input)
  input.focus()
  input.setSelectionRange(selStart, selEnd)
}

function beginRename(
  titleEl: HTMLElement,
  index: number,
  apply: (i: number, name: string) => void,
  original: string
): void {
  renaming = { index, value: original, selStart: 0, selEnd: original.length }
  openRename(titleEl, index, apply, original, original, 0, original.length)
}

export function renderTabBar(
  el: HTMLElement,
  tabs: TabInfo[],
  activeIdx: number,
  profiles: Profile[],
  swatches: string[],
  on: TabBarHandlers
): void {
  // Snapshot a live edit before the teardown discards it, so the caret and the
  // half-typed name survive re-renders the user did not ask for.
  const live = el.querySelector<HTMLInputElement>('input.tab-rename')
  if (live && renaming) {
    renaming.value = live.value
    renaming.selStart = live.selectionStart ?? live.value.length
    renaming.selEnd = live.selectionEnd ?? live.value.length
  }
  if (renaming && renaming.index >= tabs.length) renaming = null
  tearingDown = true
  el.textContent = ''
  tearingDown = false
  tabs.forEach((tab, i) => {
    const div = document.createElement('div')
    div.className = 'tab' + (i === activeIdx ? ' active' : '')
    if (tab.color) {
      const dot = document.createElement('span')
      dot.className = 'dot'
      dot.style.background = tab.color
      div.appendChild(dot)
    }
    const title = document.createElement('span')
    title.className = 'title'
    title.textContent = tab.title
    // detail === 2 is the second click of a double-click. A dblclick listener
    // would be unreliable here: the first click selects the tab, which
    // re-renders and replaces this very node before the second click lands.
    title.addEventListener('click', (e) => {
      if (e.detail !== 2) return
      e.stopPropagation()
      beginRename(title, i, on.rename, tab.title)
    })
    const close = document.createElement('span')
    close.className = 'close'
    close.textContent = '✕'
    close.addEventListener('click', (e) => { e.stopPropagation(); on.close(i) })
    div.append(title, close)
    div.addEventListener('click', () => on.select(i))
    div.draggable = true
    div.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/plain', String(i))
      div.classList.add('dragging')
    })
    div.addEventListener('dragend', () => div.classList.remove('dragging'))
    div.addEventListener('dragover', (e) => e.preventDefault())
    div.addEventListener('drop', (e) => {
      e.preventDefault()
      const from = Number(e.dataTransfer?.getData('text/plain'))
      if (Number.isInteger(from) && from !== i) on.moveTab(from, i)
    })
    div.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      openTabMenu(e.clientX, e.clientY, swatches, {
        startRename: () => beginRename(title, i, on.rename, tab.title),
        setColor: (c) => on.setColor(i, c)
      })
    })
    el.appendChild(div)
    // Reopen after the node is connected — focus() is a no-op while detached.
    if (renaming && renaming.index === i) {
      openRename(title, i, on.rename, tab.title, renaming.value, renaming.selStart, renaming.selEnd)
    }
  })

  const plus = document.createElement('div')
  plus.className = 'tab-btn'
  plus.textContent = '+'
  plus.title = 'New tab (default profile)'
  plus.addEventListener('click', () => on.newTab())
  el.appendChild(plus)

  const chooser = document.createElement('div')
  chooser.className = 'tab-btn'
  chooser.textContent = '▾'
  chooser.title = 'New tab with profile…'
  chooser.addEventListener('click', () => {
    document.querySelector('#profile-menu')?.remove()
    const menu = document.createElement('div')
    menu.id = 'profile-menu'
    const rect = chooser.getBoundingClientRect()
    menu.style.left = `${rect.left}px`
    menu.style.top = `${rect.bottom}px`
    for (const p of profiles) {
      const item = document.createElement('div')
      item.textContent = p.name
      item.addEventListener('click', () => { menu.remove(); on.newTab(p.id) })
      menu.appendChild(item)
    }
    document.body.appendChild(menu)
    setTimeout(() => {
      document.addEventListener('click', () => menu.remove(), { once: true })
    })
  })
  el.appendChild(chooser)

  const settingsBtn = document.createElement('div')
  settingsBtn.className = 'tab-btn settings-btn'
  settingsBtn.textContent = '⚙'
  settingsBtn.title = 'Appearance & settings (Ctrl+Shift+A)'
  settingsBtn.addEventListener('click', () => on.openSettings())
  el.appendChild(settingsBtn)
}
