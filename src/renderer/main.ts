import '@xterm/xterm/css/xterm.css'
import './styles.css'
import type { Config, Profile } from '../shared/config'
import { PaneNode, leaf, leaves, splitPane, closePane, setRatio, neighbor } from '../shared/pane-tree'
import { matchAction } from '../shared/keys'
import { renderPanes } from './pane-view'
import { TermPane } from './term-pane'
import { renderTabBar } from './tab-bar'
import { FindBar } from './find-bar'
import { SettingsUI } from './settings-ui'
import { uiPalette, resolveTheme } from '../shared/theme'

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
const findBar = new FindBar(document.body)
const settings = new SettingsUI(
  document.body,
  () => config,
  () => profiles,
  (patch) => void window.api.setConfig(patch)
)

function applyAppearance(cfg: Config): void {
  const pal = uiPalette(resolveTheme(cfg.theme, cfg.customThemes), cfg.accent)
  const s = document.documentElement.style
  s.setProperty('--term-bg', pal.termBg)
  s.setProperty('--ui-bg', pal.uiBg)
  s.setProperty('--ui-fg', pal.uiFg)
  s.setProperty('--ui-accent', pal.uiAccent)
  s.setProperty('--ui-border', pal.uiBorder)
  s.setProperty('--ui-muted', pal.uiMuted)
  s.setProperty('--term-padding', `${cfg.padding}px`)
}

function activeTab(): Tab | undefined { return tabs[activeTabIdx] }
function colorForTab(t: Tab): string | undefined {
  const pid = panes.get(t.activePane)?.profileId
  return profiles.find((p) => p.id === pid)?.color
}
function activePane(): TermPane | undefined {
  const t = activeTab()
  return t ? panes.get(t.activePane) : undefined
}

function createPane(profileId: string): TermPane {
  const profile = profiles.find((p) => p.id === profileId)
  const pane = new TermPane(uid('p'), profile, config)
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
    tabs.map((t) => ({ id: t.id, title: t.title, color: colorForTab(t) })),
    activeTabIdx,
    profiles,
    { select: selectTab, close: closeTab, newTab, openSettings: () => settings.open() }
  )
  tabs.forEach((tab, i) => {
    tab.container.classList.toggle('hidden', i !== activeTabIdx)
  })
  const tab = activeTab()
  if (tab) {
    renderPanes(tab.container, tab.root, panes, tab.activePane,
      (splitId, ratio) => {
        tab.root = setRatio(tab.root, splitId, ratio)
        render()
      },
      (paneId) => {
        tab.activePane = paneId
        render()
      }
    )
    if (!findBar.isOpen() && !settings.isOpen()) panes.get(tab.activePane)?.term.focus()
  }
}

async function boot(): Promise<void> {
  config = (await window.api.getConfig()) as Config
  profiles = (await window.api.getProfiles()) as Profile[]
  window.api.onData((id, d) => panes.get(id)?.term.write(d))
  window.api.onExit((id, c) => panes.get(id)?.handleExit(c))
  applyAppearance(config)
  window.api.onConfigChanged((c) => {
    config = c as Config
    profiles = config.profiles
    applyAppearance(config)
    panes.forEach((p) => p.applyConfig(config))
    settings.syncFromConfig()
    render()
  })
  window.api.onOpenSettings(() => settings.open())
  new ResizeObserver(() => render()).observe(panesEl)
  newTab()
}

void boot()

function splitActive(dir: 'row' | 'col'): void {
  const tab = activeTab()
  if (!tab) return
  const current = panes.get(tab.activePane)
  const pane = createPane(current?.profileId || config.defaultProfileId || profiles[0].id)
  tab.root = splitPane(tab.root, tab.activePane, dir, pane.id, uid('s'))
  tab.activePane = pane.id
  render()
}

function closeActivePane(): void {
  const tab = activeTab()
  if (!tab) return
  const closingId = tab.activePane
  panes.get(closingId)?.dispose()
  panes.delete(closingId)
  const root = closePane(tab.root, closingId)
  if (root === null) {
    closeTab(activeTabIdx)
    return
  }
  tab.root = root
  tab.activePane = leaves(root)[0]
  render()
}

function focusDirection(dir: 'left' | 'right' | 'up' | 'down'): void {
  const tab = activeTab()
  if (!tab) return
  const target = neighbor(tab.root, tab.activePane, dir)
  if (target) {
    tab.activePane = target
    render()
  }
}

function changeFontSize(delta: number | null): void {
  const next = delta === null ? config.fontSize : (activePane()?.term.options.fontSize ?? config.fontSize) + delta
  const clamped = Math.min(40, Math.max(6, next))
  panes.forEach((p) => p.setFontSize(clamped))
}

async function runAction(action: string): Promise<void> {
  const pane = activePane()
  switch (action) {
    case 'newTab': newTab(); break
    case 'closePane': closeActivePane(); break
    case 'nextTab': nextTab(1); break
    case 'prevTab': nextTab(-1); break
    case 'splitRight': splitActive('row'); break
    case 'splitDown': splitActive('col'); break
    case 'focusLeft': focusDirection('left'); break
    case 'focusRight': focusDirection('right'); break
    case 'focusUp': focusDirection('up'); break
    case 'focusDown': focusDirection('down'); break
    case 'copy': {
      const sel = pane?.term.getSelection()
      if (sel) await navigator.clipboard.writeText(sel)
      break
    }
    case 'paste': {
      const text = await navigator.clipboard.readText()
      if (text && pane && !pane.exited) window.api.write(pane.id, text)
      break
    }
    case 'fontBigger': changeFontSize(1); break
    case 'fontSmaller': changeFontSize(-1); break
    case 'fontReset': changeFontSize(null); break
    case 'find': {
      if (pane) findBar.open(pane)
      break
    }
    case 'settings': settings.toggle(); break
  }
}

window.addEventListener(
  'keydown',
  (e) => {
    if (!config) return
    const ae = document.activeElement as HTMLElement | null
    if (ae && ae.closest && ae.closest('#settings, #findbar')) return
    const action = matchAction(config.keybindings, e)
    if (action) {
      e.preventDefault()
      e.stopPropagation()
      void runAction(action)
    }
  },
  { capture: true }
)
