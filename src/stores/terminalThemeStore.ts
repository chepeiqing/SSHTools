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
  catppuccin: {
    name: 'Catppuccin',
    background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc', cursorAccent: '#1e1e2e',
    selection: 'rgba(88, 91, 112, 0.4)',
    black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
    blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
    brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1', brightYellow: '#f9e2af',
    brightBlue: '#89b4fa', brightMagenta: '#f5c2e7', brightCyan: '#94e2d5', brightWhite: '#a6adc8',
  },
  'gruvbox-dark': {
    name: 'Gruvbox',
    background: '#282828', foreground: '#ebdbb2', cursor: '#ebdbb2', cursorAccent: '#282828',
    selection: 'rgba(146, 131, 116, 0.3)',
    black: '#282828', red: '#cc241d', green: '#98971a', yellow: '#d79921',
    blue: '#458588', magenta: '#b16286', cyan: '#689d6a', white: '#a89984',
    brightBlack: '#928374', brightRed: '#fb4934', brightGreen: '#b8bb26', brightYellow: '#fabd2f',
    brightBlue: '#83a598', brightMagenta: '#d3869b', brightCyan: '#8ec07c', brightWhite: '#ebdbb2',
  },
  'solarized-dark': {
    name: 'Solarized',
    background: '#002b36', foreground: '#839496', cursor: '#839496', cursorAccent: '#002b36',
    selection: 'rgba(131, 148, 150, 0.2)',
    black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
    blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#002b36', brightRed: '#cb4b16', brightGreen: '#586e75', brightYellow: '#657b83',
    brightBlue: '#839496', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
  },
  'night-owl': {
    name: 'Night Owl',
    background: '#011627', foreground: '#d6deeb', cursor: '#80a4c2', cursorAccent: '#011627',
    selection: 'rgba(29, 59, 83, 0.6)',
    black: '#011627', red: '#ef5350', green: '#22da6e', yellow: '#addb67',
    blue: '#82aaff', magenta: '#c792ea', cyan: '#21c7a8', white: '#d6deeb',
    brightBlack: '#575656', brightRed: '#ef5350', brightGreen: '#22da6e', brightYellow: '#ffeb95',
    brightBlue: '#82aaff', brightMagenta: '#c792ea', brightCyan: '#7fdbca', brightWhite: '#ffffff',
  },
  kanagawa: {
    name: 'Kanagawa',
    background: '#1f1f28', foreground: '#dcd7ba', cursor: '#c8c093', cursorAccent: '#1f1f28',
    selection: 'rgba(35, 53, 73, 0.5)',
    black: '#090618', red: '#c34043', green: '#76946a', yellow: '#c0a36e',
    blue: '#7e9cd8', magenta: '#957fb8', cyan: '#6a9589', white: '#c8c093',
    brightBlack: '#727169', brightRed: '#e82424', brightGreen: '#98bb6c', brightYellow: '#e6c384',
    brightBlue: '#7fb4ca', brightMagenta: '#d27e99', brightCyan: '#7aa89f', brightWhite: '#dcd7ba',
  },
  everforest: {
    name: 'Everforest',
    background: '#2d353b', foreground: '#d3c6aa', cursor: '#d3c6aa', cursorAccent: '#2d353b',
    selection: 'rgba(163, 190, 140, 0.2)',
    black: '#343f44', red: '#e67e80', green: '#a7c080', yellow: '#dbbc7f',
    blue: '#7fbbb3', magenta: '#d699b6', cyan: '#83c092', white: '#d3c6aa',
    brightBlack: '#859289', brightRed: '#e67e80', brightGreen: '#a7c080', brightYellow: '#dbbc7f',
    brightBlue: '#7fbbb3', brightMagenta: '#d699b6', brightCyan: '#83c092', brightWhite: '#d3c6aa',
  },
  'ayu-dark': {
    name: 'Ayu',
    background: '#0b0e14', foreground: '#bfbdb6', cursor: '#e6b450', cursorAccent: '#0b0e14',
    selection: 'rgba(230, 180, 80, 0.15)',
    black: '#01060e', red: '#ea6c73', green: '#7fd962', yellow: '#f9af4f',
    blue: '#53bdfa', magenta: '#d2a6ff', cyan: '#95e6cb', white: '#bfbdb6',
    brightBlack: '#565b66', brightRed: '#f07178', brightGreen: '#aad94c', brightYellow: '#e6b450',
    brightBlue: '#59c2ff', brightMagenta: '#d2a6ff', brightCyan: '#95e6cb', brightWhite: '#f8f8f2',
  },
  'rose-pine': {
    name: 'Rosé Pine',
    background: '#232136', foreground: '#e0def4', cursor: '#56526e', cursorAccent: '#232136',
    selection: 'rgba(110, 106, 134, 0.3)',
    black: '#393552', red: '#eb6f92', green: '#3e8fb0', yellow: '#f6c177',
    blue: '#9ccfd8', magenta: '#c4a7e7', cyan: '#ea9a97', white: '#e0def4',
    brightBlack: '#6e6a86', brightRed: '#eb6f92', brightGreen: '#3e8fb0', brightYellow: '#f6c177',
    brightBlue: '#9ccfd8', brightMagenta: '#c4a7e7', brightCyan: '#ea9a97', brightWhite: '#e0def4',
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
  'catppuccin-latte': {
    name: 'Catppuccin',
    background: '#eff1f5', foreground: '#4c4f69', cursor: '#dc8a78', cursorAccent: '#eff1f5',
    selection: 'rgba(140, 143, 161, 0.2)',
    black: '#5c5f77', red: '#d20f39', green: '#40a02b', yellow: '#df8e1d',
    blue: '#1e66f5', magenta: '#8839ef', cyan: '#179299', white: '#acb0be',
    brightBlack: '#6c6f85', brightRed: '#d20f39', brightGreen: '#40a02b', brightYellow: '#df8e1d',
    brightBlue: '#1e66f5', brightMagenta: '#8839ef', brightCyan: '#179299', brightWhite: '#bcc0cc',
  },
  'gruvbox-light': {
    name: 'Gruvbox',
    background: '#fbf1c7', foreground: '#3c3836', cursor: '#3c3836', cursorAccent: '#fbf1c7',
    selection: 'rgba(60, 56, 54, 0.15)',
    black: '#3c3836', red: '#cc241d', green: '#98971a', yellow: '#d79921',
    blue: '#458588', magenta: '#b16286', cyan: '#689d6a', white: '#7c6f64',
    brightBlack: '#928374', brightRed: '#9d0006', brightGreen: '#79740e', brightYellow: '#b57614',
    brightBlue: '#076678', brightMagenta: '#8f3f71', brightCyan: '#427b58', brightWhite: '#3c3836',
  },
  'rose-pine-dawn': {
    name: 'Rosé Pine',
    background: '#faf4ed', foreground: '#575279', cursor: '#9893a5', cursorAccent: '#faf4ed',
    selection: 'rgba(87, 82, 121, 0.12)',
    black: '#575279', red: '#b4637a', green: '#286983', yellow: '#ea9d34',
    blue: '#56949f', magenta: '#907aa9', cyan: '#d7827e', white: '#9893a5',
    brightBlack: '#797593', brightRed: '#b4637a', brightGreen: '#286983', brightYellow: '#ea9d34',
    brightBlue: '#56949f', brightMagenta: '#907aa9', brightCyan: '#d7827e', brightWhite: '#575279',
  },
  'everforest-light': {
    name: 'Everforest',
    background: '#fdf6e3', foreground: '#5c6a72', cursor: '#5c6a72', cursorAccent: '#fdf6e3',
    selection: 'rgba(92, 106, 114, 0.15)',
    black: '#5c6a72', red: '#f85552', green: '#8da101', yellow: '#dfa000',
    blue: '#3a94c5', magenta: '#df69ba', cyan: '#35a77c', white: '#a6b0a0',
    brightBlack: '#939f91', brightRed: '#f85552', brightGreen: '#8da101', brightYellow: '#dfa000',
    brightBlue: '#3a94c5', brightMagenta: '#df69ba', brightCyan: '#35a77c', brightWhite: '#5c6a72',
  },
  'nord-light': {
    name: 'Nord',
    background: '#eceff4', foreground: '#2e3440', cursor: '#2e3440', cursorAccent: '#eceff4',
    selection: 'rgba(46, 52, 64, 0.12)',
    black: '#2e3440', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b',
    blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#d8dee9',
    brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c', brightYellow: '#ebcb8b',
    brightBlue: '#81a1c1', brightMagenta: '#b48ead', brightCyan: '#8fbcbb', brightWhite: '#2e3440',
  },
  'ayu-light': {
    name: 'Ayu',
    background: '#fafafa', foreground: '#575f66', cursor: '#ff6a00', cursorAccent: '#fafafa',
    selection: 'rgba(3, 169, 244, 0.12)',
    black: '#575f66', red: '#f07171', green: '#86b300', yellow: '#f2ae49',
    blue: '#399ee6', magenta: '#a37acc', cyan: '#4cbf99', white: '#abb0b6',
    brightBlack: '#828c99', brightRed: '#f07171', brightGreen: '#86b300', brightYellow: '#f2ae49',
    brightBlue: '#399ee6', brightMagenta: '#a37acc', brightCyan: '#4cbf99', brightWhite: '#575f66',
  },
  'tokyo-night-light': {
    name: 'Tokyo Night',
    background: '#d5d6db', foreground: '#343b58', cursor: '#3760bf', cursorAccent: '#d5d6db',
    selection: 'rgba(55, 96, 191, 0.15)',
    black: '#0f0f14', red: '#8c4351', green: '#485e30', yellow: '#8f5e15',
    blue: '#34548a', magenta: '#5a4a78', cyan: '#0f4b6e', white: '#343b58',
    brightBlack: '#9699a3', brightRed: '#f52a65', brightGreen: '#587539', brightYellow: '#8c6c3e',
    brightBlue: '#2e7de9', brightMagenta: '#9854f1', brightCyan: '#007197', brightWhite: '#343b58',
  },
  'night-owl-light': {
    name: 'Night Owl',
    background: '#fbfbfb', foreground: '#403f53', cursor: '#90a4ae', cursorAccent: '#fbfbfb',
    selection: 'rgba(64, 63, 83, 0.1)',
    black: '#403f53', red: '#de3d3b', green: '#08916a', yellow: '#daaa01',
    blue: '#288ed7', magenta: '#d6438a', cyan: '#2aa298', white: '#90a4ae',
    brightBlack: '#7a7a7a', brightRed: '#de3d3b', brightGreen: '#08916a', brightYellow: '#daaa01',
    brightBlue: '#288ed7', brightMagenta: '#d6438a', brightCyan: '#2aa298', brightWhite: '#403f53',
  },
  'kanagawa-lotus': {
    name: 'Kanagawa',
    background: '#f2ecbc', foreground: '#545464', cursor: '#43436c', cursorAccent: '#f2ecbc',
    selection: 'rgba(67, 67, 108, 0.15)',
    black: '#1f1f28', red: '#c84053', green: '#6f894e', yellow: '#77713f',
    blue: '#4d699b', magenta: '#b35b79', cyan: '#597b75', white: '#545464',
    brightBlack: '#8a8980', brightRed: '#d7474b', brightGreen: '#6e915f', brightYellow: '#836f4a',
    brightBlue: '#6693bf', brightMagenta: '#624c83', brightCyan: '#5e857a', brightWhite: '#43436c',
  },
  'material-light': {
    name: 'Material',
    background: '#fafafa', foreground: '#546e7a', cursor: '#272727', cursorAccent: '#fafafa',
    selection: 'rgba(84, 110, 122, 0.12)',
    black: '#546e7a', red: '#ff5370', green: '#91b859', yellow: '#ffb62c',
    blue: '#6182b8', magenta: '#7c4dff', cyan: '#39adb5', white: '#aabfc5',
    brightBlack: '#8796b0', brightRed: '#ff5370', brightGreen: '#91b859', brightYellow: '#ffb62c',
    brightBlue: '#6182b8', brightMagenta: '#7c4dff', brightCyan: '#39adb5', brightWhite: '#546e7a',
  },
}

