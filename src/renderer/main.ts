import '@xterm/xterm/css/xterm.css'
import './styles.css'
import type { Config, Profile } from '../shared/config'
import { PaneNode, leaf, leaves } from '../shared/pane-tree'
import { TermPane } from './term-pane'
import { renderTabBar } from './tab-bar'

interface Tab {
  id: string
  title: string
  root: PaneNode
  activePane: string
  container: HTMLDivElement
}

let config: Config
let profiles: Profile[] = []
const panes = new Map<string, TermPane>()
let tabs: Tab[] = []
let activeTabIdx = 0
let nextId = 1
const uid = (prefix: string): string => `${prefix}${nextId++}`

const tabbarEl = document.querySelector('#tabbar') as HTMLElement
const panesEl = document.querySelector('#panes') as HTMLElement

function activeTab(): Tab | undefined { return tabs[activeTabIdx] }
function activePane(): TermPane | undefined {
  const t = activeTab()
  return t ? panes.get(t.activePane) : undefined
}

function createPane(profileId: string): TermPane {
  const pane = new TermPane(uid('p'), profileId, config)
  panes.set(pane.id, pane)
  pane.onTitle = (title) => {
    const tab = tabs.find((t) => leaves(t.root).includes(pane.id))
    if (tab && tab.activePane === pane.id) {
      tab.title = title || profileName(profileId)
      render()
    }
  }
  void pane.spawnShell()
  return pane
}

function profileName(id: string): string {
  return profiles.find((p) => p.id === id)?.name ?? id
}

export function newTab(profileId?: string): void {
  const pid = profileId || config.defaultProfileId || profiles[0].id
  const pane = createPane(pid)
  const container = document.createElement('div')
  container.className = 'tab-container'
  container.appendChild(pane.el)
  pane.el.style.inset = '0'
  panesEl.appendChild(container)
  tabs.push({ id: uid('t'), title: profileName(pid), root: leaf(pane.id), activePane: pane.id, container })
  activeTabIdx = tabs.length - 1
  render()
}

function closeTab(idx: number): void {
  const tab = tabs[idx]
  for (const paneId of leaves(tab.root)) {
    panes.get(paneId)?.dispose()
    panes.delete(paneId)
  }
  tab.container.remove()
  tabs.splice(idx, 1)
  if (activeTabIdx >= tabs.length) activeTabIdx = tabs.length - 1
  if (tabs.length === 0) newTab() // the window never goes empty
  else render()
}

function selectTab(idx: number): void {
  activeTabIdx = idx
  render()
}

export function nextTab(delta: 1 | -1): void {
  if (tabs.length < 2) return
  activeTabIdx = (activeTabIdx + delta + tabs.length) % tabs.length
  render()
}

export function render(): void {
  renderTabBar(
    tabbarEl,
    tabs.map((t) => ({ id: t.id, title: t.title })),
    activeTabIdx,
    profiles,
    { select: selectTab, close: closeTab, newTab }
  )
  tabs.forEach((tab, i) => {
    tab.container.classList.toggle('hidden', i !== activeTabIdx)
  })
  const pane = activePane()
  if (pane) {
    pane.fitNow()
    pane.term.focus()
  }
}

async function boot(): Promise<void> {
  config = (await window.api.getConfig()) as Config
  profiles = (await window.api.getProfiles()) as Profile[]
  window.api.onData((id, d) => panes.get(id)?.term.write(d))
  window.api.onExit((id, c) => panes.get(id)?.handleExit(c))
  newTab()
}

void boot()
