# quake-term — Guake-style dropdown terminal for Windows

**Date:** 2026-06-12
**Status:** Approved
**Audience:** Personal daily driver (single user, pragmatic choices, iterate fast)

## Summary

A Guake-like dropdown terminal for Windows: a global hotkey slides a terminal
window down from the top of the screen, over whatever you're doing, and hides
it again. Supports tabs, arbitrarily nested split panes, multiple shells
(PowerShell, WSL, cmd, Git Bash), and live-applied appearance customization.

## Stack

- **Electron** (main process: window/hotkey/tray/PTY management)
- **xterm.js** with the WebGL renderer (terminal rendering, links, search)
- **node-pty** (ConPTY-backed pseudo-terminals for all shells)
- **TypeScript + Vite** for the renderer — no UI framework
- **Vitest** for unit tests

Rationale: this is the stack VS Code's terminal and Hyper use. Everything hard
(VT parsing, GPU text rendering, ConPTY quirks) is already solved. The app is
resident in the tray, so Electron's RAM cost is the only downside and was
accepted. Alternatives considered: Tauri 2 + portable-pty (lighter but more
plumbing, rougher plugin edges), native WinUI/WPF (no reusable terminal
control exists; months of work).

## Architecture

### Main process (Node.js)

| Module | Responsibility |
|---|---|
| `WindowManager` | One frameless, always-on-top, resizable window docked to the top edge. Slide-down/up animation, show/hide/focus state machine, multi-monitor placement (drops on the monitor containing the mouse cursor), hide-on-blur. No taskbar entry. |
| `HotkeyManager` | Registers the global toggle hotkey (default `` Ctrl+` ``, configurable). Re-registers on config change. |
| `PtyManager` | One `node-pty` process per terminal pane. Streams data both ways over IPC; handles resize and process exit notification. |
| `ConfigStore` | Reads/writes `config.json` in `%APPDATA%/quake-term/`. Schema-validated load; pushes live updates to the renderer. |
| Tray | Icon with context menu: show/hide, settings, quit. Auto-launch-at-login registration. |

### Renderer process (TypeScript, no framework)

| Component | Responsibility |
|---|---|
| `TabBar` | Tabs along the top; each tab owns a pane layout. "New tab" button with profile dropdown. |
| `PaneTree` | Each tab is a binary split tree: split horizontal/vertical to any depth, drag borders to resize, closing a pane collapses the tree. Each leaf hosts one xterm.js instance. |
| Terminal pane | xterm.js (WebGL renderer), clickable links, find-in-terminal, clipboard integration, right-click paste. |
| `SettingsUI` | In-window overlay panel for appearance and behavior settings. Live-applied. |

### IPC contract

Small typed message set; renderer never touches Node APIs (contextIsolation
on, preload bridge only):

- `pty:spawn`, `pty:data`, `pty:resize`, `pty:kill`, `pty:exited`
- `config:get`, `config:set`, `config:changed`
- `window:toggle`

### Why a pane tree per tab

Standard model (tmux, iTerm2, Windows Terminal). Handles arbitrary nesting
cleanly and serializes naturally if session restore is added later.

## Features

### Shell profiles

Auto-detected on first run:

- PowerShell 7 (`pwsh.exe`) if installed, else Windows PowerShell
- Each installed WSL distro (via `wsl.exe -l`)
- `cmd.exe`
- Git Bash (standard install paths)

One profile is the default for new tabs/panes. Profiles are editable in
config: name, exe, args, starting directory, icon color.

### Keyboard shortcuts (all configurable)

| Action | Default |
|---|---|
| Toggle terminal (global) | `` Ctrl+` `` |
| New tab | `Ctrl+Shift+T` |
| Close tab/pane | `Ctrl+Shift+W` |
| Next / previous tab | `Ctrl+Tab` / `Ctrl+Shift+Tab` |
| Split right / split down | `Ctrl+Shift+D` / `Ctrl+Shift+E` |
| Move focus between panes | `Alt+Arrow keys` |
| Copy / paste | `Ctrl+Shift+C` / `Ctrl+Shift+V` |
| Find in terminal | `Ctrl+Shift+F` |
| Font size bigger / smaller / reset | `Ctrl+=` / `Ctrl+-` / `Ctrl+0` |
| Settings | `Ctrl+,` |

### Appearance (live-applied, no restart)

- Bundled color schemes (Dracula, One Dark, Solarized Dark/Light, Gruvbox)
  plus custom colors
- Background opacity and optional acrylic blur
- Font family, size, line height
- Window height and width as % of screen (centered horizontally)
- Animation speed, or animation off

### Window behaviors

- Slide-down/up animation on toggle
- Hide on focus loss (toggleable)
- Always on top; no taskbar entry; tray icon with context menu
- Start with Windows (hidden) so the hotkey always works
- Multi-monitor: drops down on the monitor containing the mouse cursor
- Hotkey while visible but unfocused → refocus instead of hide (Guake behavior)

### Out of scope for v1

Session restore, URL preview, per-tab colors, settings sync, auto-update.

## Error handling

- **Shell exits/crashes:** pane shows a dim `[process exited with code N] —
  press Enter to restart`. Closing the last pane of the last tab spawns a
  fresh default one; the window never goes empty.
- **Profile exe missing:** pane shows the spawn error inline with the
  attempted path; profile stays listed but flagged.
- **Hotkey registration fails:** tray balloon notification; toggle still
  available via tray click; hotkey changeable in settings.
- **Corrupt config.json:** backed up to `config.json.bak`, app starts with
  defaults, tray notification. Individual invalid fields fall back to
  defaults rather than rejecting the whole file.

## Config

Single human-editable `config.json` in `%APPDATA%/quake-term/`:
profiles, default profile, keybindings, theme, font, opacity/blur, window
size %, animation, behavior toggles (hide-on-blur, start-with-Windows).

## Testing

- **Unit tests (Vitest):** pane-tree operations (split/close/navigate/resize),
  config validation and merging, keybinding parsing.
- **IPC contract tests:** PtyManager against real ConPTY — spawn cmd, echo,
  resize, kill, exit notification.
- **Manual smoke checklist:** toggle animation, multi-monitor drop, hide on
  blur, tray menu, start-with-Windows.