// ==================== Store ====================

interface TerminalThemeState {
  darkPresetId: string
  lightPresetId: string
  customDark: { foreground: string; background: string; cursor: string }
  customLight: { foreground: string; background: string; cursor: string }
  fontSize: number
  fontFamily: string
  wordWrap: boolean
  scrollOnOutput: boolean
  setPreset: (mode: 'dark' | 'light', id: string) => void
  setCustomColor: (mode: 'dark' | 'light', key: 'foreground' | 'background' | 'cursor', value: string) => void
  setFontSize: (size: number) => void
  setFontFamily: (family: string) => void
  setWordWrap: (value: boolean) => void
  setScrollOnOutput: (value: boolean) => void
}

export const useTerminalThemeStore = create<TerminalThemeState>()(
  persist(
    (set) => ({
      darkPresetId: 'default',
      lightPresetId: 'default',
      customDark: { foreground: '#cccccc', background: '#1e1e1e', cursor: '#007aff' },
      customLight: { foreground: '#1e1e1e', background: '#ffffff', cursor: '#007aff' },
      fontSize: 14,
      fontFamily: '"JetBrains Mono Variable", Consolas, monospace',
      wordWrap: true,
      scrollOnOutput: true,
      setPreset: (mode, id) => set(mode === 'dark' ? { darkPresetId: id } : { lightPresetId: id }),
      setCustomColor: (mode, key, value) => set((state) => {
        if (mode === 'dark') {
          return { customDark: { ...state.customDark, [key]: value } }
        }
        return { customLight: { ...state.customLight, [key]: value } }
      }),
      setFontSize: (size) => set({ fontSize: Math.max(8, Math.min(32, size)) }),
      setFontFamily: (family) => set({ fontFamily: family }),
      setWordWrap: (value) => set({ wordWrap: value }),
      setScrollOnOutput: (value) => set({ scrollOnOutput: value }),
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
