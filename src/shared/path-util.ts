// Compute a path relative to a directory, normalizing separators. Falls back to
// the original path when there is no shared root (empty dir, or a different
// Windows drive). Pure — no Node path module, so it is unit-testable.
export function relativePath(fromDir: string, toPath: string): string {
  if (!fromDir) return toPath
  const split = (p: string): string[] => p.replace(/\\/g, '/').replace(/\/+$/, '').split('/').filter(Boolean)
  const from = split(fromDir)
  const to = split(toPath)
  const drive = (s?: string): string => (/^[a-zA-Z]:$/.test(s ?? '') ? (s as string).toLowerCase() : '')
  if (drive(from[0]) !== drive(to[0])) return toPath
  let i = 0
  while (i < from.length && i < to.length && from[i] === to[i]) i++
  const rel = [...Array(from.length - i).fill('..'), ...to.slice(i)]
  return rel.length ? rel.join('/') : '.'
}
