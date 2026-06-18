export interface Rect { x: number; y: number; w: number; h: number }
export interface Leaf { type: 'leaf'; id: string }
export interface Split {
  type: 'split'
  id: string
  dir: 'row' | 'col'
  ratio: number
  a: PaneNode
  b: PaneNode
}
export type PaneNode = Leaf | Split

export const leaf = (id: string): Leaf => ({ type: 'leaf', id })

export function leaves(n: PaneNode): string[] {
  return n.type === 'leaf' ? [n.id] : [...leaves(n.a), ...leaves(n.b)]
}

export function splitPane(
  root: PaneNode, targetId: string, dir: 'row' | 'col', newId: string, splitId: string
): PaneNode {
  if (root.type === 'leaf') {
    if (root.id !== targetId) return root
    return { type: 'split', id: splitId, dir, ratio: 0.5, a: root, b: leaf(newId) }
  }
  return {
    ...root,
    a: splitPane(root.a, targetId, dir, newId, splitId),
    b: splitPane(root.b, targetId, dir, newId, splitId)
  }
}

export function closePane(root: PaneNode, id: string): PaneNode | null {
  if (root.type === 'leaf') return root.id === id ? null : root
  const a = closePane(root.a, id)
  const b = closePane(root.b, id)
  if (a === null) return b
  if (b === null) return a
  if (a === root.a && b === root.b) return root
  return { ...root, a, b }
}

export function setRatio(root: PaneNode, splitId: string, ratio: number): PaneNode {
  if (root.type === 'leaf') return root
  const r = Math.min(0.9, Math.max(0.1, ratio))
  if (root.id === splitId) return { ...root, ratio: r }
  return { ...root, a: setRatio(root.a, splitId, ratio), b: setRatio(root.b, splitId, ratio) }
}

export function layout(
  root: PaneNode,
  rect: Rect = { x: 0, y: 0, w: 1, h: 1 },
  out: Map<string, Rect> = new Map()
): Map<string, Rect> {
  if (root.type === 'leaf') {
    out.set(root.id, rect)
    return out
  }
  const { x, y, w, h } = rect
  if (root.dir === 'row') {
    layout(root.a, { x, y, w: w * root.ratio, h }, out)
    layout(root.b, { x: x + w * root.ratio, y, w: w * (1 - root.ratio), h }, out)
  } else {
    layout(root.a, { x, y, w, h: h * root.ratio }, out)
    layout(root.b, { x, y: y + h * root.ratio, w, h: h * (1 - root.ratio) }, out)
  }
  return out
}

export function neighbor(
  root: PaneNode, fromId: string, dir: 'left' | 'right' | 'up' | 'down'
): string | null {
  const rects = layout(root)
  const from = rects.get(fromId)
  if (!from) return null
  const EPS = 1e-6
  let best: string | null = null
  let bestOverlap = 0
  for (const [id, r] of rects) {
    if (id === fromId) continue
    const adjacent =
      dir === 'left' ? Math.abs(r.x + r.w - from.x) < EPS :
      dir === 'right' ? Math.abs(from.x + from.w - r.x) < EPS :
      dir === 'up' ? Math.abs(r.y + r.h - from.y) < EPS :
      Math.abs(from.y + from.h - r.y) < EPS
    if (!adjacent) continue
    const overlap = dir === 'left' || dir === 'right'
      ? Math.min(from.y + from.h, r.y + r.h) - Math.max(from.y, r.y)
      : Math.min(from.x + from.w, r.x + r.w) - Math.max(from.x, r.x)
    if (overlap > bestOverlap) {
      bestOverlap = overlap
      best = id
    }
  }
  return best
}

export interface SplitHandle {
  id: string
  dir: 'row' | 'col'
  rect: Rect // the split node's own rect (for drag math)
  pos: number // boundary coordinate in container fractions (x for row, y for col)
}

export function splitHandles(
  n: PaneNode,
  rect: Rect = { x: 0, y: 0, w: 1, h: 1 },
  out: SplitHandle[] = []
): SplitHandle[] {
  if (n.type === 'leaf') return out
  if (n.dir === 'row') {
    const bx = rect.x + rect.w * n.ratio
    out.push({ id: n.id, dir: 'row', rect, pos: bx })
    splitHandles(n.a, { ...rect, w: rect.w * n.ratio }, out)
    splitHandles(n.b, { x: bx, y: rect.y, w: rect.w * (1 - n.ratio), h: rect.h }, out)
  } else {
    const by = rect.y + rect.h * n.ratio
    out.push({ id: n.id, dir: 'col', rect, pos: by })
    splitHandles(n.a, { ...rect, h: rect.h * n.ratio }, out)
    splitHandles(n.b, { x: rect.x, y: by, w: rect.w, h: rect.h * (1 - n.ratio) }, out)
  }
  return out
}
