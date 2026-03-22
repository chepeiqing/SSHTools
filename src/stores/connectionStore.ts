import { create } from 'zustand'
import type { FileInfo } from '../types'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface Connection {
  id: string
  serverId: string
  serverName: string
  status: ConnectionStatus
  error?: string
  sftpReady: boolean
  currentPath?: string
}

export interface TransferTask {
  id: string
  connectionId: string
  type: 'upload' | 'download'
  localPath: string
  remotePath: string
  transferred: number
  total: number
  status: 'pending' | 'transferring' | 'completed' | 'error'
  error?: string
}

interface ConnectionState {
  connections: Map<string, Connection>
  transferTasks: TransferTask[]
  
  // 连接操作
  setConnection: (id: string, connection: Connection) => void
  updateConnection: (id: string, data: Partial<Connection>) => void
  removeConnection: (id: string) => void
  getConnection: (id: string) => Connection | undefined
  
  // 传输任务
  addTransferTask: (task: TransferTask) => void
  updateTransferTask: (id: string, data: Partial<TransferTask>) => void
  removeTransferTask: (id: string) => void
  getTransferTasks: (connectionId: string) => TransferTask[]
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  connections: new Map(),
  transferTasks: [],

  setConnection: (id, connection) => {
    set((state) => {
      const newConnections = new Map(state.connections)
      newConnections.set(id, connection)
      return { connections: newConnections }
    })
  },

  updateConnection: (id, data) => {
    set((state) => {
      const newConnections = new Map(state.connections)
      const existing = newConnections.get(id)
      if (existing) {
        newConnections.set(id, { ...existing, ...data })
      }
      return { connections: newConnections }
    })
  },

  removeConnection: (id) => {
    set((state) => {
      const newConnections = new Map(state.connections)
      newConnections.delete(id)
      return { connections: newConnections }
    })
  },

  getConnection: (id) => {
    return get().connections.get(id)
  },

  addTransferTask: (task) => {
    set((state) => ({
      transferTasks: [...state.transferTasks, task],
    }))
  },

  updateTransferTask: (id, data) => {
    set((state) => ({
      transferTasks: state.transferTasks.map((task) =>
        task.id === id ? { ...task, ...data } : task
      ),
    }))
  },

  removeTransferTask: (id) => {
    set((state) => ({
      transferTasks: state.transferTasks.filter((task) => task.id !== id),
    }))
  },

  getTransferTasks: (connectionId) => {
    return get().transferTasks.filter((task) => task.connectionId === connectionId)
  },
}))

// 辅助函数：连接服务器
export async function connectServer(
  serverId: string,
  serverName: string,
  config: {
    host: string
    port: number
    username: string
    password?: string
    privateKey?: string
    passphrase?: string
  }
): Promise<{ success: boolean; connectionId?: string; error?: string }> {
  const connectionId = `conn-${serverId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  
  // 设置连接状态为 connecting
  useConnectionStore.getState().setConnection(connectionId, {
    id: connectionId,
    serverId,
    serverName,
    status: 'connecting',
    sftpReady: false,
  })

  try {
    const result = await window.electronAPI.sshConnect({
      id: connectionId,
      ...config,
    })

    if (result.success) {
      useConnectionStore.getState().updateConnection(connectionId, {
        status: 'connected',
      })
      return { success: true, connectionId }
    } else {
      useConnectionStore.getState().updateConnection(connectionId, {
        status: 'error',
        error: result.error,
      })
      return { success: false, error: result.error }
    }
  } catch (error: unknown) {
    useConnectionStore.getState().updateConnection(connectionId, {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    })
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

// 辅助函数：断开连接
export async function disconnectServer(connectionId: string) {
  await window.electronAPI.sshDisconnect(connectionId)
  useConnectionStore.getState().removeConnection(connectionId)
}

// 辅助函数：启动 Shell
export async function startShell(connectionId: string): Promise<{ success: boolean; error?: string }> {
  return await window.electronAPI.sshStartShell(connectionId)
}

// 辅助函数：初始化 SFTP
export async function initSFTP(connectionId: string): Promise<{ success: boolean; error?: string }> {
  const result = await window.electronAPI.sftpInit(connectionId)
  if (result.success) {
    useConnectionStore.getState().updateConnection(connectionId, {
      sftpReady: true,
    })
    
    // 获取当前工作目录
    const cwdResult = await window.electronAPI.sftpGetcwd(connectionId)
    if (cwdResult.success && cwdResult.path) {
      useConnectionStore.getState().updateConnection(connectionId, {
        currentPath: cwdResult.path,
      })
    }
  }
  return result
}

// 辅助函数：获取文件列表
export async function listFiles(
  connectionId: string,
  remotePath: string
): Promise<{ success: boolean; files?: FileInfo[]; error?: string }> {
  return await window.electronAPI.sftpList(connectionId, remotePath)
}
