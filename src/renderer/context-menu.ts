export interface MenuItem {
  label: string
  disabled?: boolean
  onClick: () => void
}

export function openContextMenu(x: number, y: number, items: MenuItem[]): void {
  document.querySelector('#context-menu')?.remove()
  const menu = document.createElement('div')
  menu.id = 'context-menu'
  menu.style.left = `${x}px`
  menu.style.top = `${y}px`

  const onDocDown = (e: MouseEvent): void => {
    if (!menu.contains(e.target as Node)) close()
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close()
  }
  function close(): void {
    menu.remove()
    document.removeEventListener('mousedown', onDocDown, true)
    document.removeEventListener('keydown', onKey, true)
  }

  for (const item of items) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'menu-item'
    b.textContent = item.label
    b.disabled = !!item.disabled
    b.addEventListener('click', () => { close(); item.onClick() })
    menu.appendChild(b)
  }

  document.body.appendChild(menu)
  setTimeout(() => {
    document.addEventListener('mousedown', onDocDown, true)
    document.addEventListener('keydown', onKey, true)
  })
}
