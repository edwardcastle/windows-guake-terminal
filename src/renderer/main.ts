import '@xterm/xterm/css/xterm.css'
import './styles.css'
import type { Config, Profile } from '../shared/config'
import { TermPane } from './term-pane'

const panes = new Map<string, TermPane>()

async function boot(): Promise<void> {
  const config = (await window.api.getConfig()) as Config
  const profiles = (await window.api.getProfiles()) as Profile[]

  window.api.onData((id, d) => panes.get(id)?.term.write(d))
  window.api.onExit((id, c) => panes.get(id)?.handleExit(c))

  const pane = new TermPane('p1', config.defaultProfileId || profiles[0].id, config)
  pane.el.style.inset = '0'
  document.querySelector('#panes')!.appendChild(pane.el)
  panes.set(pane.id, pane)
  await pane.spawnShell()
  pane.term.focus()
}

void boot()
