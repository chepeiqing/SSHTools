import { app, BrowserWindow, ipcMain, nativeTheme, shell, dialog, IpcMainInvokeEvent, safeStorage } from 'electron'
import path from 'path'
import Store from 'electron-store'
import { sshManager, SSHConnectionConfig } from './sshManager'

// 初始化存储
const store = new Store()
const credentialStore = new Store({ name: 'credentials' })
const backupStore = new Store({ name: 'server-backup' })

// 主窗口引用
let mainWindow: BrowserWindow | null = null

function createWindow() {
  const isMac = process.platform === 'darwin'
  const isDev = process.env.NODE_ENV === 'development'

  // 图标路径：开发环境用项目目录，生产环境用 extraResources
  const iconPath = isDev
    ? path.join(__dirname, '../build/icon.png')
    : path.join(process.resourcesPath, 'icon.png')

  mainWindow = new BrowserWindow({
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
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // 设置 SSH 管理器的主窗口引用
  sshManager.setMainWindow(mainWindow)

  // 开发环境加载本地服务器
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // 外部链接用默认浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // 发送窗口最大化/还原事件到渲染进程
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window-maximized')
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window-unmaximized')
  })
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

ipcMain.handle('set-theme', (_event: IpcMainInvokeEvent, theme: 'light' | 'dark' | 'system') => {
  applyTheme(theme)
  return true
})

ipcMain.handle('get-system-theme', () => {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
})

// 窗口控制
ipcMain.handle('window-minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

ipcMain.handle('window-close', () => {
  mainWindow?.close()
})

ipcMain.handle('window-is-maximized', () => {
  return mainWindow?.isMaximized()
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

// 监听系统主题变化
nativeTheme.on('updated', () => {
  mainWindow?.webContents.send('system-theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
})

// ==================== SSH 相关 IPC 处理 ====================

// SSH 连接
ipcMain.handle('ssh-connect', async (_event: IpcMainInvokeEvent, config: SSHConnectionConfig) => {
  return await sshManager.connect(config)
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
ipcMain.handle('ssh-start-shell', async (_event: IpcMainInvokeEvent, id: string) => {
  return await sshManager.startShell(id)
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
ipcMain.handle('sftp-download', async (_event: IpcMainInvokeEvent, id: string, remotePath: string, localPath: string, resume?: boolean) => {
  return await sshManager.downloadFile(id, remotePath, localPath, (transferred, total) => {
    mainWindow?.webContents.send('sftp-transfer-progress', {
      id,
      type: 'download',
      remotePath,
      localPath,
      transferred,
      total,
    })
  }, resume)
})

// 上传文件
ipcMain.handle('sftp-upload', async (_event: IpcMainInvokeEvent, id: string, localPath: string, remotePath: string, resume?: boolean) => {
  return await sshManager.uploadFile(id, localPath, remotePath, (transferred, total) => {
    mainWindow?.webContents.send('sftp-transfer-progress', {
      id,
      type: 'upload',
      localPath,
      remotePath,
      transferred,
      total,
    })
  }, resume)
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
ipcMain.handle('dialog-open-file', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { canceled: true, filePaths: [] }
  }
  const result = await dialog.showOpenDialog(mainWindow, {
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
ipcMain.handle('dialog-open-directory', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { canceled: true, filePaths: [] }
  }
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择文件夹',
  })
  return result
})

// 选择保存位置
ipcMain.handle('dialog-save-file', async (_event: IpcMainInvokeEvent, defaultPath?: string) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { canceled: true, filePath: '' }
  }
  const result = await dialog.showSaveDialog(mainWindow, {
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