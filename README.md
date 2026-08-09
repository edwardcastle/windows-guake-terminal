# quake-term

A Guake/Quake-style drop-down terminal for Windows. A global hotkey (`` Ctrl+` ``)
slides a terminal window down from the top of your screen over whatever you're
doing, and hides it again when you're done.

Developed on Linux, shipped for Windows (NSIS installer, auto-updating).

**Stack:** Electron 42 + xterm.js + node-pty, TypeScript, electron-vite, Vitest.

## Features

- Global hotkey dropdown with hide-on-blur.
- Tabs with rename, per-tab color, and drag-to-reorder.
- Nested split panes (horizontal/vertical).
- Multiple shells auto-detected into a profile picker (see below).
- Live appearance customization: 11 built-in themes, a custom-theme editor,
  theme-aware window chrome, per-profile appearance, and optional background image.
- Session restore: reopens your tabs and pane layout on launch (opt-in).

## Install

Download the latest `quake-term-Setup-<version>.exe` from the
[Releases](https://github.com/edwardcastle/windows-guake-terminal/releases) page
and run it. The app auto-updates on launch and via the tray "Check for updates".

> The installer is not yet code-signed, so Windows SmartScreen may warn about an
> "unknown publisher." Click **More info → Run anyway** to proceed.

## Shells

On Windows, quake-term auto-detects installed shells and lists them in the profile
picker: PowerShell 7, Windows PowerShell, cmd, any installed WSL distros, Git Bash,
and **Zsh (MSYS2)**.

### zsh on Windows

zsh has no native Windows build, but quake-term supports it two ways:

- **WSL (recommended).** Install zsh inside a WSL distro (`sudo apt install zsh`)
  and make it your default shell (`chsh -s $(which zsh)`). quake-term auto-detects
  your WSL distros, so launching that profile drops you straight into zsh — a real
  Linux zsh with full plugin/theme support (oh-my-zsh, etc.). Don't have WSL yet?
  See [Installing WSL](#installing-wsl) below.
- **MSYS2.** Install [MSYS2](https://www.msys2.org/) and its zsh package
  (`pacman -S zsh`). quake-term detects `zsh.exe` under `C:\msys64` (or `C:\msys32`)
  and adds a **Zsh (MSYS2)** profile automatically.

#### Installing WSL

If you don't already have WSL, install it once from an **Administrator** PowerShell
or Command Prompt (Windows 10 version 2004+ or Windows 11):

```powershell
wsl --install
```

This enables WSL and installs Ubuntu by default. **Reboot** when prompted, then
launch **Ubuntu** from the Start menu and create your Linux username/password when
it first opens. Once that's done, install and default to zsh:

```sh
sudo apt update && sudo apt install -y zsh
chsh -s $(which zsh)          # make zsh your default shell
```

Restart quake-term and pick the **WSL: Ubuntu** profile (see the note below about
re-detecting profiles on existing installs). To install a different distro instead
of Ubuntu, run `wsl --list --online` to see options, then
`wsl --install -d <Distro>`.

> **Existing installs:** shell profiles are detected once, on first launch, and
> then saved to your config. If you already ran quake-term before installing a new
> shell (or before updating to a build that adds Zsh), the new profile won't appear
> until profiles are re-detected — reset them from the Settings UI, or close the app
> and delete the `profiles` array in `config.json` (see below).

## Configuration

Config lives at `%AppData%\quake-term\config.json` (Windows). The **running app
owns this file** — it rewrites the whole file from memory on any settings change,
so edit settings in the in-app Settings UI, or only hand-edit `config.json` while
the app is closed.

## Development

```sh
npm install                       # installs deps + rebuilds node-pty for Electron
npm run dev                       # electron-vite dev
npm test                          # vitest (only pure modules under src/shared/)
npx tsc --noEmit -p tsconfig.json # typecheck
npm run build                     # electron-vite production build
npm run dist                      # build the Windows installer (electron-builder)
```

> Shell auto-detection is Windows-only. On Linux/macOS (dev/preview) the app falls
> back to your `$SHELL`, so the Windows profiles above won't appear in the dev env.

## Support

If quake-term is useful to you, you can buy me a coffee on
[Ko-fi](https://ko-fi.com/edwardcastle) or sponsor via
[GitHub Sponsors](https://github.com/sponsors/edwardcastle).
