import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { encrypt, decrypt } from '../utils/crypto'

export interface ServerConfig {
  id: string
  name: string
  host: string
  port: number
  username: string
  authType: 'password' | 'privateKey'
  password?: string
  privateKey?: string
  passphrase?: string
  rememberPassword?: boolean // 默认 true
  groupId?: string
  description?: string
  tags?: string[]
  quickCommands?: { name: string; command: string }[]
  lastConnectedAt?: number
  terminal: {
    fontSize: number
    fontFamily: string
    theme: string
  }
}

export interface ServerGroup {
  id: string
  name: string
  parentId?: string
  order: number
}

interface ServerState {
  servers: ServerConfig[]
  groups: ServerGroup[]
  activeServerId: string | null
  addServer: (server: Omit<ServerConfig, 'id'>) => void
  updateServer: (id: string, server: Partial<ServerConfig>) => void
  deleteServer: (id: string) => void
  addGroup: (group: Omit<ServerGroup, 'id'>) => void
  updateGroup: (id: string, group: Partial<ServerGroup>) => void
  deleteGroup: (id: string) => void
  setActiveServer: (id: string | null) => void
  touchServer: (id: string) => void
  getDescendantGroupIds: (id: string) => string[]
  exportConfig: (password: string) => Promise<string>
  importConfig: (json: string, password: string) => Promise<{ success: boolean; error?: string; count?: number }>
}

// 防抖备份到 electron-store（不含密码）
let _backupTimer: ReturnType<typeof setTimeout> | null = null
function backupDebounced(servers: ServerConfig[], groups: ServerGroup[]) {
  if (_backupTimer) clearTimeout(_backupTimer)
  _backupTimer = setTimeout(() => {
    const safeServers = servers.map(({ password: _p, privateKey: _k, passphrase: _ph, ...rest }) => rest)
    window.electronAPI?.backupServers({ servers: safeServers as unknown as Record<string, unknown>[], groups: groups as unknown as Record<string, unknown>[] })
  }, 1000)
}

// 保存凭据到主进程加密存储
function saveCredentials(serverId: string, server: Partial<ServerConfig>) {
  if (server.rememberPassword === false) {
    window.electronAPI?.credentialsDelete(serverId)
    return
  }
  const creds: { password?: string; privateKey?: string; passphrase?: string } = {}
  if (server.password) creds.password = server.password
  if (server.privateKey) creds.privateKey = server.privateKey
  if (server.passphrase) creds.passphrase = server.passphrase
  if (creds.password || creds.privateKey || creds.passphrase) {
    window.electronAPI?.credentialsSave(serverId, creds)
  }
}

