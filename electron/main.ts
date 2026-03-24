import { app, BrowserWindow, ipcMain, nativeTheme, shell, dialog, screen, IpcMainInvokeEvent, safeStorage } from 'electron'
import path from 'path'
import Store from 'electron-store'
import { sshManager, SSHConnectionConfig } from './sshManager'

// 初始化存储
const store = new Store()
const credentialStore = new Store({ name: 'credentials' })
const backupStore = new Store({ name: 'server-backup' })

// 窗口池（多窗口管理）
const windows = new Set<BrowserWindow>()
// 新窗口初始标签数据
const pendingTabData = new Map<number, Record<string, unknown>>()

function createWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const isDev = process.env.NODE_ENV === 'development'

  // 图标路径：开发环境用项目目录，生产环境用 extraResources
  const iconPath = isDev
    ? path.join(__dirname, '../build/icon.png')
    : path.join(process.resourcesPath, 'icon.png')

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    frame: false, // 无边框窗口，自定义标题栏
    ...(isMac ? {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 15, y: 15 },
    } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: iconPath,
    show: false
  })

  // 窗口准备好后显示
  win.once('ready-to-show', () => {
    win.show()
  })

  // 注册到窗口池和 SSH 管理器
  windows.add(win)
  sshManager.registerWindow(win.webContents)

  // 开发环境加载本地服务器
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
    // 仅首个窗口自动开启 DevTools
    if (windows.size === 1) {
      win.webContents.openDevTools()
    }
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // 外部链接用默认浏览器打开
  win.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // 发送窗口最大化/还原事件到渲染进程
  win.on('maximize', () => {
    win.webContents.send('window-maximized')
  })
  win.on('unmaximize', () => {
    win.webContents.send('window-unmaximized')
  })

  // 窗口关闭时清理（提前捕获 webContents 引用，closed 事件时已销毁）
  const wc = win.webContents
  win.on('closed', () => {
    sshManager.unregisterWindow(wc)
    windows.delete(win)
    pendingTabData.delete(win.id)
    // 如果关闭的窗口正是拖拽源，清理拖拽状态（防止定时器/overlay 泄漏）
    if (dragSourceWinId === win.id) {
      cleanupDragState()
    }
  })

  return win
}

// 获取初始主题设置
function getInitialTheme(): 'light' | 'dark' | 'system' {
  return (store.get('theme') as 'light' | 'dark' | 'system') || 'system'
}

// 应用主题
function applyTheme(theme: 'light' | 'dark' | 'system') {
  if (theme === 'system') {
    nativeTheme.themeSource = 'system'
  } else {
    nativeTheme.themeSource = theme
  }
  store.set('theme', theme)
}

// IPC 处理程序
ipcMain.handle('get-theme', () => {
  return getInitialTheme()
})

ipcMain.handle('set-theme', (event: IpcMainInvokeEvent, theme: 'light' | 'dark' | 'system') => {
  applyTheme(theme)
  // 广播到其他窗口
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.webContents !== event.sender && !win.webContents.isDestroyed()) {
      win.webContents.send('settings-sync', { type: 'theme', data: { mode: theme } })
    }
  }
  return true
})

ipcMain.handle('get-system-theme', () => {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
})

// 设置同步广播（终端设置变化时由渲染进程调用，广播给其他窗口）
ipcMain.handle('broadcast-settings', (event: IpcMainInvokeEvent, payload: { type: string; data: unknown }) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.webContents !== event.sender && !win.webContents.isDestroyed()) {
      win.webContents.send('settings-sync', payload)
    }
  }
})

// 窗口控制
ipcMain.handle('window-minimize', (event: IpcMainInvokeEvent) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})

ipcMain.handle('window-maximize', (event: IpcMainInvokeEvent) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win?.isMaximized()) {
    win.unmaximize()
  } else {
    win?.maximize()
  }
})

ipcMain.handle('window-close', (event: IpcMainInvokeEvent) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})

ipcMain.handle('window-is-maximized', (event: IpcMainInvokeEvent) => {
  return BrowserWindow.fromWebContents(event.sender)?.isMaximized()
})

// 获取平台信息
ipcMain.handle('get-platform', () => {
  return process.platform
})

