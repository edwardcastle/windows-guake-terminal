# quake-term — Continue Here

A handoff doc to resume building this project on another machine. Follow the
phases in order. Everything you need to actually write the code lives in the two
documents listed below — this file is the setup + process wrapper around them.

---

## What this project is

A **Guake-style dropdown terminal for Windows**: a global hotkey (`` Ctrl+` ``)
slides a terminal window down from the top of the screen over whatever you're
doing, and hides it again. Tabs, nested split panes, multiple shells
(PowerShell, WSL, cmd, Git Bash), and live appearance customization.

**Stack:** Electron + xterm.js + node-pty, TypeScript, electron-vite, Vitest.

**Repo:** https://github.com/edwardcastle/windows-guake-terminal.git

---

## Current status

- [x] Brainstorming complete (requirements nailed down)
- [x] Design spec written
- [x] Implementation plan written — **complete code for every file**, 14 tasks
- [ ] **Code not started yet** ← you resume here
- [ ] Not yet pushed to GitHub

So the next real work is: get these two docs onto the other laptop, then execute
the plan task by task.

---

## The two documents that contain everything

| File | What it is |
|---|---|
| `docs/superpowers/specs/2026-06-12-quake-term-design.md` | The design: architecture, features, error handling, testing strategy. |
| `docs/superpowers/plans/2026-06-12-quake-term.md` | The build plan: 14 tasks, **every file's full source code**, exact commands, expected output. This is the thing you (or Claude) execute. |

The plan is self-contained — if you can get it to the other laptop, you can
rebuild the whole app from it even with no other context.

---

## ── PHASE 0: Publish current work (run on THIS laptop) ──

This pushes the spec + plan to GitHub so the other laptop can just clone them.

```powershell
cd C:\Users\dacomat\workspace\terminal

git init
git branch -M main
git remote add origin https://github.com/edwardcastle/windows-guake-terminal.git

# A .gitignore so node_modules / build output never get committed
@"
node_modules/
out/
dist/
*.log
.DS_Store
"@ | Out-File -Encoding utf8 .gitignore

git add .gitignore docs CONTINUE.md
git commit -m "Add design spec, implementation plan, and handoff doc"

# If the remote is empty, this just works. If it already has commits,
# pull first:  git pull origin main --rebase
git push -u origin main
```

> If `git push` is rejected because the remote already has content, run
> `git pull origin main --rebase` then `git push` again.

---

## ── PHASE 1: Set up the other laptop ──

### 1a. Install prerequisites

node-pty is a **native module** — it gets compiled during `npm install`, so you
need a C++ toolchain and Python in addition to Node. Run in an **Administrator**
PowerShell:

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
winget install Python.Python.3.12
winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Close and reopen PowerShell, then verify:

```powershell
node -v      # v20+ expected
npm -v
git --version
python --version
```

> The VS Build Tools step is the one that bites people. If `npm install` later
> fails while building node-pty, it's almost always a missing **"Desktop
> development with C++"** workload or missing Python — re-run that winget line.

### 1b. Get the code

```powershell
cd C:\Users\<you>\workspace      # wherever you keep projects
git clone https://github.com/edwardcastle/windows-guake-terminal.git
cd windows-guake-terminal
```

You now have the spec + plan locally. Nothing is built yet.

---

## ── PHASE 2: Build it ──

Pick one of these.

### Option A — Let Claude Code execute the plan (recommended)

1. Open the cloned folder in Claude Code.
2. Tell it:

   > Execute the implementation plan at
   > `docs/superpowers/plans/2026-06-12-quake-term.md` task by task using TDD.
   > Use git. **Commit messages must not contain any Claude references**
   > (no "Co-Authored-By: Claude", no "Generated with Claude Code"). Commit
   > after each task with a plain conventional-commit message.

3. It will work through Tasks 1–14. The pure-logic tasks (2–7) have real unit
   tests it can run and verify. The GUI tasks (8–14) need you to eyeball the
   running app — it'll tell you what to look for.

### Option B — Do it yourself

Open the plan and work top to bottom. Each task gives you exact file paths,
complete code, and the command + expected output to verify. The rhythm per task:

1. Create the test file (code is in the plan).
2. `npx vitest run tests/<file>` → watch it fail.
3. Create the implementation file (code is in the plan).
4. `npx vitest run tests/<file>` → watch it pass.
5. Commit.

Key commands you'll use:

```powershell
npm install        # Task 1 — also triggers the node-pty native rebuild
npm test           # run all Vitest unit tests
npm run dev        # launch the app in dev mode (Tasks 8+)
npm run dist       # build the Windows installer (Task 14)
```

---

## Commit message rule (important)

**No Claude references in any commit message.** Plain, conventional-style
messages only. Suggested messages per task:

```
chore: scaffold electron + vite + typescript project       (Task 1)
feat: config types, defaults, and validation               (Task 2)
feat: config store with corrupt-file recovery              (Task 3)
feat: pane split-tree logic                                (Task 4)
feat: keybinding parsing and matching                      (Task 5)
feat: shell profile auto-detection                         (Task 6)
feat: pty manager with injectable spawn                    (Task 7)
feat: ipc bridge and a single working terminal             (Task 8)
feat: tabs                                                 (Task 9)
feat: split panes, focus navigation, keybindings           (Task 10)
feat: dropdown window, global hotkey, tray, autostart      (Task 11)
feat: find-in-terminal bar                                 (Task 12)
feat: settings ui with live appearance apply               (Task 13)
build: windows installer packaging                         (Task 14)
```

---

## Verification notes / gotchas

- **node-pty can't load inside Vitest.** It's rebuilt for Electron's ABI, so
  plain-Node tests can't `require` it. That's why `PtyManager` takes an injected
  spawn function and is tested with a fake (Task 7). Real shell behavior is
  verified by hand in Task 8.
- **GUI tasks need manual eyeballing.** Tasks 8–14 produce visual behavior
  (animation, multi-monitor drop, splits, settings). There are no automated
  tests for those — each task lists exactly what to click and what you should
  see.
- **WSL detection** decodes UTF-16LE output from `wsl.exe -l -q` — don't
  "simplify" that to a plain `toString()` or distro names come out garbled.
- **First `npm run dev`** opens a real shell prompt; type `dir`, resize, and
  `exit` to confirm the restart-on-Enter behavior.
- **Quit from the tray**, not by closing the window — closing only hides it
  (that's the Guake behavior). Check Task Manager for orphan shells after Quit.

---

## Quick reference: the 14 tasks

| # | Builds | Verify |
|---|---|---|
| 1 | Project scaffold | `npm run dev` shows a window |
| 2 | Config types + validation | `npm test` (5) |
| 3 | Config store + recovery | `npm test` (4) |
| 4 | Pane split-tree logic | `npm test` (9) |
| 5 | Keybinding parse/match | `npm test` (6) |
| 6 | Shell profile detection | `npm test` (2) |
| 7 | PtyManager (fake spawn) | `npm test` (4) |
| 8 | IPC + one live terminal | type in a real shell |
| 9 | Tabs | new/switch/close tabs |
| 10 | Split panes + nav + keys | split, drag, Alt+arrow |
| 11 | Dropdown window + hotkey + tray | `` Ctrl+` `` from anywhere |
| 12 | Find bar | `Ctrl+Shift+F` |
| 13 | Settings UI + live apply | `Ctrl+,`, change theme |
| 14 | Installer packaging | `npm run dist` |

That's the whole picture. Start at Phase 0 here, then Phase 1 + 2 on the other
machine.