export const useServerStore = create<ServerState>()(
  persist(
    (set, get) => ({
      servers: [],
      groups: [
        { id: 'default', name: '默认分组', order: 0 },
      ],
      activeServerId: null,

      addServer: (server) => {
        const newServer: ServerConfig = {
          ...server,
          id: `server-${Date.now()}`,
          terminal: server.terminal || {
            fontSize: 14,
            fontFamily: 'Consolas, Monaco, monospace',
            theme: 'default',
          },
        }
        set((state) => ({
          servers: [...state.servers, newServer],
        }))
        saveCredentials(newServer.id, newServer)
        const state = get()
        backupDebounced(state.servers, state.groups)
      },

      updateServer: (id, server) => {
        set((state) => ({
          servers: state.servers.map((s) =>
            s.id === id ? { ...s, ...server } : s
          ),
        }))
        // 如果更新了凭据相关字段，同步到加密存储
        if (server.password !== undefined || server.privateKey !== undefined || server.passphrase !== undefined || server.rememberPassword !== undefined) {
          const updated = get().servers.find(s => s.id === id)
          if (updated) saveCredentials(id, updated)
        }
        const state = get()
        backupDebounced(state.servers, state.groups)
      },

      deleteServer: (id) => {
        set((state) => ({
          servers: state.servers.filter((s) => s.id !== id),
          activeServerId: state.activeServerId === id ? null : state.activeServerId,
        }))
        window.electronAPI?.credentialsDelete(id)
        const state = get()
        backupDebounced(state.servers, state.groups)
      },

      addGroup: (group) => {
        const newGroup: ServerGroup = {
          ...group,
          id: `group-${Date.now()}`,
        }
        set((state) => ({
          groups: [...state.groups, newGroup],
        }))
        const state = get()
        backupDebounced(state.servers, state.groups)
      },

      updateGroup: (id, group) => {
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === id ? { ...g, ...group } : g
          ),
        }))
        const state = get()
        backupDebounced(state.servers, state.groups)
      },

      // 级联删除：删除分组及其所有子分组，服务器移到父分组或 default
      deleteGroup: (id) => {
        const state = get()
        const group = state.groups.find(g => g.id === id)
        const parentId = group?.parentId || 'default'

        const deleteIds = new Set<string>()
        const collectChildren = (gid: string) => {
          deleteIds.add(gid)
          state.groups.forEach(g => {
            if (g.parentId === gid) collectChildren(g.id)
          })
        }
        collectChildren(id)

        set({
          groups: state.groups.filter(g => !deleteIds.has(g.id)),
          servers: state.servers.map(s =>
            s.groupId && deleteIds.has(s.groupId)
              ? { ...s, groupId: parentId }
              : s
          ),
        })
        const newState = get()
        backupDebounced(newState.servers, newState.groups)
      },

      setActiveServer: (id) => {
        set({ activeServerId: id })
      },

      touchServer: (id) => {
        set((state) => ({
          servers: state.servers.map((s) =>
            s.id === id ? { ...s, lastConnectedAt: Date.now() } : s
          ),
        }))
      },

      // 获取某分组的所有后代分组 ID
      getDescendantGroupIds: (id) => {
        const { groups } = get()
        const result: string[] = []
        const collect = (gid: string) => {
          groups.forEach(g => {
            if (g.parentId === gid) {
              result.push(g.id)
              collect(g.id)
            }
          })
        }
        collect(id)
        return result
      },

      // 导出配置（密码和密钥使用 AES-GCM 加密）
      exportConfig: async (password: string) => {
        const { servers, groups } = get()

        const encryptedServers = await Promise.all(servers.map(async (s) => {
          const exported: Record<string, unknown> = { ...s }
          if (s.password) exported.password = await encrypt(s.password, password)
          if (s.privateKey) exported.privateKey = await encrypt(s.privateKey, password)
          if (s.passphrase) exported.passphrase = await encrypt(s.passphrase, password)
          return exported
        }))

        const data = {
          version: 1,
          encrypted: true,
          exportedAt: new Date().toISOString(),
          servers: encryptedServers,
          groups,
        }
        return JSON.stringify(data, null, 2)
      },

      // 导入配置
      importConfig: async (json: string, password: string) => {
        try {
          const data = JSON.parse(json)

          if (!data || typeof data !== 'object') {
            return { success: false, error: '无效的配置格式' }
          }
          if (!Array.isArray(data.servers)) {
            return { success: false, error: '配置中缺少服务器列表' }
          }

          const importedServers: ServerConfig[] = []
          for (const s of data.servers) {
            if (!s.name || !s.host || !s.username) continue

            let pwd: string | undefined
            let key: string | undefined
            let phrase: string | undefined

            if (data.encrypted) {
              try {
                if (s.password) pwd = await decrypt(String(s.password), password)
                if (s.privateKey) key = await decrypt(String(s.privateKey), password)
                if (s.passphrase) phrase = await decrypt(String(s.passphrase), password)
              } catch {
                return { success: false, error: '解密失败，请检查密码是否正确' }
              }
            } else {
              pwd = s.password ? String(s.password) : undefined
              key = s.privateKey ? String(s.privateKey) : undefined
              phrase = s.passphrase ? String(s.passphrase) : undefined
            }

            const serverId = `server-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

            importedServers.push({
              id: serverId,
              name: String(s.name),
              host: String(s.host),
              port: Number(s.port) || 22,
              username: String(s.username),
              authType: s.authType === 'privateKey' ? 'privateKey' : 'password',
              password: pwd,
              privateKey: key,
              passphrase: phrase,
              rememberPassword: true,
              groupId: s.groupId ? String(s.groupId) : undefined,
              description: s.description ? String(s.description) : undefined,
              tags: Array.isArray(s.tags) ? s.tags.map(String) : undefined,
              terminal: {
                fontSize: 14,
                fontFamily: 'Consolas, Monaco, monospace',
                theme: 'default',
              },
            })

            // 保存凭据到加密存储
            if (pwd || key || phrase) {
              window.electronAPI?.credentialsSave(serverId, { password: pwd, privateKey: key, passphrase: phrase })
            }
          }

          if (importedServers.length === 0) {
            return { success: false, error: '未找到有效的服务器配置' }
          }

          const importedGroups: ServerGroup[] = []
          // 旧分组 ID → 新分组 ID 的映射，用于修正服务器的 groupId 引用
          const groupIdMap = new Map<string, string>()
          let importedDefaultGroupName: string | null = null
          if (Array.isArray(data.groups)) {
            for (const g of data.groups) {
              if (!g.id || !g.name) continue
              if (g.id === 'default') {
                groupIdMap.set('default', 'default')
                // 记录导入文件中默认分组的自定义名称
                if (String(g.name) !== '默认分组') {
                  importedDefaultGroupName = String(g.name)
                }
                continue
              }
              const newGroupId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
              groupIdMap.set(String(g.id), newGroupId)
              importedGroups.push({
                id: newGroupId,
                name: String(g.name),
                parentId: g.parentId ? String(g.parentId) : undefined, // 暂存旧 parentId，下面统一替换
                order: Number(g.order) || 0,
              })
            }

            // 修正分组的 parentId 引用
            for (const g of importedGroups) {
              if (g.parentId) {
                g.parentId = groupIdMap.get(g.parentId) || 'default'
              }
            }
          }

          // 修正服务器的 groupId 引用
          for (const s of importedServers) {
            if (s.groupId) {
              s.groupId = groupIdMap.get(s.groupId) || 'default'
            }
          }

          set((state) => ({
            servers: [...state.servers, ...importedServers],
            groups: [
              // 如果导入文件中默认分组有自定义名称，更新现有默认分组
              ...state.groups.map(g =>
                g.id === 'default' && importedDefaultGroupName
                  ? { ...g, name: importedDefaultGroupName }
                  : g
              ),
              ...importedGroups,
            ],
          }))

          return { success: true, count: importedServers.length }
        } catch {
          return { success: false, error: '配置文件解析失败，请检查格式' }
        }
      },
    }),
    {
      name: 'ssh-tools-servers',
      // 持久化到 localStorage 时剥离敏感字段
      partialize: (state) => ({
        servers: state.servers.map((s: ServerConfig) => {
          const { password: _p, privateKey: _k, passphrase: _ph, ...safe } = s
          return safe
        }),
        groups: state.groups,
        activeServerId: state.activeServerId,
      } as unknown as ServerState),
    }
  )
)

/**
 * 从主进程 electron-store 备份中恢复服务器配置。
 * 当 localStorage 被清除（如重新安装应用）时，自动从备份恢复。
 * 应在 hydrateCredentials 之前调用。
 */
export async function restoreFromBackup() {
  const { servers } = useServerStore.getState()
  // 如果 localStorage 中已有服务器数据，无需恢复
  if (servers.length > 0) return

  try {
    const result = await window.electronAPI.restoreServers()
    if (!result?.success || !result.servers?.length) return

    const restoredServers: ServerConfig[] = result.servers
      .filter((s: Record<string, unknown>) => s.name && s.host && s.username)
      .map((s: Record<string, unknown>) => ({
        id: String(s.id || `server-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
        name: String(s.name),
        host: String(s.host),
        port: Number(s.port) || 22,
        username: String(s.username),
        authType: s.authType === 'privateKey' ? 'privateKey' as const : 'password' as const,
        rememberPassword: s.rememberPassword !== false,
        groupId: s.groupId ? String(s.groupId) : undefined,
        description: s.description ? String(s.description) : undefined,
        tags: Array.isArray(s.tags) ? s.tags.map(String) : undefined,
        lastConnectedAt: s.lastConnectedAt ? Number(s.lastConnectedAt) : undefined,
        terminal: (s.terminal as ServerConfig['terminal']) || {
          fontSize: 14,
          fontFamily: 'Consolas, Monaco, monospace',
          theme: 'default',
        },
      }))

    const restoredGroups: ServerGroup[] = Array.isArray(result.groups)
      ? result.groups
          .filter((g: Record<string, unknown>) => g.id && g.name)
          .map((g: Record<string, unknown>) => ({
            id: String(g.id),
            name: String(g.name),
            parentId: g.parentId ? String(g.parentId) : undefined,
            order: Number(g.order) || 0,
          }))
      : [{ id: 'default', name: '默认分组', order: 0 }]

    if (restoredServers.length > 0) {
      useServerStore.setState({
        servers: restoredServers,
        groups: restoredGroups,
      })
    }
  } catch {
    // 恢复失败不影响应用启动
  }
}

