import { create } from 'zustand'

export interface TransferTask {
  id: string
  connectionId: string
  serverName: string
  type: 'upload' | 'download'
  fileName: string
  localPath: string
  remotePath: string
  status: 'pending' | 'transferring' | 'paused' | 'cancelled' | 'completed' | 'failed'
  progress: number
  speed?: string
  error?: string
  resume?: boolean
}

interface TransferState {
  tasks: TransferTask[]
  panelVisible: boolean
  maxConcurrent: number

  addTasks: (tasks: Omit<TransferTask, 'status' | 'progress'>[]) => { added: number; skipped: number }
  updateTask: (id: string, data: Partial<TransferTask>) => void
  pauseTask: (id: string) => void
  cancelTask: (id: string) => void
  resumeTask: (id: string) => void
  retryTask: (id: string) => void
  clearCompleted: () => void
  clearAll: () => void
  setPanelVisible: (v: boolean) => void
  processQueue: () => void
}

type TransferAbortAction = 'pause' | 'cancel'

function getTaskConflictKey(task: Pick<TransferTask, 'type' | 'connectionId' | 'remotePath' | 'localPath'>): string {
  return task.type === 'upload'
    ? `upload:${task.connectionId}:${task.remotePath}`
    : `download:${task.connectionId}:${task.remotePath}:${task.localPath}`
}

// 每个正在执行的任务：taskId -> { aborting }
const activeTransfers = new Map<string, { aborting?: TransferAbortAction }>()

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
    const newKeys = new Set(tasks.map(getTaskConflictKey))
    const existingTasks = get().tasks
    const blockingKeys = new Set(
      existingTasks
        .filter(t => t.status === 'transferring' || t.status === 'pending' || t.status === 'paused')
        .map(getTaskConflictKey)
    )
    const acceptedTasks = tasks.filter(t => !blockingKeys.has(getTaskConflictKey(t)))
    set(state => ({
      tasks: [
        // 对同一传输目标只保留最新终态记录，活跃任务则阻止重复入队
        ...state.tasks.filter(t =>
          !newKeys.has(getTaskConflictKey(t))
            || t.status === 'transferring'
            || t.status === 'pending'
            || t.status === 'paused'
        ),
        ...acceptedTasks,
      ],
      panelVisible: state.panelVisible || acceptedTasks.length > 0,
    }))
    if (acceptedTasks.length > 0) {
      queueMicrotask(() => get().processQueue())
    }
    return { added: acceptedTasks.length, skipped: tasks.length - acceptedTasks.length }
  },

  updateTask: (id, data) => {
    set(state => ({
      tasks: state.tasks.map(t => t.id === id ? { ...t, ...data } : t),
    }))
  },

  pauseTask: (id) => {
    const task = get().tasks.find(t => t.id === id)
    if (!task || task.status !== 'transferring') return

    const active = activeTransfers.get(id)
    if (!active) return
    if (active?.aborting) return

    active.aborting = 'pause'
    speedTracker.delete(id)
    void window.electronAPI.sftpAbort(id, 'pause')

    get().updateTask(id, {
      status: 'paused',
      speed: undefined,
      error: undefined,
      resume: true,
    })
  },

  cancelTask: (id) => {
    const task = get().tasks.find(t => t.id === id)
    if (!task) return

    if (task.status === 'pending' || task.status === 'paused') {
      speedTracker.delete(id)
      if (task.status === 'paused') {
        void window.electronAPI.sftpDiscardTransfer(task.connectionId, task.type, task.localPath, task.remotePath)
      }
      get().updateTask(id, {
        status: 'cancelled',
        speed: undefined,
        error: undefined,
        resume: false,
      })
    } else if (task.status === 'transferring') {
      const active = activeTransfers.get(id)
      if (!active) return
      if (active?.aborting) return

      active.aborting = 'cancel'
      speedTracker.delete(id)
      void window.electronAPI.sftpAbort(id, 'cancel')

      get().updateTask(id, {
        status: 'cancelled',
        speed: undefined,
        error: undefined,
        resume: false,
      })
    }
  },

  resumeTask: (id) => {
    set(state => ({
      tasks: state.tasks.map(t =>
        t.id === id && t.status === 'paused'
          ? { ...t, status: 'pending' as const, speed: undefined, error: undefined, resume: true }
          : t
      ),
    }))
    queueMicrotask(() => get().processQueue())
  },

  retryTask: (id) => {
    set(state => ({
      tasks: state.tasks.map(t =>
        t.id === id && (t.status === 'failed' || t.status === 'cancelled')
          ? {
              ...t,
              status: 'pending' as const,
              progress: t.status === 'failed' ? t.progress : 0,
              speed: undefined,
              error: undefined,
              resume: t.status === 'failed',
            }
          : t
      ),
    }))
    queueMicrotask(() => get().processQueue())
  },

  clearCompleted: () => {
    set(state => ({
      tasks: state.tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled'),
    }))
  },

  clearAll: () => {
    const tasks = get().tasks
    for (const [taskId, info] of activeTransfers) {
      if (info.aborting) continue
      info.aborting = 'cancel'
      void window.electronAPI.sftpAbort(taskId, 'cancel')
    }
    for (const task of tasks) {
      if (task.status === 'paused') {
        void window.electronAPI.sftpDiscardTransfer(task.connectionId, task.type, task.localPath, task.remotePath)
      }
    }
    speedTracker.clear()
    set(state => ({
      tasks: state.tasks
        .filter(task => task.status === 'transferring' || task.status === 'pending' || task.status === 'paused')
        .map(task => ({
          ...task,
          status: 'cancelled' as const,
          speed: undefined,
          error: undefined,
          resume: false,
        })),
    }))
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
    const activeKeys = new Set(
      tasks
        .filter(t => t.status === 'transferring')
        .map(getTaskConflictKey)
    )
    const toStart = pending
      .filter(task => !activeKeys.has(getTaskConflictKey(task)))
      .slice(0, slotsAvailable)

    for (const task of toStart) {
      const taskId = task.id
      activeKeys.add(getTaskConflictKey(task))

      activeTransfers.set(taskId, {})
      speedTracker.delete(taskId)

      get().updateTask(taskId, {
        status: 'transferring',
        progress: task.resume ? task.progress : 0,
        speed: undefined,
      })

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

          const active = activeTransfers.get(taskId)
          if (active?.aborting) return

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
          if (active?.aborting) return

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

    if (!active || active.aborting) return

    const { tasks, updateTask } = useTransferStore.getState()
    const task = tasks.find(t => t.id === taskId && t.status === 'transferring')
    if (!task) return

    const percent = total > 0 ? Math.round((transferred / total) * 100) : 0
    const now = Date.now()
    const prev = speedTracker.get(taskId)
    let speed: string | undefined

    // 计算速度（需要至少 300ms 间隔）
    if (prev) {
      const elapsed = (now - prev.time) / 1000
      const bytes = transferred - prev.transferred
      if (elapsed >= 0.3 && bytes >= 0) {
        speed = formatSpeed(bytes / elapsed)
        // 只在计算出速度时才重置基线
        speedTracker.set(taskId, { transferred, time: now })
      }
    } else {
      // 首次：记录基线，不计算速度
      speedTracker.set(taskId, { transferred, time: now })
    }

    // 跳过无变化的更新
    if (percent === task.progress && !speed) return

    updateTask(taskId, {
      progress: percent,
      ...(speed ? { speed } : {}),
    })
  })
}
