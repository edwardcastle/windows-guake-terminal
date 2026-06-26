function makeButton(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'btn'
  b.textContent = text
  b.addEventListener('click', onClick)
  return b
}

export function openTabMenu(
  x: number,
  y: number,
  swatches: string[],
  on: { startRename: () => void; setColor: (color: string) => void }
): void {
  document.querySelector('#tab-menu')?.remove()
  const menu = document.createElement('div')
  menu.id = 'tab-menu'
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

  menu.appendChild(makeButton('Rename', () => { close(); on.startRename() }))

  const colorRow = document.createElement('div')
  colorRow.className = 'tab-menu-row'
  for (const hex of swatches) {
    const dot = document.createElement('span')
    dot.className = 'swatch-dot'
    dot.style.background = hex
    dot.title = hex
    dot.addEventListener('click', () => { close(); on.setColor(hex) })
    colorRow.appendChild(dot)
  }
  const custom = document.createElement('input')
  custom.type = 'color'
  custom.title = 'Custom color'
  custom.addEventListener('input', () => on.setColor(custom.value))
  custom.addEventListener('change', () => close())
  colorRow.appendChild(custom)
  menu.appendChild(colorRow)

  menu.appendChild(makeButton('Default color', () => { close(); on.setColor('') }))

  document.body.appendChild(menu)
  setTimeout(() => {
    document.addEventListener('mousedown', onDocDown, true)
    document.addEventListener('keydown', onKey, true)
  })
}
