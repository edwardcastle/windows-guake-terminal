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

function startRename(
  titleEl: HTMLElement,
  index: number,
  apply: (i: number, name: string) => void
): void {
  const original = titleEl.textContent ?? ''
  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'tab-rename'
  input.value = original
  let done = false
  const finish = (commit: boolean): void => {
    if (done) return
    done = true
    if (commit) apply(index, input.value)
    else titleEl.textContent = original
  }
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') { e.preventDefault(); finish(true) }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false) }
  })
  input.addEventListener('blur', () => finish(true))
  titleEl.textContent = ''
  titleEl.appendChild(input)
  input.focus()
  input.select()
}

export function renderTabBar(
  el: HTMLElement,
  tabs: TabInfo[],
  activeIdx: number,
  profiles: Profile[],
  swatches: string[],
  on: TabBarHandlers
): void {
  el.textContent = ''
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
    title.addEventListener('dblclick', (e) => {
      e.stopPropagation()
      startRename(title, i, on.rename)
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
        startRename: () => startRename(title, i, on.rename),
        setColor: (c) => on.setColor(i, c)
      })
    })
    el.appendChild(div)
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
