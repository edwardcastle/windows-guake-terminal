import type { ITheme } from '@xterm/xterm'

export const THEMES: Record<string, ITheme> = {
  dracula: {
    background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2',
    selectionBackground: '#44475a',
    black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
    blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
    brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94',
    brightYellow: '#ffffa5', brightBlue: '#d6acff', brightMagenta: '#ff92df',
    brightCyan: '#a4ffff', brightWhite: '#ffffff'
  },
  'one-dark': {
    background: '#282c34', foreground: '#abb2bf', cursor: '#528bff',
    selectionBackground: '#3e4451',
    black: '#1e2127', red: '#e06c75', green: '#98c379', yellow: '#e5c07b',
    blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
    brightBlack: '#5c6370', brightRed: '#e06c75', brightGreen: '#98c379',
    brightYellow: '#e5c07b', brightBlue: '#61afef', brightMagenta: '#c678dd',
    brightCyan: '#56b6c2', brightWhite: '#ffffff'
  },
  'solarized-dark': {
    background: '#002b36', foreground: '#839496', cursor: '#93a1a1',
    selectionBackground: '#073642',
    black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
    blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#586e75', brightRed: '#cb4b16', brightGreen: '#859900',
    brightYellow: '#b58900', brightBlue: '#268bd2', brightMagenta: '#6c71c4',
    brightCyan: '#2aa198', brightWhite: '#fdf6e3'
  },
  'solarized-light': {
    background: '#fdf6e3', foreground: '#657b83', cursor: '#586e75',
    selectionBackground: '#eee8d5',
    black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
    blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#586e75', brightRed: '#cb4b16', brightGreen: '#859900',
    brightYellow: '#b58900', brightBlue: '#268bd2', brightMagenta: '#6c71c4',
    brightCyan: '#2aa198', brightWhite: '#fdf6e3'
  },
  'gruvbox-dark': {
    background: '#282828', foreground: '#ebdbb2', cursor: '#ebdbb2',
    selectionBackground: '#504945',
    black: '#282828', red: '#cc241d', green: '#98971a', yellow: '#d79921',
    blue: '#458588', magenta: '#b16286', cyan: '#689d6a', white: '#a89984',
    brightBlack: '#928374', brightRed: '#fb4934', brightGreen: '#b8bb26',
    brightYellow: '#fabd2f', brightBlue: '#83a598', brightMagenta: '#d3869b',
    brightCyan: '#8ec07c', brightWhite: '#ebdbb2'
  }
}

export function themeOf(name: string): ITheme {
  return THEMES[name] ?? THEMES.dracula
}
