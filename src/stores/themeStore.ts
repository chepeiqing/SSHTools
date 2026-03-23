import { create } from 'zustand'
import { theme as antdTheme } from 'antd'

// 引入 Electron 类型
import '../types'

type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeState {
  mode: ThemeMode
  actualTheme: 'light' | 'dark'
  setMode: (mode: ThemeMode) => void
  initTheme: () => void
}

// 主题token配置
const lightToken = {
  colorPrimary: '#1677ff',
  colorBgContainer: '#ffffff',
  colorBgElevated: '#ffffff',
  colorBgLayout: '#f5f5f5',
  colorText: '#1f1f1f',
  colorTextSecondary: '#666666',
  colorBorder: '#d9d9d9',
}

const darkToken = {
  colorPrimary: '#1677ff',
  colorBgContainer: '#1e1e1e',
  colorBgElevated: '#252526',
  colorBgLayout: '#0e0e0e',
  colorText: '#e0e0e0',
  colorTextSecondary: '#a0a0a0',
  colorBorder: '#3c3c3c',
}

// 获取当前主题配置
export const getAntdTheme = (actualTheme: 'light' | 'dark') => {
  return actualTheme === 'dark' ? darkToken : lightToken
}

// 获取算法配置
export const getAlgorithm = (actualTheme: 'light' | 'dark') => {
  return actualTheme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'system',
  actualTheme: 'light',

  setMode: async (mode: ThemeMode) => {
    set({ mode })
    await window.electronAPI?.setTheme(mode)

    // 计算实际主题
    let actual: 'light' | 'dark' = 'light'
    if (mode === 'system') {
      actual = await window.electronAPI?.getSystemTheme() || 'light'
    } else {
      actual = mode
    }
    set({ actualTheme: actual })
  },

  initTheme: async () => {
    const savedMode = await window.electronAPI?.getTheme() || 'system'
    let actual: 'light' | 'dark' = 'light'

    if (savedMode === 'system') {
      actual = await window.electronAPI?.getSystemTheme() || 'light'
    } else {
      actual = savedMode
    }

    set({ mode: savedMode, actualTheme: actual })

    // 监听系统主题变化
    window.electronAPI?.onSystemThemeChanged((theme) => {
      if (get().mode === 'system') {
        set({ actualTheme: theme })
      }
    })

    // 监听其他窗口的主题变更
    window.electronAPI?.onSettingsSync((payload) => {
      if (payload.type === 'theme') {
        const { mode } = (payload.data as { mode: ThemeMode })
        set({ mode })
        if (mode === 'system') {
          window.electronAPI?.getSystemTheme().then((actual) => {
            set({ actualTheme: actual || 'light' })
          })
        } else {
          set({ actualTheme: mode })
        }
      }
    })
  },
}))

// 带有 antd 配置的 hook
export const useThemeStoreWithAntd = () => {
  const state = useThemeStore()
  return {
    ...state,
    antdTheme: getAntdTheme(state.actualTheme),
    algorithm: getAlgorithm(state.actualTheme),
  }
}