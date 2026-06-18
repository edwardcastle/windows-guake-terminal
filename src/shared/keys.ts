export interface KeyCombo {
  ctrl: boolean
  shift: boolean
  alt: boolean
  key: string
}

export interface KeyEventLike {
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  key: string
}

export function parseCombo(s: string): KeyCombo {
  const parts = s.split('+')
  const key = parts.pop() ?? ''
  const mods = parts.map((p) => p.toLowerCase())
  return {
    ctrl: mods.includes('ctrl'),
    shift: mods.includes('shift'),
    alt: mods.includes('alt'),
    key: key.length === 1 ? key.toLowerCase() : key
  }
}

export function comboMatches(combo: KeyCombo, e: KeyEventLike): boolean {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
  return (
    e.ctrlKey === combo.ctrl &&
    e.shiftKey === combo.shift &&
    e.altKey === combo.alt &&
    k === combo.key
  )
}

export function matchAction(
  keybindings: Record<string, string>,
  e: KeyEventLike
): string | null {
  for (const [action, binding] of Object.entries(keybindings)) {
    if (comboMatches(parseCombo(binding), e)) return action
  }
  return null
}