/**
 * 从主进程加密凭据存储中恢复密码到内存。
 * 同时处理旧版本迁移（localStorage 中有明文密码的情况）。
 * 应在应用启动时调用一次。
 */
export async function hydrateCredentials() {
  const { servers } = useServerStore.getState()

  // 迁移：如果 localStorage 中残留明文密码（旧版本），移到加密存储
  const serversWithPlainCreds = servers.filter(s => s.password || s.privateKey || s.passphrase)
  if (serversWithPlainCreds.length > 0) {
    await Promise.all(serversWithPlainCreds.map(s =>
      window.electronAPI.credentialsSave(s.id, {
        password: s.password,
        privateKey: s.privateKey,
        passphrase: s.passphrase,
      })
    ))
    // 触发 persist 刷新，partialize 会自动剥离密码
    useServerStore.setState(state => ({ servers: [...state.servers] }))
  }

  // 从加密存储恢复凭据到内存
  const serversNeedingCreds = useServerStore.getState().servers.filter(
    s => s.rememberPassword !== false && !s.password && !s.privateKey
  )
  if (serversNeedingCreds.length === 0) return

  const results = await Promise.all(
    serversNeedingCreds.map(async s => {
      const r = await window.electronAPI.credentialsGet(s.id)
      return { serverId: s.id, ...r }
    })
  )

  useServerStore.setState(state => ({
    servers: state.servers.map(s => {
      const result = results.find(r => r.serverId === s.id)
      if (result?.success && result.credentials) {
        return { ...s, ...result.credentials }
      }
      return s
    })
  }))
}
