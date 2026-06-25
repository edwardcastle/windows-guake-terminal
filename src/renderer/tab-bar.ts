import type { Profile } from '../shared/config'

export interface TabInfo { id: string; title: string; color?: string }

export interface TabBarHandlers {
  select(index: number): void
  close(index: number): void
  newTab(profileId?: string): void
  openSettings(): void
}

export function renderTabBar(
  el: HTMLElement,
  tabs: TabInfo[],
  activeIdx: number,
  profiles: Profile[],
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
    const close = document.createElement('span')
    close.className = 'close'
    close.textContent = '✕'
    close.addEventListener('click', (e) => { e.stopPropagation(); on.close(i) })
    div.append(title, close)
    div.addEventListener('click', () => on.select(i))
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
