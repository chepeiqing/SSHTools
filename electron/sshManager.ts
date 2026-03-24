import { Client, ClientChannel, ConnectConfig, SFTPWrapper } from 'ssh2'
import { BrowserWindow, WebContents } from 'electron'
import path from 'path'
import fs from 'fs'
import { stat as fsStat } from 'fs/promises'

export interface SSHConnectionConfig {
  id: string
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  passphrase?: string
}

export interface FileInfo {
  name: string
  type: 'file' | 'folder' | 'link'
  size: number
  modifiedTime: string
  permissions: string
  owner: string
  group: string
}

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

// 活跃传输（用于取消）
interface ActiveTransfer {
  aborted: boolean
  readStream?: fs.ReadStream
  writeStream?: fs.WriteStream | SFTPWrapper
  tempPath?: string  // 临时文件路径（上传时使用）
  sftp?: SFTPWrapper // SFTP 连接（用于删除临时文件）
  connectionId?: string
}

// SSH 连接管理器
class SSHManager {
  private connections: Map<string, Client> = new Map()
  private shellStreams: Map<string, ClientChannel> = new Map()
  private sftpConnections: Map<string, SFTPWrapper> = new Map()
  // 每个连接对应的渲染进程（多窗口支持）
  private connectionTargets: Map<string, WebContents> = new Map()
  // 活跃传输（taskId -> ActiveTransfer）
  private activeTransfers: Map<string, ActiveTransfer> = new Map()
  // 所有已注册的窗口（用于广播）
  private windowRegistry: Set<WebContents> = new Set()
  // 临时屏蔽 shell 输出转发到终端（获取 CWD 时使用）
  private suppressShellOutput: Set<string> = new Set()
  // shell 输出缓冲区（用于跨窗口迁移时回放终端内容）
  private shellBuffers: Map<string, string> = new Map()
  private static MAX_SHELL_BUFFER = 100 * 1024 // 100KB
  // SSH banner 消息（认证阶段服务器公告）
  private sshBanners: Map<string, string> = new Map()
  // shell 初始输出阶段标志（缓冲 MOTD 等初始数据，不走 sendToConnection）
  private shellInitialPhase: Set<string> = new Set()
  // 连接创建时间，用于清理残留的测试连接
  private connectionCreatedAt: Map<string, number> = new Map()
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    // 每 60 秒检查一次，清理超过 5 分钟无 shell 的测试连接
    this.cleanupTimer = setInterval(() => this.cleanupStaleConnections(), 60_000)
  }

  private cleanupStaleConnections() {
    const now = Date.now()
    const TTL = 5 * 60_000 // 5 分钟
    for (const [id, createdAt] of this.connectionCreatedAt) {
      if (now - createdAt > TTL && !this.shellStreams.has(id) && !this.sftpConnections.has(id)) {
        this.disconnect(id)
        this.connectionCreatedAt.delete(id)
      }
    }
  }

  setMainWindow(_window: BrowserWindow) {
    // 兼容旧调用（由 registerWindow 替代）
  }

  // 注册窗口（新建窗口时调用）
  registerWindow(wc: WebContents) {
    this.windowRegistry.add(wc)
  }

  // 注销窗口（窗口关闭时调用）
  unregisterWindow(wc: WebContents) {
    this.windowRegistry.delete(wc)
    // 清理指向此窗口的连接目标
    for (const [id, target] of this.connectionTargets) {
      if (target === wc) {
        this.connectionTargets.delete(id)
      }
    }
  }

  // 设置连接目标窗口（跨窗口标签迁移时调用）
  setConnectionTarget(connectionId: string, wc: WebContents) {
    this.connectionTargets.set(connectionId, wc)
  }

  // 验证连接配置
  private validateConfig(config: SSHConnectionConfig): string | null {
    if (!config.id || typeof config.id !== 'string') {
      return '连接 ID 无效'
    }
    if (!config.host || typeof config.host !== 'string' || config.host.trim() === '') {
      return '主机地址不能为空'
    }
    if (!config.port || config.port < 1 || config.port > 65535) {
      return '端口号必须在 1-65535 之间'
    }
    if (!config.username || typeof config.username !== 'string' || config.username.trim() === '') {
      return '用户名不能为空'
    }
    if (!config.password && !config.privateKey) {
      return '必须提供密码或私钥'
    }
    return null
  }

  // 验证远程路径安全性（防止路径注入）
  private validateRemotePath(remotePath: string): string | null {
    if (!remotePath || typeof remotePath !== 'string') {
      return '路径不能为空'
    }
    if (remotePath.includes('\0')) {
      return '路径包含非法字符'
    }
    // 拦截路径穿越：禁止 .. 组件
    const segments = remotePath.split('/')
    for (const seg of segments) {
      if (seg === '..') {
        return '路径不允许包含 ..'
      }
    }
    return null
  }

  // 验证本地路径安全性（防止异常路径）
  private validateLocalPath(localPath: string): string | null {
    if (!localPath || typeof localPath !== 'string') {
      return '本地路径不能为空'
    }
    if (localPath.includes('\0')) {
      return '路径包含非法字符'
    }
    return null
  }

  // 建立 SSH 连接
  connect(config: SSHConnectionConfig, sender?: WebContents): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const validationError = this.validateConfig(config)
      if (validationError) {
        resolve({ success: false, error: validationError })
        return
      }

      const { id, host, port, username, password, privateKey, passphrase } = config

      // 如果已存在连接，先关闭
      if (this.connections.has(id)) {
        this.disconnect(id)
      }

      const conn = new Client()
      let resolved = false

      const safeResolve = (result: { success: boolean; error?: string }) => {
        if (!resolved) {
          resolved = true
          resolve(result)
        }
      }

      const sshConfig: ConnectConfig = {
        host: host.trim(),
        port,
        username: username.trim(),
        readyTimeout: 30000,
        keepaliveInterval: 30000,
      }

      if (password) {
        sshConfig.password = password
      } else if (privateKey) {
        sshConfig.privateKey = privateKey
        if (passphrase) {
          sshConfig.passphrase = passphrase
        }
      }

      conn.on('ready', () => {
        this.connections.set(id, conn)
        this.connectionCreatedAt.set(id, Date.now())
        // 绑定连接到发起请求的窗口
        if (sender && !sender.isDestroyed()) {
          this.connectionTargets.set(id, sender)
        }
        this.sendToConnection(id, 'ssh-connected', { id })
        safeResolve({ success: true })
      })

      conn.on('error', (err) => {
        this.connections.delete(id)
        this.shellStreams.delete(id)
        this.sendToConnection(id, 'ssh-error', { id, error: err.message })
        safeResolve({ success: false, error: err.message })
      })

      conn.on('close', () => {
        this.connections.delete(id)
        this.shellStreams.delete(id)
        this.sftpConnections.delete(id)
        this.sendToConnection(id, 'ssh-disconnected', { id })
        this.connectionTargets.delete(id)
      })

      conn.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
        if (password && prompts.length > 0) {
          // 对每个 prompt 发送密码（通常只有一个）
          finish(prompts.map(() => password))
        } else {
          finish([])
        }
      })

      // 捕获 SSH 认证阶段的 banner 消息（如服务器公告、安全提示）
      conn.on('banner', (message: string) => {
        this.sshBanners.set(id, message)
      })

      try {
        conn.connect(sshConfig)
      } catch (err: unknown) {
        safeResolve({ success: false, error: err instanceof Error ? err.message : '连接失败' })
      }
    })
  }

  // 断开连接
  disconnect(id: string) {
    const target = this.connectionTargets.get(id)
    if (target && !target.isDestroyed()) {
      target.send('ssh-disconnected', { id })
    }

    // 先关闭 shell stream
    const stream = this.shellStreams.get(id)
    if (stream) {
      try { stream.close() } catch { /* ignore */ }
      this.shellStreams.delete(id)
    }
    this.shellBuffers.delete(id)
    this.sshBanners.delete(id)
    this.shellInitialPhase.delete(id)

    // 关闭 SFTP
    const sftp = this.sftpConnections.get(id)
    if (sftp) {
      try { sftp.end() } catch { /* ignore */ }
      this.sftpConnections.delete(id)
    }

    // 关闭 SSH 连接
    const conn = this.connections.get(id)
    if (conn) {
      try { conn.end() } catch { /* ignore */ }
      this.connections.delete(id)
    }

    this.connectionCreatedAt.delete(id)
    this.connectionTargets.delete(id)
  }

  // 检查连接状态
  isConnected(id: string): boolean {
    return this.connections.has(id)
  }

  // 启动 Shell
  startShell(id: string): Promise<{ success: boolean; reused?: boolean; buffer?: string; error?: string }> {
    return new Promise((resolve) => {
      const conn = this.connections.get(id)
      if (!conn) {
        resolve({ success: false, error: '连接不存在' })
        return
      }

      // 如果已有 shell stream，直接复用（跨窗口迁移时保留会话）
      if (this.shellStreams.has(id)) {
        resolve({ success: true, reused: true, buffer: this.shellBuffers.get(id) || '' })
        return
      }

      // 标记初始缓冲阶段：shell 打开后短暂缓冲，不走 sendToConnection
      this.shellInitialPhase.add(id)

      // 通过独立 exec 通道获取 MOTD 和登录信息（部分服务器 sshd 配置 PrintMotd=no，
      // PAM 对 ssh2 库不生效，需要主动读取）
      const motdPromise = new Promise<string>((motdResolve) => {
        conn.exec(
          'cat /etc/motd 2>/dev/null;' +
          'for f in /etc/motd.d/*; do [ -f "$f" ] && cat "$f" 2>/dev/null; done;' +
          'cat /run/motd.dynamic 2>/dev/null',
          (execErr, execStream) => {
            if (execErr) { motdResolve(''); return }
            let output = ''
            execStream.on('data', (d: Buffer) => { output += d.toString('utf-8') })
            execStream.on('close', () => motdResolve(output))
            setTimeout(() => motdResolve(output), 2000)
          }
        )
      })

      const loginInfoPromise = new Promise<string>((loginResolve) => {
        conn.exec(
          'faillog -u $(whoami) 2>/dev/null | tail -1',
          (execErr, execStream) => {
            if (execErr) { loginResolve(''); return }
            let output = ''
            execStream.on('data', (d: Buffer) => { output += d.toString('utf-8') })
            execStream.on('close', () => {
              // 只保留失败登录提示（Last login 由 shell 自己显示）
              const faillogLine = output.trim()
              if (faillogLine && !faillogLine.startsWith('Login') && !faillogLine.startsWith('登录')) {
                const failMatch = faillogLine.match(/\S+\s+(\d+)/)
                if (failMatch && parseInt(failMatch[1]) > 0) {
                  loginResolve(`There were ${failMatch[1]} failed login attempts since the last successful login.`)
                  return
                }
              }
              loginResolve('')
            })
            setTimeout(() => loginResolve(''), 2000)
          }
        )
      })

      conn.shell({
        term: 'xterm-256color',
        cols: 80,
        rows: 24,
      }, (err, stream) => {
        if (err) {
          this.shellInitialPhase.delete(id)
          resolve({ success: false, error: err.message })
          return
        }

        // 接收终端数据并发送到渲染进程
        stream.on('data', (data: Buffer) => {
          if (!this.suppressShellOutput.has(id)) {
            const str = data.toString('utf-8')
            // 累积到缓冲区（迁移时回放）
            let buf = this.shellBuffers.get(id) || ''
            buf += str
            if (buf.length > SSHManager.MAX_SHELL_BUFFER) {
              buf = buf.slice(-SSHManager.MAX_SHELL_BUFFER)
            }
            this.shellBuffers.set(id, buf)
            // 初始阶段只缓冲，不转发（由 resolve 返回的 buffer 统一写入终端）
            if (!this.shellInitialPhase.has(id)) {
              this.sendToConnection(id, 'ssh-data', { id, data: str })
            }
          }
        })

        stream.on('close', () => {
          this.shellStreams.delete(id)
          this.shellBuffers.delete(id)
          this.shellInitialPhase.delete(id)
          this.sendToConnection(id, 'ssh-shell-closed', { id })
          // Shell 关闭后主动断开 SSH 连接（如超时 auto-logout），
          // 触发 ssh-disconnected 事件，使终端能通过回车重连
          this.disconnect(id)
        })

        stream.stderr.on('data', (data: Buffer) => {
          if (!this.suppressShellOutput.has(id)) {
            const str = data.toString('utf-8')
            let buf = this.shellBuffers.get(id) || ''
            buf += str
            if (buf.length > SSHManager.MAX_SHELL_BUFFER) {
              buf = buf.slice(-SSHManager.MAX_SHELL_BUFFER)
            }
            this.shellBuffers.set(id, buf)
            if (!this.shellInitialPhase.has(id)) {
              this.sendToConnection(id, 'ssh-data', { id, data: str })
            }
          }
        })

        // 使用独立 Map 存储 stream，避免在 Client 上挂载私有属性
        this.shellStreams.set(id, stream)

        // 等待 shell 初始输出 + MOTD exec 完成
        const shellWait = new Promise<void>((r) => setTimeout(r, 300))
        Promise.all([motdPromise, loginInfoPromise, shellWait]).then(([motd, loginInfo]) => {
          this.shellInitialPhase.delete(id)
          const banner = this.sshBanners.get(id) || ''
          const shellBuffer = this.shellBuffers.get(id) || ''
          // exec 通道无 PTY，\n 不会自动转为 \r\n，需手动转换以防 xterm 阶梯显示
          const toCRLF = (s: string) => s.replace(/\r?\n/g, '\r\n')
          // 拼接：banner + motd + 登录信息 + shell 原始输出
          let prefix = ''
          if (banner) prefix += toCRLF(banner)
          if (motd.trim()) prefix += toCRLF(motd.trimEnd()) + '\r\n'
          if (loginInfo.trim()) prefix += toCRLF(loginInfo.trimEnd()) + '\r\n\r\n'
          resolve({
            success: true,
            buffer: prefix + shellBuffer,
          })
        })
      })
    })
  }

  // 向终端发送数据
  writeToShell(id: string, data: string): boolean {
    const stream = this.shellStreams.get(id)
    if (stream) {
      stream.write(data)
      return true
    }
    return false
  }

  // 调整终端大小
  resizeShell(id: string, cols: number, rows: number): boolean {
    const stream = this.shellStreams.get(id)
    if (stream) {
      const safeCols = Math.max(1, Math.min(500, Math.floor(cols)))
      const safeRows = Math.max(1, Math.min(200, Math.floor(rows)))
      stream.setWindow(safeRows, safeCols, 480, 640)
      return true
    }
    return false
  }

  // 初始化 SFTP
  initSFTP(id: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      // 如果已有 SFTP 连接，直接返回成功
      if (this.sftpConnections.has(id)) {
        resolve({ success: true })
        return
      }

      const conn = this.connections.get(id)
      if (!conn) {
        resolve({ success: false, error: 'SSH 连接不存在' })
        return
      }

      conn.sftp((err, sftp) => {
        if (err) {
          resolve({ success: false, error: err.message })
          return
        }

        this.sftpConnections.set(id, sftp)
        resolve({ success: true })
      })
    })
  }

  // 获取文件列表
  async listDirectory(id: string, remotePath: string): Promise<{ success: boolean; files?: FileInfo[]; error?: string }> {
    const pathError = this.validateRemotePath(remotePath)
    if (pathError) {
      return { success: false, error: pathError }
    }

    const sftp = this.sftpConnections.get(id)
    if (!sftp) {
      return { success: false, error: 'SFTP 连接不存在' }
    }

    return new Promise((resolve) => {
      sftp.readdir(remotePath, async (err, list) => {
        if (err) {
          resolve({ success: false, error: err.message })
          return
        }

        // 获取文件列表中的所有uid和gid
        const uidSet = new Set<number>()
        const gidSet = new Set<number>()
        list.forEach(item => {
          uidSet.add(item.attrs.uid)
          gidSet.add(item.attrs.gid)
        })

        // 构建用户名和组名映射
        const userMap = new Map<number, string>()
        const groupMap = new Map<number, string>()

        // 获取用户名映射（对 uid/gid 进行严格数字校验，防止命令注入）
        if (uidSet.size > 0) {
          const safeUids = Array.from(uidSet).filter(v => Number.isFinite(v) && v >= 0 && v === Math.floor(v))
          if (safeUids.length > 0) {
            const uidList = safeUids.join(',')
            const passwdResult = await this.execCommand(id, `getent passwd ${uidList} 2>/dev/null || echo ""`)
            if (passwdResult.success && passwdResult.output) {
              passwdResult.output.split('\n').forEach(line => {
                const parts = line.split(':')
                if (parts.length >= 3) {
                  const username = parts[0]
                  const uid = parseInt(parts[2])
                  if (!isNaN(uid)) {
                    userMap.set(uid, username)
                  }
                }
              })
            }
          }
        }

        // 获取组名映射
        if (gidSet.size > 0) {
          const safeGids = Array.from(gidSet).filter(v => Number.isFinite(v) && v >= 0 && v === Math.floor(v))
          if (safeGids.length > 0) {
            const gidList = safeGids.join(',')
            const groupResult = await this.execCommand(id, `getent group ${gidList} 2>/dev/null || echo ""`)
            if (groupResult.success && groupResult.output) {
              groupResult.output.split('\n').forEach(line => {
                const parts = line.split(':')
                if (parts.length >= 3) {
                  const groupname = parts[0]
                  const gid = parseInt(parts[2])
                  if (!isNaN(gid)) {
                    groupMap.set(gid, groupname)
                  }
                }
              })
            }
          }
        }

        const files: FileInfo[] = list.map((item) => {
          let fileType: 'file' | 'folder' | 'link' = 'file'
          try {
            const isDirectory = (item.attrs as any).isDirectory()
            const isSymbolicLink = (item.attrs as any).isSymbolicLink()
            fileType = isSymbolicLink ? 'link' : isDirectory ? 'folder' : 'file'
          } catch {
            // attrs 方法不存在时回退为 file
          }

          const uid = item.attrs.uid
          const gid = item.attrs.gid

          return {
            name: item.filename,
            type: fileType,
            size: item.attrs.size,
            modifiedTime: new Date(item.attrs.mtime * 1000).toISOString(),
            permissions: this.modeToPermissions(item.attrs.mode),
            owner: userMap.get(uid) || uid.toString(),
            group: groupMap.get(gid) || gid.toString(),
          }
        })

        // 排序：文件夹在前，然后按名称排序
        files.sort((a, b) => {
          if (a.type === 'folder' && b.type !== 'folder') return -1
          if (a.type !== 'folder' && b.type === 'folder') return 1
          return a.name.localeCompare(b.name)
        })

        resolve({ success: true, files })
      })
    })
  }

  // 创建目录
  createDirectory(id: string, remotePath: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const pathError = this.validateRemotePath(remotePath)
      if (pathError) {
        resolve({ success: false, error: pathError })
        return
      }

      const sftp = this.sftpConnections.get(id)
      if (!sftp) {
        resolve({ success: false, error: 'SFTP 连接不存在' })
        return
      }

      sftp.mkdir(remotePath, (err) => {
        if (err) {
          resolve({ success: false, error: err.message })
          return
        }
        resolve({ success: true })
      })
    })
  }

  // 删除文件或目录
  delete(id: string, remotePath: string, isDirectory: boolean): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const pathError = this.validateRemotePath(remotePath)
      if (pathError) {
        resolve({ success: false, error: pathError })
        return
      }

      const sftp = this.sftpConnections.get(id)
      if (!sftp) {
        resolve({ success: false, error: 'SFTP 连接不存在' })
        return
      }

      const deleteFn = isDirectory ? sftp.rmdir.bind(sftp) : sftp.unlink.bind(sftp)
      deleteFn(remotePath, (err) => {
        if (err) {
          resolve({ success: false, error: err.message })
          return
        }
        resolve({ success: true })
      })
    })
  }

  // 重命名文件或目录
  rename(id: string, oldPath: string, newPath: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const oldPathError = this.validateRemotePath(oldPath)
      const newPathError = this.validateRemotePath(newPath)
      if (oldPathError || newPathError) {
        resolve({ success: false, error: oldPathError || newPathError! })
        return
      }

      const sftp = this.sftpConnections.get(id)
      if (!sftp) {
        resolve({ success: false, error: 'SFTP 连接不存在' })
        return
      }

      sftp.rename(oldPath, newPath, (err) => {
        if (err) {
          resolve({ success: false, error: err.message })
          return
        }
        resolve({ success: true })
      })
    })
  }

  // 下载文件（支持断点续传和取消，使用临时文件避免损坏）
  async downloadFile(
    id: string,
    remotePath: string,
    localPath: string,
    onProgress?: (transferred: number, total: number) => void,
    resume?: boolean,
    taskId?: string
  ): Promise<{ success: boolean; error?: string }> {
    // 生成临时文件路径：在原文件名后加 .part
    const tempPath = localPath + '.part'

    try {
      const pathError = this.validateRemotePath(remotePath)
      if (pathError) return { success: false, error: pathError }

      const localPathError = this.validateLocalPath(localPath)
      if (localPathError) return { success: false, error: localPathError }

      const sftp = this.sftpConnections.get(id)
      if (!sftp) return { success: false, error: 'SFTP 连接不存在' }

      let startOffset = 0
      let totalSize = 0

      try {
        const remoteStat = await new Promise<{ size: number }>((res, rej) => {
          sftp.stat(remotePath, (err, stats) => err ? rej(err) : res(stats as unknown as { size: number }))
        })
        totalSize = remoteStat.size

        if (resume) {
          try {
            const localStat = await fsStat(tempPath)
            if (localStat.size > 0 && localStat.size < totalSize) {
              startOffset = localStat.size
            }
          } catch {
            // 临时文件不存在，从头开始
          }
        }
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : '获取文件信息失败' }
      }

      // 使用流式传输到临时文件（支持取消）
      return new Promise((resolve) => {
        // 注册活跃传输
        const transfer: ActiveTransfer = { aborted: false, tempPath }
        if (taskId) this.activeTransfers.set(taskId, transfer)

        const cleanup = () => {
          if (taskId) this.activeTransfers.delete(taskId)
        }

        // 删除临时文件（取消时调用）
        const deleteTempFile = () => {
          try {
            fs.unlinkSync(tempPath)
          } catch { /* ignore */ }
        }

        // 重命名临时文件为最终文件
        const renameTempFile = (): boolean => {
          try {
            // 先删除目标文件（如果存在）
            try { fs.unlinkSync(localPath) } catch { /* ignore */ }
            fs.renameSync(tempPath, localPath)
            return true
          } catch {
            return false
          }
        }

        try {
          const readStream = sftp.createReadStream(remotePath, { start: startOffset })
          const writeStream = fs.createWriteStream(tempPath, { flags: startOffset > 0 ? 'a' : 'w' })

          // 存储流引用以便取消
          transfer.readStream = readStream as unknown as fs.ReadStream
          transfer.writeStream = writeStream

          let transferred = startOffset
          if (onProgress) onProgress(transferred, totalSize)

          readStream.on('data', (chunk: Buffer) => {
            // 检查是否已取消
            if (transfer.aborted) {
              readStream.destroy()
              writeStream.destroy()
              return
            }
            transferred += chunk.length
            if (onProgress) onProgress(transferred, totalSize)
          })

          readStream.on('error', (err) => {
            cleanup()
            writeStream.destroy()
            if (transfer.aborted) {
              deleteTempFile()
              resolve({ success: false, error: '已取消' })
            } else {
              resolve({ success: false, error: err.message })
            }
          })

          writeStream.on('error', (err) => {
            cleanup()
            readStream.destroy()
            if (transfer.aborted) {
              deleteTempFile()
              resolve({ success: false, error: '已取消' })
            } else {
              resolve({ success: false, error: err.message })
            }
          })

          writeStream.on('finish', () => {
            cleanup()
            if (transfer.aborted) {
              deleteTempFile()
              resolve({ success: false, error: '已取消' })
            } else {
              // 下载完成，重命名临时文件为最终文件名
              const renamed = renameTempFile()
              if (renamed) {
                resolve({ success: true })
              } else {
                resolve({ success: false, error: '重命名文件失败' })
              }
            }
          })

          readStream.on('close', () => {
            // 流关闭时结束写入
            if (!transfer.aborted) {
              writeStream.end()
            }
          })

          readStream.pipe(writeStream)
        } catch (err: unknown) {
          cleanup()
          resolve({ success: false, error: err instanceof Error ? err.message : '下载失败' })
        }
      })
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : '下载操作异常' }
    }
  }

  // 上传文件（支持断点续传和取消，使用临时文件避免损坏）
  async uploadFile(
    id: string,
    localPath: string,
    remotePath: string,
    onProgress?: (transferred: number, total: number) => void,
    resume?: boolean,
    taskId?: string
  ): Promise<{ success: boolean; error?: string }> {
    // 生成临时文件路径：在原文件名后加 .part
    const tempPath = remotePath + '.part'

    try {
      const pathError = this.validateRemotePath(remotePath)
      if (pathError) return { success: false, error: pathError }

      const localPathError = this.validateLocalPath(localPath)
      if (localPathError) return { success: false, error: localPathError }

      const sftp = this.sftpConnections.get(id)
      if (!sftp) return { success: false, error: 'SFTP 连接不存在' }

      let startOffset = 0
      let totalSize = 0

      try {
        const localStat = await fsStat(localPath)
        totalSize = localStat.size

        if (resume) {
          // 检查临时文件是否存在（断点续传）
          try {
            const tempStat = await new Promise<{ size: number }>((res, rej) => {
              sftp.stat(tempPath, (err, stats) => err ? rej(err) : res(stats as unknown as { size: number }))
            })
            if (tempStat.size > 0 && tempStat.size < totalSize) {
              startOffset = tempStat.size
            }
          } catch {
            // 临时文件不存在，从头开始
          }
        }
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : '获取文件信息失败' }
      }

      // 使用流式传输到临时文件（支持取消）
      return new Promise((resolve) => {
        // 注册活跃传输，包含临时文件路径用于取消时删除
        const transfer: ActiveTransfer = { aborted: false, tempPath, sftp, connectionId: id }
        if (taskId) this.activeTransfers.set(taskId, transfer)

        const cleanup = () => {
          if (taskId) this.activeTransfers.delete(taskId)
        }

        // 删除临时文件（取消时调用）
        const deleteTempFile = async () => {
          try {
            await new Promise<void>((res) => {
              sftp.unlink(tempPath, () => res())
            })
          } catch { /* ignore */ }
        }

        // 重命名临时文件为最终文件
        const renameTempFile = async (): Promise<boolean> => {
          return new Promise((res) => {
            // 先删除目标文件（如果存在）
            sftp.unlink(remotePath, () => {
              // 重命名临时文件
              sftp.rename(tempPath, remotePath, (err) => {
                res(!err)
              })
            })
          })
        }

        try {
          const readStream = fs.createReadStream(localPath, { start: startOffset })
          const writeStream = sftp.createWriteStream(tempPath, { flags: startOffset > 0 ? 'a' : 'w' })

          // 存储流引用以便取消
          transfer.readStream = readStream
          transfer.writeStream = writeStream

          let transferred = startOffset
          if (onProgress) onProgress(transferred, totalSize)

          readStream.on('data', (chunk: Buffer) => {
            // 检查是否已取消
            if (transfer.aborted) {
              readStream.destroy()
              writeStream.destroy()
              return
            }
            transferred += chunk.length
            if (onProgress) onProgress(transferred, totalSize)
          })

          readStream.on('error', (err) => {
            cleanup()
            writeStream.destroy()
            if (transfer.aborted) {
              deleteTempFile()
              resolve({ success: false, error: '已取消' })
            } else {
              resolve({ success: false, error: err.message })
            }
          })

          writeStream.on('error', (err: Error) => {
            cleanup()
            readStream.destroy()
            if (transfer.aborted) {
              deleteTempFile()
              resolve({ success: false, error: '已取消' })
            } else {
              resolve({ success: false, error: err.message })
            }
          })

          writeStream.on('close', async () => {
            cleanup()
            if (transfer.aborted) {
              await deleteTempFile()
              resolve({ success: false, error: '已取消' })
            } else {
              // 上传完成，重命名临时文件为最终文件名
              const renamed = await renameTempFile()
              if (renamed) {
                resolve({ success: true })
              } else {
                resolve({ success: false, error: '重命名文件失败' })
              }
            }
          })

          readStream.on('end', () => {
            // 本地文件读取完毕，SFTP writeStream 会自动关闭
          })

          readStream.pipe(writeStream)
        } catch (err: unknown) {
          cleanup()
          resolve({ success: false, error: err instanceof Error ? err.message : '上传失败' })
        }
      })
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : '上传操作异常' }
    }
  }

  // 取消传输
  abortTransfer(taskId: string): boolean {
    const transfer = this.activeTransfers.get(taskId)
    if (transfer) {
      transfer.aborted = true
      // 销毁流
      if (transfer.readStream) {
        try { transfer.readStream.destroy() } catch { /* ignore */ }
      }
      if (transfer.writeStream) {
        try { (transfer.writeStream as fs.WriteStream).destroy() } catch { /* ignore */ }
      }
      return true
    }
    return false
  }

  // 获取文件信息
  stat(id: string, remotePath: string): Promise<{ success: boolean; info?: FileInfo; error?: string }> {
    return new Promise((resolve) => {
      const pathError = this.validateRemotePath(remotePath)
      if (pathError) {
        resolve({ success: false, error: pathError })
        return
      }

      const sftp = this.sftpConnections.get(id)
      if (!sftp) {
        resolve({ success: false, error: 'SFTP 连接不存在' })
        return
      }

      sftp.stat(remotePath, (err, stats) => {
        if (err) {
          resolve({ success: false, error: err.message })
          return
        }

        const isDirectory = (stats as any).isDirectory()
        const info: FileInfo = {
          name: path.basename(remotePath),
          type: isDirectory ? 'folder' : 'file',
          size: stats.size,
          modifiedTime: new Date(stats.mtime * 1000).toISOString(),
          permissions: this.modeToPermissions(stats.mode),
          owner: stats.uid.toString(),
          group: stats.gid.toString(),
        }

        resolve({ success: true, info })
      })
    })
  }

  // 获取当前工作目录
  getWorkingDirectory(id: string): Promise<{ success: boolean; path?: string; error?: string }> {
    return new Promise((resolve) => {
      const sftp = this.sftpConnections.get(id)
      if (!sftp) {
        resolve({ success: false, error: 'SFTP 连接不存在' })
        return
      }

      sftp.realpath('.', (err, resolvedPath) => {
        if (err) {
          resolve({ success: false, error: err.message })
          return
        }
        resolve({ success: true, path: resolvedPath })
      })
    })
  }

  // 通过交互式 shell 获取当前工作目录
  getShellCwd(id: string): Promise<{ success: boolean; path?: string; error?: string }> {
    return new Promise((resolve) => {
      const stream = this.shellStreams.get(id)
      if (!stream) {
        resolve({ success: false, error: 'Shell 不存在' })
        return
      }

      const marker = `__CWD_${Date.now()}_${Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, '')}__`
      const startMarker = `${marker}S`
      const endMarker = `${marker}E`
      let output = ''
      let resolved = false

      // 屏蔽 shell 输出转发到终端
      this.suppressShellOutput.add(id)

      const cleanup = () => {
        this.suppressShellOutput.delete(id)
        stream.removeListener('data', onData)
      }

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          cleanup()
          resolve({ success: false, error: '获取目录超时' })
        }
      }, 3000)

      const onData = (data: Buffer) => {
        output += data.toString('utf-8')

        // shell 回显命令会产生第 1 对 marker，执行结果产生第 2 对
        // 必须等 endMarker 出现 2 次，取最后一对
        let endCount = 0
        let pos = 0
        while (pos < output.length) {
          const idx = output.indexOf(endMarker, pos)
          if (idx === -1) break
          endCount++
          pos = idx + endMarker.length
        }

        if (endCount >= 2) {
          resolved = true
          clearTimeout(timeout)
          cleanup()
          const lastEndIdx = output.lastIndexOf(endMarker)
          const lastStartIdx = output.lastIndexOf(startMarker, lastEndIdx)
          if (lastStartIdx !== -1) {
            const cwd = output.substring(lastStartIdx + startMarker.length, lastEndIdx).trim()
            resolve({ success: true, path: cwd })
          } else {
            resolve({ success: false, error: '解析目录失败' })
          }
        }
      }

      stream.on('data', onData)
      stream.write(` printf '%s%s%s\\n' '${startMarker}' "$(pwd)" '${endMarker}'\n`)
    })
  }

  // 通过交互式 shell 获取历史命令
  getShellHistory(id: string, count: number = 200): Promise<{ success: boolean; output?: string; error?: string }> {
    return new Promise((resolve) => {
      const stream = this.shellStreams.get(id)
      if (!stream) {
        resolve({ success: false, error: 'Shell 不存在' })
        return
      }

      const marker = `__HIST_${Date.now()}_${Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, '')}__`
      const startMarker = `${marker}S`
      const endMarker = `${marker}E`
      let output = ''
      let resolved = false

      this.suppressShellOutput.add(id)

      const cleanup = () => {
        this.suppressShellOutput.delete(id)
        stream.removeListener('data', onData)
      }

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          cleanup()
          resolve({ success: false, error: '获取历史命令超时' })
        }
      }, 5000)

      const onData = (data: Buffer) => {
        output += data.toString('utf-8')

        let endCount = 0
        let pos = 0
        while (pos < output.length) {
          const idx = output.indexOf(endMarker, pos)
          if (idx === -1) break
          endCount++
          pos = idx + endMarker.length
        }

        if (endCount >= 2) {
          resolved = true
          clearTimeout(timeout)
          cleanup()
          const lastEndIdx = output.lastIndexOf(endMarker)
          const lastStartIdx = output.lastIndexOf(startMarker, lastEndIdx)
          if (lastStartIdx !== -1) {
            const histOutput = output.substring(lastStartIdx + startMarker.length, lastEndIdx).trim()
            resolve({ success: true, output: histOutput })
          } else {
            resolve({ success: false, error: '解析历史命令失败' })
          }
        }
      }

      stream.on('data', onData)
      // 先刷新历史到文件，再用 history/fc 读取（兼容 bash 和 zsh）
      // 前导空格防止命令本身被记录到历史
      const safeCount = Math.max(1, Math.min(500, Math.floor(count)))
      stream.write(` printf '%s' '${startMarker}'; HISTTIMEFORMAT='' history ${safeCount} 2>/dev/null || fc -l -${safeCount} 2>/dev/null; printf '%s\\n' '${endMarker}'\n`)
    })
  }

  // 执行远程命令（一次性执行，非交互）
  execCommand(id: string, command: string, timeout: number = 30000): Promise<{ success: boolean; output?: string; error?: string; exitCode?: number }> {
    return new Promise((resolve) => {
      const conn = this.connections.get(id)
      if (!conn) {
        resolve({ success: false, error: '连接不存在' })
        return
      }

      let resolved = false
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true
          try { stream?.destroy() } catch { /* ignore */ }
          resolve({ success: false, error: '命令执行超时' })
        }
      }, timeout)

      let stream: ClientChannel | null = null

      conn.exec(command, (err, s) => {
        if (err) {
          clearTimeout(timer)
          if (!resolved) {
            resolved = true
            resolve({ success: false, error: err.message })
          }
          return
        }

        stream = s
        let output = ''
        let stderr = ''

        s.on('data', (data: Buffer) => {
          output += data.toString('utf-8')
        })

        s.stderr.on('data', (data: Buffer) => {
          stderr += data.toString('utf-8')
        })

        s.on('exit', (code: number | null) => {
          clearTimeout(timer)
          if (!resolved) {
            resolved = true
            const exitCode = code ?? 0
            resolve({
              success: exitCode === 0,
              output: output || undefined,
              error: exitCode !== 0 ? (stderr || `命令退出码: ${exitCode}`) : undefined,
              exitCode,
            })
          }
        })

        // 兜底：如果 exit 事件不触发，close 事件兜底
        s.on('close', () => {
          clearTimeout(timer)
          if (!resolved) {
            resolved = true
            resolve({ success: true, output: output || undefined })
          }
        })
      })
    })
  }

  // 获取系统监控信息（单条命令采集所有数据）
  async getSystemStats(id: string): Promise<{ success: boolean; stats?: SystemStats; error?: string }> {
    const conn = this.connections.get(id)
    if (!conn) {
      return { success: false, error: '连接不存在' }
    }

    try {
      const SEP = '__SEP__'
      // 一条命令采集全部信息，用分隔符分割各段
      // 段顺序: os_type | cpu | mem | disk | uptime | os_info | hostname | load_avg | network_ip | login_users | process_count | top_processes
      const script = `
_os=$(uname -s 2>/dev/null || echo Linux)
echo "$_os"
echo '${SEP}'
if [ "$_os" = "Darwin" ]; then
  top -l 1 | grep 'CPU usage' | awk '{print $3}' | tr -d '%'
else
  top -bn1 | grep 'Cpu(s)' | awk '{print $2+$4}'
fi
echo '${SEP}'
if [ "$_os" = "Darwin" ]; then
  _mu=$(vm_stat | awk '/Pages active/ {a+=$3} /Pages wired/ {a+=$4} /Pages occupied by compressor/ {a+=$5} END {printf "%d", a*4096}')
  _mt=$(sysctl -n hw.memsize)
  printf '%s %s' "$_mu" "$_mt"
else
  free -b | awk '/Mem:/ {printf "%d %d", $3, $2}'
fi
echo '${SEP}'
if [ "$_os" = "Darwin" ]; then
  df -b / | awk 'NR==2 {printf "%d %d", $3, $2}'
else
  df -B1 / | awk 'NR==2 {printf "%d %d", $3, $2}'
fi
echo '${SEP}'
uptime -p 2>/dev/null || uptime | awk -F'up ' '{print $2}' | awk -F', *[0-9]+ user' '{print $1}'
echo '${SEP}'
if [ "$_os" = "Darwin" ]; then
  printf '%s %s' "$(sw_vers -productName 2>/dev/null) $(sw_vers -productVersion 2>/dev/null)" "$(uname -m)"
else
  if [ -f /etc/os-release ]; then
    . /etc/os-release; printf '%s %s' "$PRETTY_NAME" "$(uname -m)"
  else
    printf '%s %s' "$(uname -sr)" "$(uname -m)"
  fi
fi
echo '${SEP}'
hostname
echo '${SEP}'
uptime | awk -F'load average[s]?: ' '{print $2}' | head -1
echo '${SEP}'
if [ "$_os" = "Darwin" ]; then
  ipconfig getifaddr en0 2>/dev/null || echo '-'
else
  hostname -I 2>/dev/null | awk '{print $1}' || ip -4 addr show scope global 2>/dev/null | awk '/inet / {print $2}' | cut -d/ -f1 | head -1 || echo '-'
fi
echo '${SEP}'
who 2>/dev/null | wc -l | tr -d ' '
echo '${SEP}'
if [ "$_os" = "Darwin" ]; then
  ps aux 2>/dev/null | wc -l | tr -d ' '
else
  ls /proc 2>/dev/null | grep -c '^[0-9]' || ps aux 2>/dev/null | wc -l | tr -d ' '
fi
echo '${SEP}'
ps aux --sort=-%cpu 2>/dev/null | awk 'NR>1 && NR<=6 {n=$11; gsub(/.*\\//, "", n); cmd=""; for(i=11;i<=NF;i++) cmd=cmd (i>11?" ":"") $i; printf "%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n", $2, $1, $3, $4, n, cmd}' || ps aux 2>/dev/null | head -6 | tail -5 | awk '{n=$11; gsub(/.*\\//, "", n); cmd=""; for(i=11;i<=NF;i++) cmd=cmd (i>11?" ":"") $i; printf "%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n", $2, $1, $3, $4, n, cmd}'
`.trim()

      const result = await this.execCommand(id, script)

      let osType = '', cpuStr = '', memStr = '', diskStr = '', uptimeStr = ''
      let osInfo = '', hostname = '', loadAvg = '', networkIP = '', loginUsersStr = '', processCountStr = '', topStr = ''

      if (result.output) {
        const parts = result.output.split(SEP).map(s => s.trim())
        osType = parts[0] || ''
        cpuStr = parts[1] || ''
        memStr = parts[2] || ''
        diskStr = parts[3] || ''
        uptimeStr = parts[4] || ''
        osInfo = parts[5] || ''
        hostname = parts[6] || ''
        loadAvg = parts[7] || ''
        networkIP = parts[8] || ''
        loginUsersStr = parts[9] || ''
        processCountStr = parts[10] || ''
        topStr = parts[11] || ''
      }

      const cpuUsage = parseFloat(cpuStr) || 0

      let memUsed = 0, memTotal = 1
      if (memStr) {
        const memParts = memStr.split(/\s+/)
        memUsed = parseInt(memParts[0]) || 0
        memTotal = parseInt(memParts[1]) || 1
      }

      let diskUsed = 0, diskTotal = 1
      if (diskStr) {
        const diskParts = diskStr.split(/\s+/)
        diskUsed = parseInt(diskParts[0]) || 0
        diskTotal = parseInt(diskParts[1]) || 1
      }

      // 解析 top 进程
      const topProcesses: { pid: string; user: string; cpu: string; mem: string; command: string; fullCommand: string }[] = []
      if (topStr) {
        for (const line of topStr.split('\n')) {
          const cols = line.split('\t')
          if (cols.length >= 5) {
            topProcesses.push({
              pid: cols[0].trim(),
              user: cols[1].trim(),
              cpu: cols[2].trim(),
              mem: cols[3].trim(),
              command: cols[4].trim(),
              fullCommand: (cols[5] || cols[4] || '').trim(),
            })
          }
        }
      }

      return {
        success: true,
        stats: {
          cpuUsage: Math.min(100, Math.max(0, Math.round(cpuUsage))),
          memUsed,
          memTotal,
          memPercent: Math.round((memUsed / memTotal) * 100),
          diskUsed,
          diskTotal,
          diskPercent: Math.round((diskUsed / diskTotal) * 100),
          uptime: uptimeStr || '',
          osInfo: osInfo || '',
          hostname: hostname || '',
          loadAvg: loadAvg || '',
          networkIP: networkIP && networkIP !== '-' ? networkIP : '',
          loginUsers: parseInt(loginUsersStr) || 0,
          processCount: parseInt(processCountStr) || 0,
          topProcesses,
        }
      }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : '获取系统信息失败' }
    }
  }

  // 辅助方法：权限数字转字符串
  private modeToPermissions(mode: number): string {
    const types = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx']
    const type = (mode >> 12) & 0o17

    let result = ''
    if (type === 4) result = 'd'
    else if (type === 10) result = '-'
    else if (type === 12) result = 'l'
    else result = '-'

    result += types[(mode >> 6) & 7]
    result += types[(mode >> 3) & 7]
    result += types[mode & 7]

    return result
  }

  // 发送消息到连接对应的渲染进程
  private sendToConnection(connectionId: string, channel: string, data: Record<string, unknown>) {
    const wc = this.connectionTargets.get(connectionId)
    if (wc && !wc.isDestroyed()) {
      wc.send(channel, data)
    }
  }

  // 获取所有活动连接
  getActiveConnections(): string[] {
    return Array.from(this.connections.keys())
  }

  // 修改文件/目录权限
  chmod(id: string, remotePath: string, mode: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const pathError = this.validateRemotePath(remotePath)
      if (pathError) {
        resolve({ success: false, error: pathError })
        return
      }

      // 验证mode格式（如 755, 644, 777）
      if (!/^[0-7]{3,4}$/.test(mode)) {
        resolve({ success: false, error: '权限格式无效，应为3或4位八进制数（如 755）' })
        return
      }

      const sftp = this.sftpConnections.get(id)
      if (!sftp) {
        resolve({ success: false, error: 'SFTP 连接不存在' })
        return
      }

      sftp.chmod(remotePath, parseInt(mode, 8), (err) => {
        if (err) {
          resolve({ success: false, error: err.message })
          return
        }
        resolve({ success: true })
      })
    })
  }

  // 创建空文件
  createFile(id: string, remotePath: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const pathError = this.validateRemotePath(remotePath)
      if (pathError) {
        resolve({ success: false, error: pathError })
        return
      }

      const sftp = this.sftpConnections.get(id)
      if (!sftp) {
        resolve({ success: false, error: 'SFTP 连接不存在' })
        return
      }

      // 使用 open 创建空文件
      sftp.open(remotePath, 'w', 0o644, (err, handle) => {
        if (err) {
          resolve({ success: false, error: err.message })
          return
        }
        // 立即关闭句柄
        sftp.close(handle, (closeErr) => {
          if (closeErr) {
            resolve({ success: false, error: closeErr.message })
            return
          }
          resolve({ success: true })
        })
      })
    })
  }

  // 读取远程文件内容到内存（用于编辑器）
  readFileContent(id: string, remotePath: string, maxSize: number = 5 * 1024 * 1024): Promise<{ success: boolean; content?: string; encoding?: string; size?: number; error?: string }> {
    return new Promise((resolve) => {
      const pathError = this.validateRemotePath(remotePath)
      if (pathError) {
        resolve({ success: false, error: pathError })
        return
      }

      const sftp = this.sftpConnections.get(id)
      if (!sftp) {
        resolve({ success: false, error: 'SFTP 连接不存在' })
        return
      }

      // 先检查文件大小
      sftp.stat(remotePath, (statErr, stats) => {
        if (statErr) {
          resolve({ success: false, error: statErr.message })
          return
        }

        if (stats.size > maxSize) {
          resolve({ success: false, error: `文件过大（${(stats.size / 1024 / 1024).toFixed(1)}MB），超过 ${(maxSize / 1024 / 1024).toFixed(0)}MB 限制` })
          return
        }

        // 读取文件内容为 Buffer
        const chunks: Buffer[] = []
        const readStream = sftp.createReadStream(remotePath)

        readStream.on('data', (chunk: Buffer) => {
          chunks.push(chunk)
        })

        readStream.on('end', () => {
          const buf = Buffer.concat(chunks)

          // 检测是否为二进制文件：检查前 8192 字节是否包含 NULL 字节
          const checkLen = Math.min(buf.length, 8192)
          for (let i = 0; i < checkLen; i++) {
            if (buf[i] === 0) {
              resolve({ success: false, error: '该文件为二进制文件，无法在编辑器中打开' })
              return
            }
          }

          // 编码检测：检查 BOM 标记
          let encoding = 'utf-8'
          let content: string

          if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
            // UTF-8 BOM
            encoding = 'utf-8-bom'
            content = buf.slice(3).toString('utf-8')
          } else if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
            // UTF-16 LE BOM
            encoding = 'utf-16le'
            content = buf.slice(2).toString('utf16le')
          } else if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
            // UTF-16 BE BOM — Node.js 没有原生 utf16be 支持，手动交换字节
            encoding = 'utf-16be'
            const swapped = Buffer.alloc(buf.length - 2)
            for (let i = 2; i < buf.length - 1; i += 2) {
              swapped[i - 2] = buf[i + 1]
              swapped[i - 1] = buf[i]
            }
            content = swapped.toString('utf16le')
          } else {
            // 无 BOM：尝试 UTF-8 解码，检验是否有替换字符（说明不是合法 UTF-8）
            content = buf.toString('utf-8')
            // 如果包含 replacement character 且原始字节中没有对应的 0xEF 0xBF 0xBD 序列，
            // 可能是 GBK/Latin1 等编码，回退到 latin1 保证不丢失数据
            if (content.includes('\uFFFD')) {
              // 验证：原始 buffer 中是否真的有 0xEF 0xBF 0xBD（合法的 UTF-8 replacement char）
              const hasRealReplacement = buf.includes(Buffer.from([0xEF, 0xBF, 0xBD]))
              if (!hasRealReplacement) {
                // 非 UTF-8 文件，使用 latin1 保留原始字节（用户可在编辑器中切换编码）
                encoding = 'latin1'
                content = buf.toString('latin1')
              }
            }
          }

          resolve({ success: true, content, encoding, size: buf.length })
        })

        readStream.on('error', (err: Error) => {
          resolve({ success: false, error: err.message })
        })
      })
    })
  }

  // 将编辑器内容写回远程文件
  writeFileContent(id: string, remotePath: string, content: string, encoding: string = 'utf-8'): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const pathError = this.validateRemotePath(remotePath)
      if (pathError) {
        resolve({ success: false, error: pathError })
        return
      }

      const sftp = this.sftpConnections.get(id)
      if (!sftp) {
        resolve({ success: false, error: 'SFTP 连接不存在' })
        return
      }

      // 根据原始编码转换回 Buffer
      let buf: Buffer
      if (encoding === 'utf-8-bom') {
        const bom = Buffer.from([0xEF, 0xBB, 0xBF])
        buf = Buffer.concat([bom, Buffer.from(content, 'utf-8')])
      } else if (encoding === 'utf-16le') {
        const bom = Buffer.from([0xFF, 0xFE])
        buf = Buffer.concat([bom, Buffer.from(content, 'utf16le')])
      } else if (encoding === 'utf-16be') {
        const le = Buffer.from(content, 'utf16le')
        const swapped = Buffer.alloc(le.length)
        for (let i = 0; i < le.length - 1; i += 2) {
          swapped[i] = le[i + 1]
          swapped[i + 1] = le[i]
        }
        const bom = Buffer.from([0xFE, 0xFF])
        buf = Buffer.concat([bom, swapped])
      } else if (encoding === 'latin1') {
        buf = Buffer.from(content, 'latin1')
      } else {
        buf = Buffer.from(content, 'utf-8')
      }

      const writeStream = sftp.createWriteStream(remotePath)

      writeStream.on('close', () => {
        resolve({ success: true })
      })

      writeStream.on('error', (err: Error) => {
        resolve({ success: false, error: err.message })
      })

      writeStream.end(buf)
    })
  }

  // 断开所有连接（应用退出时调用）
  disconnectAll() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    for (const id of this.connections.keys()) {
      this.disconnect(id)
    }
  }
}

export const sshManager = new SSHManager()