ipcMain.handle('open-external', (_event: IpcMainInvokeEvent, url: string) => {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:') {
      shell.openExternal(url)
    }
  } catch {
    // 无效 URL，忽略
  }
})

// 监听系统主题变化（广播到所有窗口）
nativeTheme.on('updated', () => {
  const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send('system-theme-changed', theme)
    }
  }
})

// ==================== SSH 相关 IPC 处理 ====================

// SSH 连接
ipcMain.handle('ssh-connect', async (event: IpcMainInvokeEvent, config: SSHConnectionConfig) => {
  return await sshManager.connect(config, event.sender)
})

// SSH 断开连接
ipcMain.handle('ssh-disconnect', async (_event: IpcMainInvokeEvent, id: string) => {
  sshManager.disconnect(id)
  return { success: true }
})

// 检查连接状态
ipcMain.handle('ssh-is-connected', async (_event: IpcMainInvokeEvent, id: string) => {
  return sshManager.isConnected(id)
})

// 启动 Shell
ipcMain.handle('ssh-start-shell', async (event: IpcMainInvokeEvent, id: string) => {
  const result = await sshManager.startShell(id)
  // 更新连接目标到调用方窗口（跨窗口迁移时，确保数据发到正确窗口）
  if (result.success && event.sender && !event.sender.isDestroyed()) {
    sshManager.setConnectionTarget(id, event.sender)
  }
  return result
})

// 向终端写入数据
ipcMain.handle('ssh-write', async (_event: IpcMainInvokeEvent, id: string, data: string) => {
  return { success: sshManager.writeToShell(id, data) }
})

// 调整终端大小
ipcMain.handle('ssh-resize', async (_event: IpcMainInvokeEvent, id: string, cols: number, rows: number) => {
  return { success: sshManager.resizeShell(id, cols, rows) }
})

// 初始化 SFTP
ipcMain.handle('sftp-init', async (_event: IpcMainInvokeEvent, id: string) => {
  return await sshManager.initSFTP(id)
})

// 获取文件列表
ipcMain.handle('sftp-list', async (_event: IpcMainInvokeEvent, id: string, remotePath: string) => {
  return await sshManager.listDirectory(id, remotePath)
})

// 创建目录
ipcMain.handle('sftp-mkdir', async (_event: IpcMainInvokeEvent, id: string, remotePath: string) => {
  return await sshManager.createDirectory(id, remotePath)
})

// 删除文件/目录
ipcMain.handle('sftp-delete', async (_event: IpcMainInvokeEvent, id: string, remotePath: string, isDirectory: boolean) => {
  return await sshManager.delete(id, remotePath, isDirectory)
})

// 重命名
ipcMain.handle('sftp-rename', async (_event: IpcMainInvokeEvent, id: string, oldPath: string, newPath: string) => {
  return await sshManager.rename(id, oldPath, newPath)
})

// 下载文件
ipcMain.handle('sftp-download', async (event: IpcMainInvokeEvent, id: string, remotePath: string, localPath: string, resume?: boolean, taskId?: string) => {
  const sender = event.sender
  return await sshManager.downloadFile(id, remotePath, localPath, (transferred, total) => {
    if (!sender.isDestroyed()) {
      sender.send('sftp-transfer-progress', {
        taskId,
        id,
        type: 'download',
        remotePath,
        localPath,
        transferred,
        total,
      })
    }
  }, resume, taskId)
})

// 上传文件
ipcMain.handle('sftp-upload', async (event: IpcMainInvokeEvent, id: string, localPath: string, remotePath: string, resume?: boolean, taskId?: string) => {
  const sender = event.sender
  return await sshManager.uploadFile(id, localPath, remotePath, (transferred, total) => {
    if (!sender.isDestroyed()) {
      sender.send('sftp-transfer-progress', {
        taskId,
        id,
        type: 'upload',
        localPath,
        remotePath,
        transferred,
        total,
      })
    }
  }, resume, taskId)
})

// 取消传输
ipcMain.handle('sftp-abort', async (_event: IpcMainInvokeEvent, taskId: string) => {
  return { success: sshManager.abortTransfer(taskId) }
})

// 获取工作目录
ipcMain.handle('sftp-getcwd', async (_event: IpcMainInvokeEvent, id: string) => {
  return await sshManager.getWorkingDirectory(id)
})

