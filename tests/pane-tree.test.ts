import { describe, expect, test } from 'vitest'
import {
  leaf, leaves, splitPane, closePane, setRatio, layout, neighbor, splitHandles
} from '../src/shared/pane-tree'

describe('splitPane', () => {
  test('splitting a leaf creates a 50/50 split', () => {
    const root = splitPane(leaf('p1'), 'p1', 'row', 'p2', 's1')
    expect(root).toEqual({
      type: 'split', id: 's1', dir: 'row', ratio: 0.5,
      a: { type: 'leaf', id: 'p1' }, b: { type: 'leaf', id: 'p2' }
    })
  })

  test('splits the correct nested leaf only', () => {
    let root = splitPane(leaf('p1'), 'p1', 'row', 'p2', 's1')
    root = splitPane(root, 'p2', 'col', 'p3', 's2')
    expect(leaves(root)).toEqual(['p1', 'p2', 'p3'])
  })
})

describe('closePane', () => {
  test('closing the only leaf returns null', () => {
    expect(closePane(leaf('p1'), 'p1')).toBeNull()
  })

  test('closing one side collapses the split', () => {
    const root = splitPane(leaf('p1'), 'p1', 'row', 'p2', 's1')
    expect(closePane(root, 'p1')).toEqual({ type: 'leaf', id: 'p2' })
  })
})

describe('setRatio', () => {
  test('updates the right split and clamps to [0.1, 0.9]', () => {
    const root = splitPane(leaf('p1'), 'p1', 'row', 'p2', 's1')
    const r1 = setRatio(root, 's1', 0.7)
    expect(r1.type === 'split' && r1.ratio).toBe(0.7)
    const r2 = setRatio(root, 's1', 0.01)
    expect(r2.type === 'split' && r2.ratio).toBe(0.1)
    const r3 = setRatio(root, 's1', 0.99)
    expect(r3.type === 'split' && r3.ratio).toBe(0.9)
  })
})

describe('layout', () => {
  test('row split divides width by ratio', () => {
    const root = setRatio(splitPane(leaf('p1'), 'p1', 'row', 'p2', 's1'), 's1', 0.25)
    const rects = layout(root)
    expect(rects.get('p1')).toEqual({ x: 0, y: 0, w: 0.25, h: 1 })
    expect(rects.get('p2')).toEqual({ x: 0.25, y: 0, w: 0.75, h: 1 })
  })

  test('col split divides height by ratio', () => {
    const root = setRatio(splitPane(leaf('p1'), 'p1', 'col', 'p2', 's1'), 's1', 0.25)
    const rects = layout(root)
    expect(rects.get('p1')).toEqual({ x: 0, y: 0, w: 1, h: 0.25 })
    expect(rects.get('p2')).toEqual({ x: 0, y: 0.25, w: 1, h: 0.75 })
  })
})

describe('neighbor', () => {
  test('finds the pane across a row split', () => {
    const root = splitPane(leaf('p1'), 'p1', 'row', 'p2', 's1')
    expect(neighbor(root, 'p1', 'right')).toBe('p2')
    expect(neighbor(root, 'p2', 'left')).toBe('p1')
    expect(neighbor(root, 'p1', 'left')).toBeNull()
  })

  test('picks the adjacent pane with the largest overlap', () => {
    // left pane | right side split vertically -> from top-right going left = p1
    let root = splitPane(leaf('p1'), 'p1', 'row', 'p2', 's1')
    root = splitPane(root, 'p2', 'col', 'p3', 's2')
    expect(neighbor(root, 'p3', 'left')).toBe('p1')
    expect(neighbor(root, 'p1', 'right')).toBe('p2')
  })

  test('finds the pane across a col split (up and down)', () => {
    const root = splitPane(leaf('p1'), 'p1', 'col', 'p2', 's1')
    expect(neighbor(root, 'p1', 'down')).toBe('p2')
    expect(neighbor(root, 'p2', 'up')).toBe('p1')
    expect(neighbor(root, 'p1', 'up')).toBeNull()
  })
})

describe('splitHandles', () => {
  test('one handle per split, at the boundary', () => {
    const root = splitPane(leaf('p1'), 'p1', 'row', 'p2', 's1')
    const handles = splitHandles(root)
    expect(handles).toHaveLength(1)
    expect(handles[0]).toMatchObject({ id: 's1', dir: 'row', pos: 0.5 })
  })
})
