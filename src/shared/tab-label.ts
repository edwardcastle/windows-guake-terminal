export function displayTitle(auto: string, custom?: string): string {
  const c = custom?.trim()
  return c ? c : auto
}

export function displayColor(profileColor?: string, custom?: string): string | undefined {
  return custom || profileColor
}