// 修改权限
ipcMain.handle('sftp-chmod', async (_event: IpcMainInvokeEvent, id: string, remotePath: string, mode: string) => {
  return await sshManager.chmod(id, remotePath, mode)
})

// 创建空文件
ipcMain.handle('sftp-touch', async (_event: IpcMainInvokeEvent, id: string, remotePath: string) => {
  return await sshManager.createFile(id, remotePath)
})

// 读取远程文件内容（用于编辑器）
ipcMain.handle('sftp-read-file', async (_event: IpcMainInvokeEvent, id: string, remotePath: string) => {
  return await sshManager.readFileContent(id, remotePath)
})

// 将编辑器内容写回远程文件
ipcMain.handle('sftp-write-file', async (_event: IpcMainInvokeEvent, id: string, remotePath: string, content: string, encoding: string) => {
  return await sshManager.writeFileContent(id, remotePath, content, encoding)
})

// 获取系统监控信息
ipcMain.handle('ssh-get-system-stats', async (_event: IpcMainInvokeEvent, id: string) => {
  return await sshManager.getSystemStats(id)
})

// 在 SSH 连接上执行单条命令（不经过 shell 流）
ipcMain.handle('ssh-exec', async (_event: IpcMainInvokeEvent, id: string, command: string) => {
  return await sshManager.execCommand(id, command)
})

// 通过交互式 shell 获取当前工作目录
ipcMain.handle('ssh-get-shell-cwd', async (_event: IpcMainInvokeEvent, id: string) => {
  return await sshManager.getShellCwd(id)
})

// 通过交互式 shell 获取历史命令
ipcMain.handle('ssh-get-shell-history', async (_event: IpcMainInvokeEvent, id: string, count: number) => {
  return await sshManager.getShellHistory(id, count)
})

// 读取本地文件内容（仅限用户通过对话框选择的文件，带 TTL 自动清理）
const allowedFilePaths = new Map<string, number>() // path → 授权时间戳
const ALLOWED_PATH_TTL = 5 * 60_000 // 5 分钟

// 定期清理过期的路径授权
setInterval(() => {
  const now = Date.now()
  for (const [p, ts] of allowedFilePaths) {
    if (now - ts > ALLOWED_PATH_TTL) {
      allowedFilePaths.delete(p)
    }
  }
}, 60_000)

ipcMain.handle('read-file', async (_event: IpcMainInvokeEvent, filePath: string) => {
  // 安全检查：仅允许读取用户通过文件对话框选择的路径，且未过期
  const authorizedAt = allowedFilePaths.get(filePath)
  if (!authorizedAt || Date.now() - authorizedAt > ALLOWED_PATH_TTL) {
    allowedFilePaths.delete(filePath)
    return { success: false, error: '文件路径未经授权或已过期' }
  }
  try {
    const fs = await import('fs/promises')
    const content = await fs.readFile(filePath, 'utf-8')
    return { success: true, content }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : '读取文件失败' }
  }
})

// 选择本地文件
ipcMain.handle('dialog-open-file', async (event: IpcMainInvokeEvent) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || win.isDestroyed()) {
    return { canceled: true, filePaths: [] }
  }
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    title: '选择文件',
  })
  if (!result.canceled && result.filePaths?.length > 0) {
    const now = Date.now()
    result.filePaths.forEach(p => allowedFilePaths.set(p, now))
  }
  return result
})

// 选择本地文件夹
ipcMain.handle('dialog-open-directory', async (event: IpcMainInvokeEvent) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || win.isDestroyed()) {
    return { canceled: true, filePaths: [] }
  }
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: '选择文件夹',
  })
  return result
})

// 选择保存位置
ipcMain.handle('dialog-save-file', async (event: IpcMainInvokeEvent, defaultPath?: string) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || win.isDestroyed()) {
    return { canceled: true, filePath: '' }
  }
  const result = await dialog.showSaveDialog(win, {
    title: '保存文件',
    defaultPath,
  })
  return result
})

// ==================== 凭据安全存储（safeStorage 加密） ====================

