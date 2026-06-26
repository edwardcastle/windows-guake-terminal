import { describe, expect, test } from 'vitest'
import { displayTitle, displayColor } from '../src/shared/tab-label'

describe('displayTitle', () => {
  test('prefers a non-empty custom title, else the auto title', () => {
    expect(displayTitle('bash', 'deploy')).toBe('deploy')
    expect(displayTitle('bash')).toBe('bash')
    expect(displayTitle('bash', '')).toBe('bash')
    expect(displayTitle('bash', '   ')).toBe('bash')
  })
})

describe('displayColor', () => {
  test('prefers custom, else profile color, else undefined', () => {
    expect(displayColor('#888888', '#ff0000')).toBe('#ff0000')
    expect(displayColor('#888888')).toBe('#888888')
    expect(displayColor('#888888', '')).toBe('#888888')
    expect(displayColor(undefined, undefined)).toBeUndefined()
  })
})
