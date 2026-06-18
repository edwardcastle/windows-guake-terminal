import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { Profile } from '../shared/config'

export function listWslDistros(
  run: () => Buffer = () => execFileSync('wsl.exe', ['-l', '-q'])
): string[] {
  try {
    return run()
      .toString('utf16le')
      .split(/\r?\n/)
      .map((s) => s.replace(/\0/g, '').trim())
      .filter((s) => s && s !== 'docker-desktop' && s !== 'docker-desktop-data')
  } catch {
    return []
  }
}

export function detectProfiles(): Profile[] {
  const profiles: Profile[] = []

  const pwsh = [
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    'C:\\Program Files (x86)\\PowerShell\\7\\pwsh.exe'
  ].find((p) => fs.existsSync(p))
  if (pwsh) profiles.push({ id: 'pwsh', name: 'PowerShell 7', exe: pwsh, args: ['-NoLogo'] })

  profiles.push({
    id: 'powershell', name: 'Windows PowerShell', exe: 'powershell.exe', args: ['-NoLogo']
  })
  profiles.push({ id: 'cmd', name: 'cmd', exe: process.env.ComSpec ?? 'cmd.exe', args: [] })

  for (const distro of listWslDistros()) {
    profiles.push({ id: `wsl-${distro}`, name: `WSL: ${distro}`, exe: 'wsl.exe', args: ['-d', distro] })
  }

  const gitBash = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    `${process.env.LOCALAPPDATA ?? ''}\\Programs\\Git\\bin\\bash.exe`
  ].find((p) => p && fs.existsSync(p))
  if (gitBash) {
    profiles.push({ id: 'gitbash', name: 'Git Bash', exe: gitBash, args: ['--login', '-i'] })
  }

  return profiles
}