ipcMain.handle('credentials-save', (_event: IpcMainInvokeEvent, serverId: string, credentials: { password?: string; privateKey?: string; passphrase?: string }) => {
  try {
    const data: Record<string, string> = {}
    const canEncrypt = safeStorage.isEncryptionAvailable()
    if (canEncrypt) {
      if (credentials.password) data.password = safeStorage.encryptString(credentials.password).toString('base64')
      if (credentials.privateKey) data.privateKey = safeStorage.encryptString(credentials.privateKey).toString('base64')
      if (credentials.passphrase) data.passphrase = safeStorage.encryptString(credentials.passphrase).toString('base64')
      data._encrypted = '1'
    } else {
      if (credentials.password) data.password = credentials.password
      if (credentials.privateKey) data.privateKey = credentials.privateKey
      if (credentials.passphrase) data.passphrase = credentials.passphrase
    }
    credentialStore.set(serverId, data)
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : '保存凭据失败' }
  }
})

ipcMain.handle('credentials-get', (_event: IpcMainInvokeEvent, serverId: string) => {
  try {
    const stored = credentialStore.get(serverId) as Record<string, string> | undefined
    if (!stored) return { success: true, credentials: {} }

    const creds: Record<string, string> = {}
    if (stored._encrypted === '1' && safeStorage.isEncryptionAvailable()) {
      if (stored.password) creds.password = safeStorage.decryptString(Buffer.from(stored.password, 'base64'))
      if (stored.privateKey) creds.privateKey = safeStorage.decryptString(Buffer.from(stored.privateKey, 'base64'))
      if (stored.passphrase) creds.passphrase = safeStorage.decryptString(Buffer.from(stored.passphrase, 'base64'))
    } else {
      if (stored.password) creds.password = stored.password
      if (stored.privateKey) creds.privateKey = stored.privateKey
      if (stored.passphrase) creds.passphrase = stored.passphrase
    }
    return { success: true, credentials: creds }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : '获取凭据失败' }
  }
})

ipcMain.handle('credentials-delete', (_event: IpcMainInvokeEvent, serverId: string) => {
  credentialStore.delete(serverId as string)
  return { success: true }
})

// ==================== 服务器配置备份 ====================

ipcMain.handle('backup-servers', (_event: IpcMainInvokeEvent, data: { servers: Record<string, unknown>[]; groups: Record<string, unknown>[] }) => {
  backupStore.set('data', data)
  backupStore.set('lastBackup', Date.now())
  return { success: true }
})

ipcMain.handle('restore-servers', () => {
  const data = backupStore.get('data') as { servers: Record<string, unknown>[]; groups: Record<string, unknown>[] } | undefined
  if (data) {
    return { success: true, servers: data.servers, groups: data.groups }
  }
  return { success: false }
})

// ==================== 跨窗口标签迁移 ====================

// 拖拽悬停置顶：拖拽期间轮询光标位置，将光标下方的窗口置顶
// 同时创建跟随光标的悬浮标签预览（跨窗口可见）
let dragHoverTimer: ReturnType<typeof setInterval> | null = null
let dragOverlayTimer: ReturnType<typeof setInterval> | null = null
let dragSourceWinId: number | null = null
let lastRaisedWinId: number | null = null
let dragOverlay: BrowserWindow | null = null

let lastDragOverWinId: number | null = null
let hasLeftSource = false

// 清理所有拖拽状态（tab-drag-hover-end 和窗口崩溃/关闭时共用）
function cleanupDragState() {
  if (dragHoverTimer) {
    clearInterval(dragHoverTimer)
    dragHoverTimer = null
  }
  if (dragOverlayTimer) {
    clearInterval(dragOverlayTimer)
    dragOverlayTimer = null
  }
  if (dragOverlay && !dragOverlay.isDestroyed()) {
    dragOverlay.destroy()
    dragOverlay = null
  }
  if (lastDragOverWinId) {
    for (const w of windows) {
      if (w.id === lastDragOverWinId && !w.isDestroyed()) {
        w.webContents.send('tab-drag-leave')
        break
      }
    }
    lastDragOverWinId = null
  }
  if (dragSourceWinId) {
    for (const w of windows) {
      if (w.id === dragSourceWinId && !w.isDestroyed()) {
        w.setAlwaysOnTop(false)
        break
      }
    }
  }
  dragSourceWinId = null
  lastRaisedWinId = null
  hasLeftSource = false
}

