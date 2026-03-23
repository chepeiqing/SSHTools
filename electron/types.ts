// Electron API 类型声明

// SSH 连接配置
export interface SSHConnectionConfig {
  id: string
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  passphrase?: string
}

// 文件信息
export interface FileInfo {
  name: string
  type: 'file' | 'folder' | 'link'
  size: number
  modifiedTime: string
  permissions: string
  owner: string
  group: string
}

// 传输进度信息
export interface TransferProgress {
  id: string
  type: 'upload' | 'download'
  localPath: string
  remotePath: string
  transferred: number
  total: number
}

// 系统监控信息
export interface SystemStats {
  cpuUsage: number
  memUsed: number
  memTotal: number
  memPercent: number
  diskUsed: number
  diskTotal: number
  diskPercent: number
  uptime: string
  osInfo: string
  hostname: string
  loadAvg: string
  networkIP: string
  loginUsers: number
  processCount: number
  topProcesses: { pid: string; user: string; cpu: string; mem: string; command: string; fullCommand: string }[]
}

// Electron API 接口
export interface ElectronAPI {
  // 主题相关
  getTheme: () => Promise<'light' | 'dark' | 'system'>
  setTheme: (theme: 'light' | 'dark' | 'system') => Promise<boolean>
  getSystemTheme: () => Promise<'light' | 'dark'>
  onSystemThemeChanged: (callback: (theme: 'light' | 'dark') => void) => () => void

  // 窗口控制
  minimizeWindow: () => Promise<void>
  maximizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
  isMaximized: () => Promise<boolean>
  getPlatform: () => Promise<string>
  openExternal: (url: string) => Promise<void>
  onWindowMaximized: (callback: () => void) => () => void
  onWindowUnmaximized: (callback: () => void) => () => void

  // SSH 相关
  sshConnect: (config: SSHConnectionConfig) => Promise<{ success: boolean; error?: string }>
  sshDisconnect: (id: string) => Promise<{ success: boolean }>
  sshIsConnected: (id: string) => Promise<boolean>
  sshStartShell: (id: string) => Promise<{ success: boolean; reused?: boolean; buffer?: string; error?: string }>
  sshWrite: (id: string, data: string) => Promise<{ success: boolean }>
  sshResize: (id: string, cols: number, rows: number) => Promise<{ success: boolean }>

  // SSH 事件监听 - 返回清理函数
  onSSHConnected: (callback: (data: { id: string }) => void) => () => void
  onSSHDisconnected: (callback: (data: { id: string }) => void) => () => void
  onSSHError: (callback: (data: { id: string; error: string }) => void) => () => void
  onSSHData: (callback: (data: { id: string; data: string }) => void) => () => void
  onSSHShellClosed: (callback: (data: { id: string }) => void) => () => void

  // SFTP 相关
  sftpInit: (id: string) => Promise<{ success: boolean; error?: string }>
  sftpList: (id: string, remotePath: string) => Promise<{ success: boolean; files?: FileInfo[]; error?: string }>
  sftpMkdir: (id: string, remotePath: string) => Promise<{ success: boolean; error?: string }>
  sftpDelete: (id: string, remotePath: string, isDirectory: boolean) => Promise<{ success: boolean; error?: string }>
  sftpRename: (id: string, oldPath: string, newPath: string) => Promise<{ success: boolean; error?: string }>
  sftpDownload: (id: string, remotePath: string, localPath: string, resume?: boolean) => Promise<{ success: boolean; error?: string }>
  sftpUpload: (id: string, localPath: string, remotePath: string, resume?: boolean) => Promise<{ success: boolean; error?: string }>
  sftpGetcwd: (id: string) => Promise<{ success: boolean; path?: string; error?: string }>
  sftpChmod: (id: string, remotePath: string, mode: string) => Promise<{ success: boolean; error?: string }>
  sftpTouch: (id: string, remotePath: string) => Promise<{ success: boolean; error?: string }>
  sftpReadFile: (id: string, remotePath: string) => Promise<{ success: boolean; content?: string; encoding?: string; size?: number; error?: string }>
  sftpWriteFile: (id: string, remotePath: string, content: string, encoding: string) => Promise<{ success: boolean; error?: string }>

  // 系统监控
  sshGetSystemStats: (id: string) => Promise<{ success: boolean; stats?: SystemStats; error?: string }>

  // 执行单条命令
  sshExec: (id: string, command: string) => Promise<{ success: boolean; output?: string; error?: string }>

  // 通过交互式 shell 获取当前工作目录
  sshGetShellCwd: (id: string) => Promise<{ success: boolean; path?: string; error?: string }>

  // 通过交互式 shell 获取历史命令
  sshGetShellHistory: (id: string, count?: number) => Promise<{ success: boolean; output?: string; error?: string }>

  // SFTP 事件监听 - 返回清理函数
  onSFTPTransferProgress: (callback: (data: TransferProgress) => void) => () => void

  // 对话框
  dialogOpenFile: () => Promise<{ canceled: boolean; filePaths: string[] }>
  dialogOpenDirectory: () => Promise<{ canceled: boolean; filePaths: string[] }>
  dialogSaveFile: (defaultPath?: string) => Promise<{ canceled: boolean; filePath?: string }>

  // 文件读取
  readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>

  // 凭据安全存储
  credentialsSave: (serverId: string, credentials: { password?: string; privateKey?: string; passphrase?: string }) => Promise<{ success: boolean; error?: string }>
  credentialsGet: (serverId: string) => Promise<{ success: boolean; credentials?: { password?: string; privateKey?: string; passphrase?: string }; error?: string }>
  credentialsDelete: (serverId: string) => Promise<{ success: boolean }>

  // 服务器配置备份
  backupServers: (data: { servers: Record<string, unknown>[]; groups: Record<string, unknown>[] }) => Promise<{ success: boolean }>
  restoreServers: () => Promise<{ success: boolean; servers?: Record<string, unknown>[]; groups?: Record<string, unknown>[] }>

  // 跨窗口标签迁移
  tabDragHoverStart: () => Promise<void>
  tabDragHoverEnd: () => Promise<void>
  tabTearOut: (data: { tabData: Record<string, unknown>; screenX: number; screenY: number }) => Promise<{ action: string; windowId: number }>
  getInitTabs: () => Promise<Record<string, unknown> | null>
  onTabReceived: (callback: (tabData: Record<string, unknown>) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}