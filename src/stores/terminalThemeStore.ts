import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface TerminalColorScheme {
  name: string
  foreground: string
  background: string
  cursor: string
  cursorAccent: string
  selection: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

// ==================== 深色预设 ====================

export const darkPresets: Record<string, TerminalColorScheme> = {
  default: {
    name: '默认',
    background: '#1e1e1e', foreground: '#cccccc', cursor: '#007aff', cursorAccent: '#1e1e1e',
    selection: 'rgba(0, 122, 255, 0.3)',
    black: '#000000', red: '#ff453a', green: '#32d74b', yellow: '#ff9f0a',
    blue: '#0a84ff', magenta: '#bf5af2', cyan: '#64d2ff', white: '#d4d4d4',
    brightBlack: '#636366', brightRed: '#ff453a', brightGreen: '#32d74b', brightYellow: '#ffd60a',
    brightBlue: '#0a84ff', brightMagenta: '#bf5af2', brightCyan: '#64d2ff', brightWhite: '#e5e5e5',
  },
  dracula: {
    name: 'Dracula',
    background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', cursorAccent: '#282a36',
    selection: 'rgba(68, 71, 90, 0.5)',
    black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
    blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
    brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94', brightYellow: '#ffffa5',
    brightBlue: '#d6acff', brightMagenta: '#ff92df', brightCyan: '#a4ffff', brightWhite: '#ffffff',
  },
  'one-dark': {
    name: 'One Dark',
    background: '#282c34', foreground: '#abb2bf', cursor: '#528bff', cursorAccent: '#282c34',
    selection: 'rgba(82, 139, 255, 0.2)',
    black: '#282c34', red: '#e06c75', green: '#98c379', yellow: '#e5c07b',
    blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
    brightBlack: '#5c6370', brightRed: '#e06c75', brightGreen: '#98c379', brightYellow: '#e5c07b',
    brightBlue: '#61afef', brightMagenta: '#c678dd', brightCyan: '#56b6c2', brightWhite: '#ffffff',
  },
  monokai: {
    name: 'Monokai',
    background: '#272822', foreground: '#f8f8f2', cursor: '#f8f8f0', cursorAccent: '#272822',
    selection: 'rgba(73, 72, 62, 0.5)',
    black: '#272822', red: '#f92672', green: '#a6e22e', yellow: '#f4bf75',
    blue: '#66d9ef', magenta: '#ae81ff', cyan: '#a1efe4', white: '#f8f8f2',
    brightBlack: '#75715e', brightRed: '#f92672', brightGreen: '#a6e22e', brightYellow: '#f4bf75',
    brightBlue: '#66d9ef', brightMagenta: '#ae81ff', brightCyan: '#a1efe4', brightWhite: '#f9f8f5',
  },
  nord: {
    name: 'Nord',
    background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9', cursorAccent: '#2e3440',
    selection: 'rgba(136, 192, 208, 0.2)',
    black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b',
    blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
    brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c', brightYellow: '#ebcb8b',
    brightBlue: '#81a1c1', brightMagenta: '#b48ead', brightCyan: '#8fbcbb', brightWhite: '#eceff4',
  },
  'tokyo-night': {
    name: 'Tokyo Night',
    background: '#1a1b26', foreground: '#a9b1d6', cursor: '#c0caf5', cursorAccent: '#1a1b26',
    selection: 'rgba(40, 52, 100, 0.5)',
    black: '#15161e', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68',
    blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
    brightBlack: '#414868', brightRed: '#f7768e', brightGreen: '#9ece6a', brightYellow: '#e0af68',
    brightBlue: '#7aa2f7', brightMagenta: '#bb9af7', brightCyan: '#7dcfff', brightWhite: '#c0caf5',
  },
}

// ==================== 浅色预设 ====================

export const lightPresets: Record<string, TerminalColorScheme> = {
  default: {
    name: '默认',
    background: '#ffffff', foreground: '#1e1e1e', cursor: '#007aff', cursorAccent: '#ffffff',
    selection: 'rgba(0, 122, 255, 0.2)',
    black: '#000000', red: '#ff3b30', green: '#34c759', yellow: '#ff9500',
    blue: '#007aff', magenta: '#af52de', cyan: '#5ac8fa', white: '#8e8e93',
    brightBlack: '#48484a', brightRed: '#ff3b30', brightGreen: '#34c759', brightYellow: '#ffcc00',
    brightBlue: '#007aff', brightMagenta: '#af52de', brightCyan: '#5ac8fa', brightWhite: '#ffffff',
  },
  'solarized-light': {
    name: 'Solarized',
    background: '#fdf6e3', foreground: '#657b83', cursor: '#657b83', cursorAccent: '#fdf6e3',
    selection: 'rgba(7, 54, 66, 0.1)',
    black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
    blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#002b36', brightRed: '#cb4b16', brightGreen: '#586e75', brightYellow: '#657b83',
    brightBlue: '#839496', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
  },
  'github-light': {
    name: 'GitHub',
    background: '#ffffff', foreground: '#24292e', cursor: '#044289', cursorAccent: '#ffffff',
    selection: 'rgba(4, 66, 137, 0.1)',
    black: '#24292e', red: '#d73a49', green: '#22863a', yellow: '#b08800',
    blue: '#0366d6', magenta: '#6f42c1', cyan: '#1b7c83', white: '#6a737d',
    brightBlack: '#959da5', brightRed: '#cb2431', brightGreen: '#28a745', brightYellow: '#dbab09',
    brightBlue: '#2188ff', brightMagenta: '#8a63d2', brightCyan: '#3192aa', brightWhite: '#d1d5da',
  },
  'one-light': {
    name: 'One Light',
    background: '#fafafa', foreground: '#383a42', cursor: '#526fff', cursorAccent: '#fafafa',
    selection: 'rgba(82, 111, 255, 0.15)',
    black: '#383a42', red: '#e45649', green: '#50a14f', yellow: '#c18401',
    blue: '#4078f2', magenta: '#a626a4', cyan: '#0184bc', white: '#a0a1a7',
    brightBlack: '#4f525e', brightRed: '#e06c75', brightGreen: '#98c379', brightYellow: '#e5c07b',
    brightBlue: '#61afef', brightMagenta: '#c678dd', brightCyan: '#56b6c2', brightWhite: '#ffffff',
  },
}

// ==================== Store ====================

interface TerminalThemeState {
  darkPresetId: string
  lightPresetId: string
  customDark: { foreground: string; background: string; cursor: string }
  customLight: { foreground: string; background: string; cursor: string }
  setPreset: (mode: 'dark' | 'light', id: string) => void
  setCustomColor: (mode: 'dark' | 'light', key: 'foreground' | 'background' | 'cursor', value: string) => void
}

export const useTerminalThemeStore = create<TerminalThemeState>()(
  persist(
    (set) => ({
      darkPresetId: 'default',
      lightPresetId: 'default',
      customDark: { foreground: '#cccccc', background: '#1e1e1e', cursor: '#007aff' },
      customLight: { foreground: '#1e1e1e', background: '#ffffff', cursor: '#007aff' },
      setPreset: (mode, id) => set(mode === 'dark' ? { darkPresetId: id } : { lightPresetId: id }),
      setCustomColor: (mode, key, value) => set((state) => {
        if (mode === 'dark') {
          return { customDark: { ...state.customDark, [key]: value } }
        }
        return { customLight: { ...state.customLight, [key]: value } }
      }),
    }),
    { name: 'ssh-tools-terminal-theme' }
  )
)

// 根据当前模式和 store 状态，返回 xterm 使用的完整配色
export function getTerminalColorScheme(
  actualTheme: 'light' | 'dark',
  state: TerminalThemeState
): TerminalColorScheme {
  const presetId = actualTheme === 'dark' ? state.darkPresetId : state.lightPresetId
  const presets = actualTheme === 'dark' ? darkPresets : lightPresets

  if (presetId === 'custom') {
    const custom = actualTheme === 'dark' ? state.customDark : state.customLight
    const base = presets.default
    return {
      ...base,
      foreground: custom.foreground,
      background: custom.background,
      cursor: custom.cursor,
      cursorAccent: custom.background,
    }
  }

  return presets[presetId] || presets.default
}
