import { create } from 'zustand'

export interface TransferTask {
  id: string
  connectionId: string
  serverName: string
  type: 'upload' | 'download'
  fileName: string
  localPath: string
  remotePath: string
  status: 'pending' | 'transferring' | 'completed' | 'failed'
  progress: number
  speed?: string
  error?: string
  resume?: boolean
}

interface TransferState {
  tasks: TransferTask[]
  panelVisible: boolean
  maxConcurrent: number

  addTasks: (tasks: Omit<TransferTask, 'status' | 'progress'>[]) => void
  updateTask: (id: string, data: Partial<TransferTask>) => void
  cancelTask: (id: string) => void
  retryTask: (id: string) => void
  clearCompleted: () => void
  clearAll: () => void
  setPanelVisible: (v: boolean) => void
  processQueue: () => void
}

// 每个正在执行的任务：taskId -> { cancelled, abortController }
// abortController 用于真正中止 electron 端的传输
const activeTransfers = new Map<string, { cancelled: boolean }>()

// 速度追踪：taskId -> { transferred, time }
const speedTracker = new Map<string, { transferred: number; time: number }>()

// 格式化速度
function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`
}

export const useTransferStore = create<TransferState>((set, get) => ({
  tasks: [],
  panelVisible: false,
  maxConcurrent: 3,

  addTasks: (newTasks) => {
    const tasks = newTasks.map(t => ({
      ...t,
      status: 'pending' as const,
      progress: 0,
    }))
    // 新任务的 connectionId:remotePath 集合，用于去重
    const newKeys = new Set(tasks.map(t => `${t.connectionId}:${t.remotePath}`))
    set(state => ({
      tasks: [
        // 移除同 connectionId+remotePath 的已完成/已失败旧条目，避免重传时出现两条记录
        ...state.tasks.filter(t =>
          !newKeys.has(`${t.connectionId}:${t.remotePath}`) || (t.status !== 'failed' && t.status !== 'completed')
        ),
        ...tasks,
      ],
      panelVisible: true,
    }))
    queueMicrotask(() => get().processQueue())
  },

  updateTask: (id, data) => {
    set(state => ({
      tasks: state.tasks.map(t => t.id === id ? { ...t, ...data } : t),
    }))
  },

  cancelTask: (id) => {
    const task = get().tasks.find(t => t.id === id)
    if (!task) return

    if (task.status === 'pending') {
      // 待处理任务：直接从队列移除
      set(state => ({
        tasks: state.tasks.filter(t => t.id !== id),
      }))
    } else if (task.status === 'transferring') {
      // 传输中任务：先标记取消，再调用 electron 端中止传输
      const active = activeTransfers.get(id)
      if (active) {
        active.cancelled = true
      }
      speedTracker.delete(id)
      
      // 调用 electron 端中止传输
      window.electronAPI.sftpAbort(id)
      
      set(state => ({
        tasks: state.tasks.map(t =>
          t.id === id ? { ...t, status: 'failed' as const, error: '已取消', speed: undefined } : t
        ),
      }))
    }
  },

  retryTask: (id) => {
    set(state => ({
      tasks: state.tasks.map(t =>
        t.id === id && t.status === 'failed'
          ? { ...t, status: 'pending' as const, progress: 0, speed: undefined, error: undefined, resume: true }
          : t
      ),
    }))
    queueMicrotask(() => get().processQueue())
  },

  clearCompleted: () => {
    set(state => ({
      tasks: state.tasks.filter(t => t.status !== 'completed'),
    }))
  },

  clearAll: () => {
    // 中止所有活跃传输
    for (const [taskId, info] of activeTransfers) {
      info.cancelled = true
      window.electronAPI.sftpAbort(taskId)
    }
    speedTracker.clear()
    set({ tasks: [] })
  },

  setPanelVisible: (v) => set({ panelVisible: v }),

  processQueue: () => {
    const { tasks, maxConcurrent } = get()
    const transferringCount = tasks.filter(t => t.status === 'transferring').length

    // 并发限制
    if (transferringCount >= maxConcurrent) return

    // 获取待处理任务（按添加顺序）
    const pending = tasks.filter(t => t.status === 'pending')
    const slotsAvailable = maxConcurrent - transferringCount
    const toStart = pending.slice(0, slotsAvailable)

    for (const task of toStart) {
      const taskId = task.id
      
      // 初始化活跃传输记录
      activeTransfers.set(taskId, { cancelled: false })
      speedTracker.delete(taskId)
      
      // 更新任务状态
      get().updateTask(taskId, { status: 'transferring', progress: 0, speed: undefined })

      // 执行传输（传递 taskId 给 electron）
      const run = async () => {
        try {
          let result: { success: boolean; error?: string }
          if (task.type === 'upload') {
            result = await window.electronAPI.sftpUpload(
              task.connectionId,
              task.localPath,
              task.remotePath,
              task.resume,
              taskId  // 传递 taskId
            )
          } else {
            result = await window.electronAPI.sftpDownload(
              task.connectionId,
              task.remotePath,
              task.localPath,
              task.resume,
              taskId  // 传递 taskId
            )
          }

          // 检查是否已被取消
          const active = activeTransfers.get(taskId)
          if (active?.cancelled) return

          // 更新最终状态
          const current = get().tasks.find(t => t.id === taskId)
          if (current && current.status === 'transferring') {
            get().updateTask(taskId, {
              status: result.success ? 'completed' : 'failed',
              progress: result.success ? 100 : current.progress,
              error: result.error,
              speed: undefined,
            })
          }
        } catch (err: unknown) {
          const active = activeTransfers.get(taskId)
          if (active?.cancelled) return

          const current = get().tasks.find(t => t.id === taskId)
          if (current && current.status === 'transferring') {
            get().updateTask(taskId, {
              status: 'failed',
              error: err instanceof Error ? err.message : '传输异常',
              speed: undefined,
            })
          }
        } finally {
          // 清理活跃传输记录
          activeTransfers.delete(taskId)
          speedTracker.delete(taskId)
          // 触发队列处理
          queueMicrotask(() => get().processQueue())
        }
      }

      run()
    }
  },
}))

// 全局进度监听器（只初始化一次）
let progressListenerInitialized = false

export function initTransferProgressListener() {
  if (progressListenerInitialized) return
  progressListenerInitialized = true

  window.electronAPI.onSFTPTransferProgress((data) => {
    const { taskId, transferred, total } = data

    // 精确匹配：使用 taskId
    if (!taskId) return

    const active = activeTransfers.get(taskId)
    
    // 忽略已取消任务的进度
    if (!active || active.cancelled) return

    const { tasks, updateTask } = useTransferStore.getState()
    const task = tasks.find(t => t.id === taskId && t.status === 'transferring')
    if (!task) return

    const percent = total > 0 ? Math.round((transferred / total) * 100) : 0
    const now = Date.now()
    const prev = speedTracker.get(taskId)
    let speed: string | undefined

    // 计算速度（需要至少 300ms 间隔）
    if (prev && now - prev.time > 0) {
      const elapsed = (now - prev.time) / 1000
      const bytes = transferred - prev.transferred
      if (elapsed > 0.3 && bytes >= 0) {
        speed = formatSpeed(bytes / elapsed)
      }
    }

    // 跳过无变化的更新
    if (percent === task.progress && !speed) return

    speedTracker.set(taskId, { transferred, time: now })

    updateTask(taskId, {
      progress: percent,
      ...(speed ? { speed } : {}),
    })
  })
}