ipcMain.handle('tab-drag-hover-start', (event: IpcMainInvokeEvent, tabName: string) => {
  const sourceWin = BrowserWindow.fromWebContents(event.sender)
  if (!sourceWin) return

  // 清理上一次可能残留的拖拽状态（防止快速连续拖拽时 overlay 泄漏）
  cleanupDragState()

  dragSourceWinId = sourceWin.id
  lastRaisedWinId = null
  lastDragOverWinId = null
  hasLeftSource = false

  // 创建跟随光标的悬浮小窗口（screen-saver 级别，高于源窗口的 floating）
  const escaped = tabName.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))
  dragOverlay = new BrowserWindow({
    width: 180,
    height: 32,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })
  dragOverlay.setAlwaysOnTop(true, 'screen-saver')
  dragOverlay.setIgnoreMouseEvents(true)
  const html = `<body style="margin:0;background:transparent;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui,sans-serif;">
    <div style="display:flex;align-items:center;gap:6px;padding:5px 12px;background:rgba(22,119,255,0.9);border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.2);font-size:12px;color:#fff;white-space:nowrap;max-width:170px;overflow:hidden;text-overflow:ellipsis;">
      <span style="font-size:10px;">⊞</span>${escaped}
    </div></body>`
  dragOverlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

  // 16ms 定位悬浮窗（光标在标签左侧偏中位置，像抓着标签拖动）
  dragOverlayTimer = setInterval(() => {
    if (!dragOverlay || dragOverlay.isDestroyed()) return
    const point = screen.getCursorScreenPoint()
    dragOverlay.setBounds({ x: point.x - 90, y: point.y - 16, width: 180, height: 32 })
    if (!dragOverlay.isVisible()) dragOverlay.showInactive()
  }, 16)

  // 150ms 检测置顶 + 跨窗口拖拽指示器
  dragHoverTimer = setInterval(() => {
    let srcWin: BrowserWindow | undefined
    for (const w of windows) {
      if (w.id === dragSourceWinId && !w.isDestroyed()) { srcWin = w; break }
    }
    const point = screen.getCursorScreenPoint()

    // 判断光标是否在源窗口范围内
    let inSource = false
    if (srcWin) {
      const srcBounds = srcWin.getBounds()
      inSource = point.x >= srcBounds.x && point.x <= srcBounds.x + srcBounds.width &&
          point.y >= srcBounds.y && point.y <= srcBounds.y + srcBounds.height
    }

    // 光标未曾离开源窗口且仍在源窗口内 → 源窗口优先，不检测目标（防止重叠误触发）
    if (inSource && !hasLeftSource) {
      if (srcWin) srcWin.setAlwaysOnTop(false)
      if (lastDragOverWinId) {
        let prevWin: BrowserWindow | undefined
        for (const w of windows) {
          if (w.id === lastDragOverWinId && !w.isDestroyed()) { prevWin = w; break }
        }
        if (prevWin) prevWin.webContents.send('tab-drag-leave')
        lastDragOverWinId = null
      }
      return
    }

    if (!inSource) hasLeftSource = true

    // 光标曾离开过源窗口 → 检查目标窗口（目标优先，解决重叠区域）
    let foundTarget = false
    for (const win of windows) {
      if (win.id === dragSourceWinId || win.isDestroyed() || win.isMinimized() || !win.isVisible()) continue
      const bounds = win.getBounds()
      if (point.x >= bounds.x && point.x <= bounds.x + bounds.width &&
          point.y >= bounds.y && point.y <= bounds.y + bounds.height) {
        if (srcWin) srcWin.setAlwaysOnTop(false)
        if (win.id !== lastRaisedWinId) {
          win.moveTop()
          lastRaisedWinId = win.id
        }
        // 向目标窗口发送光标屏幕坐标，用于显示插入指示器
        win.webContents.send('tab-drag-over', point.x)
        if (lastDragOverWinId && lastDragOverWinId !== win.id) {
          let prevWin: BrowserWindow | undefined
          for (const w of windows) {
            if (w.id === lastDragOverWinId && !w.isDestroyed()) { prevWin = w; break }
          }
          if (prevWin) prevWin.webContents.send('tab-drag-leave')
        }
        lastDragOverWinId = win.id
        foundTarget = true
        break
      }
    }

    if (!foundTarget) {
      // 清除目标窗口指示器
      if (lastDragOverWinId) {
        let prevWin: BrowserWindow | undefined
        for (const w of windows) {
          if (w.id === lastDragOverWinId && !w.isDestroyed()) { prevWin = w; break }
        }
        if (prevWin) prevWin.webContents.send('tab-drag-leave')
        lastDragOverWinId = null
      }

      if (inSource) {
        // 回到源窗口（无目标重叠）→ 置顶源窗口，重置离开标记
        if (srcWin) {
          srcWin.setAlwaysOnTop(false)
          srcWin.moveTop()
        }
        hasLeftSource = false
      } else {
        // 不在任何 SSHTools 窗口上，alwaysOnTop 防止第三方抢焦点
        if (srcWin) srcWin.setAlwaysOnTop(true, 'floating')
      }
      lastRaisedWinId = null
    }
  }, 150)
})

