import { contextBridge, ipcRenderer } from 'electron'

// 暴露给渲染进程的API
contextBridge.exposeInMainWorld('electronAPI', {
  // 主题相关
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: (theme: 'light' | 'dark' | 'system') => ipcRenderer.invoke('set-theme', theme),
  getSystemTheme: () => ipcRenderer.invoke('get-system-theme'),
  onSystemThemeChanged: (callback: (theme: 'light' | 'dark') => void) => {
    const handler = (_event: any, theme: 'light' | 'dark') => callback(theme)
    ipcRenderer.on('system-theme-changed', handler)
    return () => ipcRenderer.removeListener('system-theme-changed', handler)
  },

  // 设置同步（跨窗口广播）
  broadcastSettings: (payload: { type: string; data: unknown }) =>
    ipcRenderer.invoke('broadcast-settings', payload),
  onSettingsSync: (callback: (payload: { type: string; data: unknown }) => void) => {
    const handler = (_event: any, payload: { type: string; data: unknown }) => callback(payload)
    ipcRenderer.on('settings-sync', handler)
    return () => ipcRenderer.removeListener('settings-sync', handler)
  },

  // 窗口控制
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  // 获取平台信息
  getPlatform: () => ipcRenderer.invoke('get-platform'),

  // 打开外部链接
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),

  // 窗口状态变化
  onWindowMaximized: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('window-maximized', handler)
    return () => ipcRenderer.removeListener('window-maximized', handler)
  },
  onWindowUnmaximized: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('window-unmaximized', handler)
    return () => ipcRenderer.removeListener('window-unmaximized', handler)
  },

  // ==================== SSH 相关 ====================
  
  // SSH 连接
  sshConnect: (config: {
    id: string
    host: string
    port: number
    username: string
    password?: string
    privateKey?: string
    passphrase?: string
  }) => ipcRenderer.invoke('ssh-connect', config),

  // SSH 断开
  sshDisconnect: (id: string) => ipcRenderer.invoke('ssh-disconnect', id),

  // 检查连接状态
  sshIsConnected: (id: string) => ipcRenderer.invoke('ssh-is-connected', id),

  // 启动 Shell
  sshStartShell: (id: string) => ipcRenderer.invoke('ssh-start-shell', id),

  // 向终端写入数据
  sshWrite: (id: string, data: string) => ipcRenderer.invoke('ssh-write', id, data),

  // 调整终端大小
  sshResize: (id: string, cols: number, rows: number) => 
    ipcRenderer.invoke('ssh-resize', id, cols, rows),

  // SSH 事件监听 - 返回清理函数
  onSSHConnected: (callback: (data: { id: string }) => void) => {
    const handler = (_event: any, data: { id: string }) => callback(data)
    ipcRenderer.on('ssh-connected', handler)
    return () => ipcRenderer.removeListener('ssh-connected', handler)
  },
  onSSHDisconnected: (callback: (data: { id: string }) => void) => {
    const handler = (_event: any, data: { id: string }) => callback(data)
    ipcRenderer.on('ssh-disconnected', handler)
    return () => ipcRenderer.removeListener('ssh-disconnected', handler)
  },
  onSSHError: (callback: (data: { id: string; error: string }) => void) => {
    const handler = (_event: any, data: { id: string; error: string }) => callback(data)
    ipcRenderer.on('ssh-error', handler)
    return () => ipcRenderer.removeListener('ssh-error', handler)
  },
  onSSHData: (callback: (data: { id: string; data: string }) => void) => {
    const handler = (_event: any, data: { id: string; data: string }) => callback(data)
    ipcRenderer.on('ssh-data', handler)
    return () => ipcRenderer.removeListener('ssh-data', handler)
  },
  onSSHShellClosed: (callback: (data: { id: string }) => void) => {
    const handler = (_event: any, data: { id: string }) => callback(data)
    ipcRenderer.on('ssh-shell-closed', handler)
    return () => ipcRenderer.removeListener('ssh-shell-closed', handler)
  },

  // ==================== SFTP 相关 ====================

  // 初始化 SFTP
  sftpInit: (id: string) => ipcRenderer.invoke('sftp-init', id),

  // 获取文件列表
  sftpList: (id: string, remotePath: string) => 
    ipcRenderer.invoke('sftp-list', id, remotePath),

  // 创建目录
  sftpMkdir: (id: string, remotePath: string) => 
    ipcRenderer.invoke('sftp-mkdir', id, remotePath),

  // 删除文件/目录
  sftpDelete: (id: string, remotePath: string, isDirectory: boolean) => 
    ipcRenderer.invoke('sftp-delete', id, remotePath, isDirectory),

  // 重命名
  sftpRename: (id: string, oldPath: string, newPath: string) => 
    ipcRenderer.invoke('sftp-rename', id, oldPath, newPath),

  // 下载文件
  sftpDownload: (id: string, remotePath: string, localPath: string, resume?: boolean, taskId?: string) =>
    ipcRenderer.invoke('sftp-download', id, remotePath, localPath, resume, taskId),

  // 上传文件
  sftpUpload: (id: string, localPath: string, remotePath: string, resume?: boolean, taskId?: string) =>
    ipcRenderer.invoke('sftp-upload', id, localPath, remotePath, resume, taskId),

  // 取消传输
  sftpAbort: (taskId: string) =>
    ipcRenderer.invoke('sftp-abort', taskId),

  // 获取工作目录
  sftpGetcwd: (id: string) => ipcRenderer.invoke('sftp-getcwd', id),

  // 修改权限
  sftpChmod: (id: string, remotePath: string, mode: string) =>
    ipcRenderer.invoke('sftp-chmod', id, remotePath, mode),

  // 创建空文件
  sftpTouch: (id: string, remotePath: string) =>
    ipcRenderer.invoke('sftp-touch', id, remotePath),

  // 读取远程文件内容（用于编辑器）
  sftpReadFile: (id: string, remotePath: string) =>
    ipcRenderer.invoke('sftp-read-file', id, remotePath),

  // 写入远程文件内容（编辑器保存）
  sftpWriteFile: (id: string, remotePath: string, content: string, encoding: string) =>
    ipcRenderer.invoke('sftp-write-file', id, remotePath, content, encoding),

  // 获取系统监控信息
  sshGetSystemStats: (id: string) => ipcRenderer.invoke('ssh-get-system-stats', id),

  // 在 SSH 连接上执行单条命令
  sshExec: (id: string, command: string) => ipcRenderer.invoke('ssh-exec', id, command),

  // 通过交互式 shell 获取当前工作目录
  sshGetShellCwd: (id: string) => ipcRenderer.invoke('ssh-get-shell-cwd', id),

  // 通过交互式 shell 获取历史命令
  sshGetShellHistory: (id: string, count?: number) => ipcRenderer.invoke('ssh-get-shell-history', id, count || 200),

  // 传输进度监听
  onSFTPTransferProgress: (callback: (data: {
    taskId?: string
    id: string
    type: 'upload' | 'download'
    localPath: string
    remotePath: string
    transferred: number
    total: number
  }) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('sftp-transfer-progress', handler)
    return () => ipcRenderer.removeListener('sftp-transfer-progress', handler)
  },

  // ==================== 对话框 ====================

  // 读取本地文件内容
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),

  // 选择文件
  dialogOpenFile: () => ipcRenderer.invoke('dialog-open-file'),

  // 选择文件夹
  dialogOpenDirectory: () => ipcRenderer.invoke('dialog-open-directory'),

  // 保存文件对话框
  dialogSaveFile: (defaultPath?: string) =>
    ipcRenderer.invoke('dialog-save-file', defaultPath),

  // ==================== 凭据安全存储 ====================
  credentialsSave: (serverId: string, credentials: { password?: string; privateKey?: string; passphrase?: string }) =>
    ipcRenderer.invoke('credentials-save', serverId, credentials),
  credentialsGet: (serverId: string) =>
    ipcRenderer.invoke('credentials-get', serverId),
  credentialsDelete: (serverId: string) =>
    ipcRenderer.invoke('credentials-delete', serverId),

  // ==================== 服务器配置备份 ====================
  backupServers: (data: { servers: any[]; groups: any[] }) =>
    ipcRenderer.invoke('backup-servers', data),
  restoreServers: () =>
    ipcRenderer.invoke('restore-servers'),

  // ==================== 跨窗口标签迁移 ====================

  // 拖拽悬停置顶（拖拽期间自动将光标下方窗口置顶）
  tabDragHoverStart: (tabName: string) => ipcRenderer.invoke('tab-drag-hover-start', tabName),
  tabDragHoverEnd: () => ipcRenderer.invoke('tab-drag-hover-end'),

  // 标签拖出窗口
  tabTearOut: (data: { tabData: Record<string, unknown>; screenX: number; screenY: number }) =>
    ipcRenderer.invoke('tab-tear-out', data),

  // 获取新窗口的初始标签数据
  getInitTabs: () =>
    ipcRenderer.invoke('get-init-tabs'),

  // 监听标签从其他窗口转入
  onTabReceived: (callback: (tabData: Record<string, unknown>) => void) => {
    const handler = (_event: any, tabData: Record<string, unknown>) => callback(tabData)
    ipcRenderer.on('tab-received', handler)
    return () => ipcRenderer.removeListener('tab-received', handler)
  },

  // 监听跨窗口拖拽指示器（主进程轮询时通知目标窗口显示插入位置）
  onTabDragOver: (callback: (screenX: number) => void) => {
    const handler = (_event: any, screenX: number) => callback(screenX)
    ipcRenderer.on('tab-drag-over', handler)
    return () => ipcRenderer.removeListener('tab-drag-over', handler)
  },

  onTabDragLeave: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('tab-drag-leave', handler)
    return () => ipcRenderer.removeListener('tab-drag-leave', handler)
  },
})