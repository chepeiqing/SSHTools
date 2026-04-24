import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface TerminalHistoryState {
  // 每个服务器的历史命令 (serverId -> commands[])
  histories: Record<string, string[]>
  // 每个服务器最多保存的命令数
  maxHistoryPerServer: number

  // 添加命令到历史
  addCommand: (serverId: string, command: string) => void
  // 获取某个服务器的历史命令
  getHistory: (serverId: string) => string[]
  // 删除单条命令
  deleteCommand: (serverId: string, command: string) => void
  // 清空某个服务器的历史
  clearHistory: (serverId: string) => void
  // 清空所有历史
  clearAll: () => void
}

export const useTerminalHistoryStore = create<TerminalHistoryState>()(
  persist(
    (set, get) => ({
      histories: {},
      maxHistoryPerServer: 200,

      addCommand: (serverId, command) => {
        const trimmed = command.trim()
        if (!trimmed || !serverId) return

        set(state => {
          const existing = state.histories[serverId] || []
          // 去重：如果最后一条命令相同，不重复添加
          if (existing.length > 0 && existing[0] === trimmed) {
            return state
          }
          // 新命令放在最前面，限制数量
          const updated = [trimmed, ...existing].slice(0, state.maxHistoryPerServer)
          return {
            histories: {
              ...state.histories,
              [serverId]: updated,
            },
          }
        })
      },

      getHistory: (serverId) => {
        return get().histories[serverId] || []
      },

      deleteCommand: (serverId, command) => {
        set(state => {
          const existing = state.histories[serverId] || []
          const updated = existing.filter(c => c !== command)
          if (updated.length === existing.length) return state
          return {
            histories: {
              ...state.histories,
              [serverId]: updated,
            },
          }
        })
      },

      clearHistory: (serverId) => {
        set(state => {
          const rest = { ...state.histories }
          delete rest[serverId]
          return { histories: rest }
        })
      },

      clearAll: () => {
        set({ histories: {} })
      },
    }),
    {
      name: 'terminal-history',
    }
  )
)