ipcMain.handle('tab-drag-hover-end', () => {
  cleanupDragState()
})

// 标签拖出窗口：创建新窗口或转移到已有窗口
ipcMain.handle('tab-tear-out', async (event: IpcMainInvokeEvent, data: { tabData: Record<string, unknown>; screenX: number; screenY: number }) => {
  const { tabData } = data
  const sourceWin = BrowserWindow.fromWebContents(event.sender)

  // 用 screen.getCursorScreenPoint() 获取真实光标位置，
  // 避免目标窗口 moveTop 后 dragend 坐标不准确的问题
  const point = screen.getCursorScreenPoint()
  const screenX = point.x
  const screenY = point.y

  // 检查光标是否在其他窗口上方
  let targetWin: BrowserWindow | null = null
  for (const win of windows) {
    if (win === sourceWin || win.isDestroyed() || win.isMinimized() || !win.isVisible()) continue
    const bounds = win.getBounds()
    if (screenX >= bounds.x && screenX <= bounds.x + bounds.width &&
        screenY >= bounds.y && screenY <= bounds.y + bounds.height) {
      targetWin = win
      break
    }
  }

  // 光标仍在源窗口上 → 不是跨窗口拖拽，取消操作
  if (!targetWin && sourceWin && !sourceWin.isDestroyed()) {
    const srcBounds = sourceWin.getBounds()
    if (screenX >= srcBounds.x && screenX <= srcBounds.x + srcBounds.width &&
        screenY >= srcBounds.y && screenY <= srcBounds.y + srcBounds.height) {
      return { action: 'none' }
    }
  }

  const connectionId = tabData.connectionId as string | undefined

  if (targetWin) {
    // 转移到已有窗口（附带光标坐标用于计算插入位置）
    if (connectionId) {
      sshManager.setConnectionTarget(connectionId, targetWin.webContents)
    }
    targetWin.webContents.send('tab-received', { ...tabData, _screenX: screenX, _screenY: screenY })
    // 置顶目标窗口并获取焦点
    const tw = targetWin
    setTimeout(() => {
      if (!tw.isDestroyed()) {
        tw.moveTop()
        tw.focus()
      }
    }, 100)
    return { action: 'transferred', windowId: targetWin.id }
  } else {
    // 创建新窗口
    const newWin = createWindow()
    pendingTabData.set(newWin.id, tabData)

    // 将新窗口定位到鼠标位置附近
    const winBounds = newWin.getBounds()
    newWin.setBounds({
      x: Math.max(0, screenX - Math.floor(winBounds.width / 2)),
      y: Math.max(0, screenY - 30),
      width: winBounds.width,
      height: winBounds.height,
    })
    // 立即显示并聚焦，避免拖拽结束到窗口显示之间其他应用被 Windows 置顶
    newWin.show()
    newWin.focus()

    if (connectionId) {
      sshManager.setConnectionTarget(connectionId, newWin.webContents)
    }
    return { action: 'created', windowId: newWin.id }
  }
})

// 新窗口获取初始标签数据
ipcMain.handle('get-init-tabs', (event: IpcMainInvokeEvent) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return null
  const data = pendingTabData.get(win.id)
  pendingTabData.delete(win.id)
  return data || null
})

// 应用准备就绪
app.whenReady().then(() => {
  applyTheme(getInitialTheme())
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 关闭所有窗口时退出应用（macOS除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 应用退出前清理所有 SSH 连接
app.on('before-quit', () => {
  sshManager.disconnectAll()
})