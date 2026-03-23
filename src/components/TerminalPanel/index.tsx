import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { Button, Tooltip, Dropdown, Input, App, Space } from 'antd'
import type { MenuProps } from 'antd'
import {
  SearchOutlined,
  ClearOutlined,
  CopyOutlined,
  ExportOutlined,
  SettingOutlined,
  AimOutlined,
  VerticalAlignBottomOutlined,
  LinkOutlined,
  DisconnectOutlined,
  FolderOutlined,
  SnippetsOutlined,
  SelectOutlined,
  ScissorOutlined,
  UserOutlined,
  HistoryOutlined,
  UpOutlined,
  DownOutlined,
  CloseOutlined,
} from '@ant-design/icons'
import { useThemeStore } from '../../stores/themeStore'
import { useConnectionStore } from '../../stores/connectionStore'
import { useTerminalThemeStore, getTerminalColorScheme, darkPresets, lightPresets } from '../../stores/terminalThemeStore'
import TerminalSettingsPanel from './TerminalSettingsPanel'
import TerminalHistoryPanel from './TerminalHistoryPanel'
import '@xterm/xterm/css/xterm.css'
import './index.css'

interface TerminalPanelProps {
  connectionId?: string
  isActive?: boolean
  sftpVisible?: boolean
  onToggleSFTP?: (path?: string) => void
  onReconnect?: () => void
  serverConfig?: {
    host: string
    port: number
    username: string
  }
}

const TerminalPanel: React.FC<TerminalPanelProps> = ({
  connectionId,
  isActive = true,
  sftpVisible = false,
  onToggleSFTP,
  onReconnect,
  serverConfig,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null)
  const terminalInstance = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const { actualTheme } = useThemeStore()
  const { getConnection } = useConnectionStore()
  const { message } = App.useApp()

  // 使用 ref 存储最新的连接状态，避免闭包问题
  const connectionIdRef = useRef(connectionId)
  const isConnectedRef = useRef(false)
  const onReconnectRef = useRef(onReconnect)
  const wordWrapRef = useRef(true)

  // 获取连接状态
  const connection = connectionId ? getConnection(connectionId) : undefined
  const isConnected = connection?.status === 'connected'
  const isDisconnected = connection?.status === 'disconnected' || connection?.status === 'error'

  // 直接在渲染时更新 ref，确保闭包中始终拿到最新值
  connectionIdRef.current = connectionId
  isConnectedRef.current = isConnected || false
  onReconnectRef.current = onReconnect

  // 获取 SSH 当前工作目录（通过交互式 shell，获取真实 CWD）
  const getCurrentPath = useCallback(async (): Promise<string> => {
    if (!connectionId || !isConnected) return ''
    try {
      const result = await window.electronAPI.sshGetShellCwd(connectionId)
      if (result.success && result.path) {
        return result.path.trim()
      }
    } catch { /* ignore */ }
    return ''
  }, [connectionId, isConnected])

  // 终端尺寸状态
  const [, setTerminalSize] = useState({ cols: 80, rows: 24 })

  // 终端设置状态
  const [wordWrap, setWordWrap] = useState(true)
  const [fontSize, setFontSize] = useState(14)
  const [searchVisible, setSearchVisible] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [scrollOnOutput, setScrollOnOutput] = useState(true)

  // 历史命令
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyCommands, setHistoryCommands] = useState<string[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // 右键菜单
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null)

  // 设置面板
  const [settingsOpen, setSettingsOpen] = useState(false)

  // 终端配色 store
  const terminalThemeState = useTerminalThemeStore()
  const { setPreset, setCustomColor } = terminalThemeState
  const currentPresetId = actualTheme === 'dark' ? terminalThemeState.darkPresetId : terminalThemeState.lightPresetId
  const currentCustomColors = actualTheme === 'dark' ? terminalThemeState.customDark : terminalThemeState.customLight
  const currentPresetsMap = actualTheme === 'dark' ? darkPresets : lightPresets

  const terminalColorScheme = useMemo(
    () => getTerminalColorScheme(actualTheme, terminalThemeState),
    [actualTheme, currentPresetId, currentCustomColors.foreground, currentCustomColors.background, currentCustomColors.cursor]
  )

  // 快捷键回调 refs（终端初始化时绑定一次，通过 ref 始终访问最新函数）
  const changeFontSizeRef = useRef<(delta: number) => void>(() => {})
  const toggleSearchRef = useRef<() => void>(() => {})
  const copySelectionSilentRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false))
  const pasteToTerminalRef = useRef<() => void>(() => {})

  // 粘贴到终端
  const pasteToTerminal = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text && connectionIdRef.current && isConnectedRef.current) {
        window.electronAPI.sshWrite(connectionIdRef.current, text)
      } else if (text && terminalInstance.current) {
        terminalInstance.current.write(text)
      }
    } catch {
      message.error('粘贴失败，请检查剪贴板权限')
    }
  }, [])

  // 复制选中内容（静默模式，不弹提示）
  const copySelectionSilent = useCallback(async (): Promise<boolean> => {
    if (terminalInstance.current) {
      const selection = terminalInstance.current.getSelection()
      if (selection) {
        try {
          await navigator.clipboard.writeText(selection)
          return true
        } catch {
          return false
        }
      }
    }
    return false
  }, [])

  // 复制并粘贴
  const copyAndPaste = useCallback(async () => {
    if (terminalInstance.current) {
      const selection = terminalInstance.current.getSelection()
      if (selection) {
        try {
          await navigator.clipboard.writeText(selection)
          // 粘贴到终端
          if (connectionIdRef.current && isConnectedRef.current) {
            window.electronAPI.sshWrite(connectionIdRef.current, selection)
          }
          terminalInstance.current.clearSelection()
        } catch {
          message.error('操作失败')
        }
      }
    }
  }, [])

  // 全选
  const selectAll = useCallback(() => {
    if (terminalInstance.current) {
      terminalInstance.current.selectAll()
    }
  }, [])

  // 初始化终端
  // 依赖数组为空 []：终端实例只创建一次，后续状态变化通过 ref 模式访问最新值
  // （connectionIdRef, wordWrapRef, scrollOnOutputRef 等），避免重新创建/销毁终端
  useEffect(() => {
    if (!terminalRef.current || terminalInstance.current) return

    const term = new Terminal({
      fontSize: 14,
      fontFamily: 'Consolas, Monaco, "Courier New", monospace',
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 50000,
      rightClickSelectsWord: true,
      theme: getTerminalColorScheme(
        useThemeStore.getState().actualTheme,
        useTerminalThemeStore.getState()
      ),
    } as any)

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    const searchAddon = new SearchAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.loadAddon(searchAddon)
    term.open(terminalRef.current)

    // 自定义快捷键拦截：返回 false 阻止 xterm 处理，交给我们的 UI 逻辑
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      // 只在 keydown 时处理
      if (e.type !== 'keydown') return true

      const ctrl = e.ctrlKey || e.metaKey

      // Ctrl+F → 搜索
      if (ctrl && e.key === 'f') {
        e.preventDefault()
        toggleSearchRef.current()
        return false
      }

      // Ctrl+R → 禁用（防止页面刷新）
      if (ctrl && e.key === 'r') {
        e.preventDefault()
        return false
      }

      // Ctrl++ (Ctrl+Shift+=) 或 Ctrl+= → 放大字体
      if (ctrl && (e.key === '+' || e.key === '=')) {
        e.preventDefault()
        changeFontSizeRef.current(2)
        return false
      }

      // Ctrl+- → 缩小字体
      if (ctrl && e.key === '-') {
        e.preventDefault()
        changeFontSizeRef.current(-2)
        return false
      }

      // Ctrl+0 → 重置字体大小
      if (ctrl && e.key === '0') {
        e.preventDefault()
        changeFontSizeRef.current(0) // 特殊值，表示重置
        return false
      }

      // Ctrl+Shift+C → 复制选中内容
      if (ctrl && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        copySelectionSilentRef.current()
        return false
      }

      // Ctrl+Shift+V → 粘贴
      if (ctrl && e.shiftKey && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        pasteToTerminalRef.current()
        return false
      }

      // Ctrl+L → 清屏
      // 注意：不拦截，让 shell 原生处理 Ctrl+L

      return true
    })

    terminalInstance.current = term
    fitAddonRef.current = fitAddon
    searchAddonRef.current = searchAddon

    // 延迟 fit，确保 DOM 已完成布局
    requestAnimationFrame(() => {
      try { 
        fitAddon.fit() 
        const dims = fitAddon.proposeDimensions()
        if (dims) {
          setTerminalSize({ cols: dims.cols || 80, rows: dims.rows || 24 })
        }
      } catch { /* 容器尚无尺寸时忽略 */ }
    })

    // 显示欢迎信息
    term.writeln('\x1b[1;34m========================================\x1b[0m')
    term.writeln('\x1b[1;34m       SSHTools Terminal\x1b[0m')
    term.writeln('\x1b[1;34m========================================\x1b[0m')
    term.writeln('')

    if (!connectionId) {
      term.writeln('\x1b[33m提示: 请在左侧会话管理器中双击服务器连接\x1b[0m')
      term.writeln('')
    }

    // 处理终端输入
    term.onData((data) => {
      if (connectionIdRef.current && isConnectedRef.current) {
        window.electronAPI.sshWrite(connectionIdRef.current, data)
      } else if (data === '\r' || data === '\n') {
        // 断开连接后，按回车触发重连
        if (onReconnectRef.current) {
          term.writeln('')
          term.writeln('\x1b[36m正在重新连接...\x1b[0m')
          onReconnectRef.current()
        }
      }
    })

    // 窗口大小变化时重新适配
    const handleResize = () => {
      try {
        if (wordWrapRef.current) {
          fitAddon.fit()
          if (connectionIdRef.current && isConnectedRef.current) {
            const dims = fitAddon.proposeDimensions()
            if (dims) {
              setTerminalSize({ cols: dims.cols || 80, rows: dims.rows || 24 })
              window.electronAPI.sshResize(connectionIdRef.current, dims.cols, dims.rows)
            }
          }
        } else {
          // 不换行模式：只更新行数，保持大列数
          const dims = fitAddon.proposeDimensions()
          if (dims) {
            term.resize(500, dims.rows || 24)
            setTerminalSize({ cols: 500, rows: dims.rows || 24 })
            if (connectionIdRef.current && isConnectedRef.current) {
              window.electronAPI.sshResize(connectionIdRef.current, 500, dims.rows || 24)
            }
          }
        }
      } catch { /* 容器尚无尺寸时忽略 */ }
    }
    window.addEventListener('resize', handleResize)

    const resizeObserver = new ResizeObserver(() => {
      handleResize()
    })
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current)
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      resizeObserver.disconnect()
      term.dispose()
      terminalInstance.current = null
    }
  }, [])

  // 标签页切换回来时重新适配终端尺寸
  useEffect(() => {
    if (!isActive || !fitAddonRef.current || !terminalInstance.current) return
    // 延迟执行，等待 DOM 布局完成
    const timer = requestAnimationFrame(() => {
      try {
        fitAddonRef.current?.fit()
        const dims = fitAddonRef.current?.proposeDimensions()
        if (dims && connectionIdRef.current && isConnectedRef.current) {
          setTerminalSize({ cols: dims.cols || 80, rows: dims.rows || 24 })
          window.electronAPI.sshResize(connectionIdRef.current, dims.cols || 80, dims.rows || 24)
        }
      } catch { /* ignore */ }
    })
    // 聚焦终端
    terminalInstance.current.focus()
    return () => cancelAnimationFrame(timer)
  }, [isActive])

  // 监听 SSH 数据
  useEffect(() => {
    if (!connectionId) return

    const handleSSHData = (data: { id: string; data: string }) => {
      if (data.id === connectionId && terminalInstance.current) {
        // 如果关闭了"输出时滚动"，先记住当前滚动位置
        const shouldHoldScroll = !scrollOnOutputRef.current
        const viewport = terminalRef.current?.querySelector('.xterm-viewport')
        const scrollTop = shouldHoldScroll && viewport ? viewport.scrollTop : 0

        terminalInstance.current.write(data.data)

        // 恢复滚动位置，阻止自动滚动到底部
        if (shouldHoldScroll && viewport) {
          requestAnimationFrame(() => {
            viewport.scrollTop = scrollTop
          })
        }
      }
    }

    const handleSSHDisconnected = (data: { id: string }) => {
      if (data.id === connectionId && terminalInstance.current) {
        terminalInstance.current.writeln('')
        terminalInstance.current.writeln('\x1b[33m连接已断开，按 Enter 重新连接\x1b[0m')
      }
    }

    const handleSSHError = (data: { id: string; error: string }) => {
      if (data.id === connectionId && terminalInstance.current) {
        terminalInstance.current.writeln('')
        terminalInstance.current.writeln(`\x1b[31m错误: ${data.error}\x1b[0m`)
        terminalInstance.current.writeln('\x1b[33m按 Enter 重新连接\x1b[0m')
      }
    }

    const unsubData = window.electronAPI.onSSHData(handleSSHData)
    const unsubDisconnected = window.electronAPI.onSSHDisconnected(handleSSHDisconnected)
    const unsubError = window.electronAPI.onSSHError(handleSSHError)

    return () => {
      unsubData()
      unsubDisconnected()
      unsubError()
    }
  }, [connectionId])

  // 当连接建立后启动 shell
  useEffect(() => {
    if (connectionId && isConnected && terminalInstance.current) {
      window.electronAPI.sshStartShell(connectionId).then((result) => {
        if (!result.success) {
          terminalInstance.current?.writeln(`\x1b[31m启动 Shell 失败: ${result.error}\x1b[0m`)
        } else {
          // 如果是复用已有 shell（跨窗口迁移），回放缓冲区内容
          if (result.reused && terminalInstance.current) {
            // 清除初始化时写入的欢迎信息
            terminalInstance.current.reset()
            // 回放缓冲的终端输出
            if (result.buffer) {
              terminalInstance.current.write(result.buffer)
            }
          }
          if (fitAddonRef.current) {
            const dims = fitAddonRef.current.proposeDimensions()
            if (dims) {
              const cols = wordWrapRef.current ? (dims.cols || 80) : 500
              window.electronAPI.sshResize(connectionId, cols, dims.rows || 24)
            }
          }
        }
      })
    }
  }, [connectionId, isConnected])

  // 主题/配色变化时更新终端
  useEffect(() => {
    if (terminalInstance.current) {
      terminalInstance.current.options.theme = terminalColorScheme
    }
  }, [terminalColorScheme])

  // 右键菜单处理
  useEffect(() => {
    const el = terminalRef.current
    if (!el) return

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      setContextMenuPos({ x: e.clientX, y: e.clientY })
    }

    el.addEventListener('contextmenu', handleContextMenu)
    return () => el.removeEventListener('contextmenu', handleContextMenu)
  }, [])

  // 点击其他地方关闭右键菜单
  useEffect(() => {
    if (!contextMenuPos) return
    const handleClick = () => setContextMenuPos(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [contextMenuPos])

  // 切换自动换行（通过改变终端列数实现）
  const toggleWordWrap = () => {
    const newValue = !wordWrap
    setWordWrap(newValue)
    wordWrapRef.current = newValue

    if (terminalInstance.current && fitAddonRef.current) {
      if (!newValue) {
        // 不换行：设置很大的列数，启用水平滚动
        const rows = terminalInstance.current.rows
        terminalInstance.current.resize(500, rows)
        if (connectionIdRef.current && isConnectedRef.current) {
          window.electronAPI.sshResize(connectionIdRef.current, 500, rows)
        }
      } else {
        // 换行：通过 FitAddon 恢复正常列数
        fitAddonRef.current.fit()
        const dims = fitAddonRef.current.proposeDimensions()
        if (dims && connectionIdRef.current && isConnectedRef.current) {
          window.electronAPI.sshResize(connectionIdRef.current, dims.cols || 80, dims.rows || 24)
        }
      }
    }

    // 切换 CSS 类以启用/禁用水平滚动
    if (terminalRef.current) {
      terminalRef.current.classList.toggle('no-wrap', !newValue)
    }
  }

  // 切换"输出时自动滚动到底部"
  const scrollOnOutputRef = useRef(true)
  const toggleScrollOnOutput = () => {
    const newValue = !scrollOnOutput
    setScrollOnOutput(newValue)
    scrollOnOutputRef.current = newValue
  }

  // 调整字体大小（delta=0 表示重置为默认 14）
  const changeFontSize = (delta: number) => {
    const newSize = delta === 0 ? 14 : Math.max(8, Math.min(32, fontSize + delta))
    setFontSize(newSize)
    if (terminalInstance.current) {
      terminalInstance.current.options.fontSize = newSize
      setTimeout(() => {
        if (wordWrapRef.current) {
          fitAddonRef.current?.fit()
        } else if (terminalInstance.current && fitAddonRef.current) {
          const dims = fitAddonRef.current.proposeDimensions()
          if (dims) {
            terminalInstance.current.resize(500, dims.rows || 24)
          }
        }
      }, 0)
    }
  }

  // 更新快捷键回调 refs
  changeFontSizeRef.current = changeFontSize
  toggleSearchRef.current = () => {
    if (searchVisible) {
      handleSearchClose()
    } else {
      setSearchVisible(true)
    }
  }
  copySelectionSilentRef.current = copySelectionSilent
  pasteToTerminalRef.current = pasteToTerminal

  // 清屏
  const clearTerminal = () => {
    if (terminalInstance.current) {
      terminalInstance.current.clear()
    }
  }

  // 复制选中内容（带提示）
  const copySelection = async () => {
    if (terminalInstance.current) {
      const selection = terminalInstance.current.getSelection()
      if (selection) {
        try {
          await navigator.clipboard.writeText(selection)
          message.success('已复制到剪贴板')
        } catch {
          message.error('复制失败，请检查浏览器权限')
        }
      } else {
        message.info('请先选择要复制的内容')
      }
    }
  }

  // 滚动到底部
  const scrollToBottom = () => {
    terminalInstance.current?.scrollToBottom()
  }

  // 搜索
  const handleSearch = (value: string) => {
    if (searchAddonRef.current && value) {
      const found = searchAddonRef.current.findNext(value, { caseSensitive: false, incremental: true })
      if (!found) {
        message.info('未找到匹配内容')
      }
    }
  }

  const handleSearchPrev = () => {
    if (searchAddonRef.current && searchText) {
      searchAddonRef.current.findPrevious(searchText, { caseSensitive: false })
    }
  }

  const handleSearchClose = () => {
    setSearchVisible(false)
    setSearchText('')
    searchAddonRef.current?.clearDecorations()
    terminalInstance.current?.focus()
  }

  // 导出日志
  const exportLog = () => {
    if (terminalInstance.current) {
      const lines: string[] = []
      const buffer = terminalInstance.current.buffer.active
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i)
        if (line) {
          lines.push(line.translateToString())
        }
      }
      const content = lines.join('\n')
      const blob = new Blob([content], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `terminal-log-${new Date().toISOString().slice(0, 10)}.txt`
      a.click()
      URL.revokeObjectURL(url)
      message.success('日志已导出')
    }
  }

  // 获取历史命令（通过交互式 shell 获取，能读到当前会话的命令）
  const fetchHistory = useCallback(async () => {
    if (!connectionId || !isConnected) return
    setHistoryLoading(true)
    try {
      const result = await window.electronAPI.sshGetShellHistory(connectionId, 200)
      if (result.success && result.output) {
        const cmds = result.output
          .split('\n')
          .map(line => {
            // bash history 格式: "  123  command" / zsh fc 格式: "  123  command"
            return line.replace(/^\s*\d+\*?\s+/, '').trim()
          })
          .filter(line => line.length > 0)
          .reverse()
        // 去重，限制最多 50 条
        const unique = [...new Set(cmds)].slice(0, 50)
        setHistoryCommands(unique)
      }
    } catch { /* ignore */ }
    setHistoryLoading(false)
  }, [connectionId, isConnected])

  // 执行历史命令（写入 shell）
  const executeHistoryCommand = useCallback((cmd: string) => {
    if (connectionId && isConnected) {
      window.electronAPI.sshWrite(connectionId, cmd + '\n')
    }
    setHistoryOpen(false)
    terminalInstance.current?.focus()
  }, [connectionId, isConnected])

  // 构建右键菜单
  const hasSelection = terminalInstance.current?.hasSelection() || false

  const contextMenuItems: MenuProps['items'] = [
    {
      key: 'copy',
      label: '复制',
      icon: <CopyOutlined />,
      disabled: !hasSelection,
      onClick: async () => {
        await copySelectionSilent()
        setContextMenuPos(null)
      },
    },
    {
      key: 'paste',
      label: '粘贴',
      icon: <SnippetsOutlined />,
      onClick: async () => {
        await pasteToTerminal()
        setContextMenuPos(null)
      },
    },
    {
      key: 'copyPaste',
      label: '复制并粘贴',
      icon: <ScissorOutlined />,
      disabled: !hasSelection,
      onClick: async () => {
        await copyAndPaste()
        setContextMenuPos(null)
      },
    },
    { type: 'divider' },
    {
      key: 'selectAll',
      label: '全选',
      icon: <SelectOutlined />,
      onClick: () => {
        selectAll()
        setContextMenuPos(null)
      },
    },
    {
      key: 'clear',
      label: '清屏',
      icon: <ClearOutlined />,
      onClick: () => {
        clearTerminal()
        setContextMenuPos(null)
      },
    },
    {
      key: 'scrollBottom',
      label: '滚动到底部',
      icon: <VerticalAlignBottomOutlined />,
      onClick: () => {
        scrollToBottom()
        setContextMenuPos(null)
      },
    },
    { type: 'divider' },
    {
      key: 'search',
      label: '搜索',
      icon: <SearchOutlined />,
      onClick: () => {
        setSearchVisible(true)
        setContextMenuPos(null)
      },
    },
    {
      key: 'export',
      label: '导出日志',
      icon: <ExportOutlined />,
      onClick: () => {
        exportLog()
        setContextMenuPos(null)
      },
    },
    ...(connection && onToggleSFTP ? [
      { type: 'divider' as const },
      {
        key: 'openSFTP',
        label: sftpVisible ? 'SFTP 定位到当前目录' : '打开 SFTP',
        icon: <FolderOutlined />,
        onClick: async () => {
          const path = await getCurrentPath()
          onToggleSFTP(path)
          setContextMenuPos(null)
        },
      },
    ] : []),
    ...(isDisconnected && onReconnect ? [
      { type: 'divider' as const },
      {
        key: 'reconnect',
        label: '重新连接',
        icon: <LinkOutlined />,
        onClick: () => {
          onReconnect()
          setContextMenuPos(null)
        },
      },
    ] : []),
  ]

  // 选择配色预设
  const selectPreset = (id: string) => {
    setPreset(actualTheme, id)
  }

  return (
    <div className="terminal-panel">
      {/* 终端工具栏 */}
      <div className="terminal-toolbar">
        <div className="toolbar-left">
          <Tooltip title={wordWrap ? '关闭自动换行' : '开启自动换行'}>
            <Button
              type={wordWrap ? 'default' : 'primary'}
              icon={<AimOutlined />}
              size="small"
              onClick={toggleWordWrap}
            >
              {wordWrap ? '换行' : '不换行'}
            </Button>
          </Tooltip>

          <Tooltip title="滚动到底部">
            <Button
              icon={<VerticalAlignBottomOutlined />}
              size="small"
              onClick={scrollToBottom}
            />
          </Tooltip>

          <Tooltip title="清屏">
            <Button
              icon={<ClearOutlined />}
              size="small"
              onClick={clearTerminal}
            />
          </Tooltip>

          {connection && (
            <span className="connection-status">
              {isConnected ? (
                <>
                  <UserOutlined style={{ color: 'var(--success-color)' }} />
                  <span style={{ color: 'var(--success-color)', marginLeft: 4 }}>
                    {serverConfig?.username || 'user'}
                  </span>
                </>
              ) : (
                <>
                  <DisconnectOutlined style={{ color: 'var(--error-color)' }} />
                  <span style={{ color: 'var(--error-color)', marginLeft: 4 }}>
                    {connection.status === 'connecting' ? '连接中...' : '已断开'}
                  </span>
                  {isDisconnected && onReconnect && (
                    <Button
                      type="link"
                      size="small"
                      onClick={onReconnect}
                      style={{ padding: '0 4px', height: 'auto' }}
                    >
                      重连
                    </Button>
                  )}
                </>
              )}
            </span>
          )}
        </div>

        <div className="toolbar-center">
          {searchVisible && (
            <Space.Compact size="small">
              <Input
                placeholder="搜索终端内容..."
                size="small"
                style={{ width: 280 }}
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value)
                  // 实时增量搜索
                  if (searchAddonRef.current && e.target.value) {
                    searchAddonRef.current.findNext(e.target.value, { caseSensitive: false, incremental: true })
                  } else {
                    searchAddonRef.current?.clearDecorations()
                  }
                }}
                onPressEnter={() => handleSearch(searchText)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') handleSearchClose()
                }}
                autoFocus
              />
              <Tooltip title="上一个">
                <Button size="small" icon={<UpOutlined />} onClick={handleSearchPrev} disabled={!searchText} />
              </Tooltip>
              <Tooltip title="下一个">
                <Button size="small" icon={<DownOutlined />} onClick={() => handleSearch(searchText)} disabled={!searchText} />
              </Tooltip>
              <Tooltip title="关闭搜索">
                <Button size="small" icon={<CloseOutlined />} onClick={handleSearchClose} />
              </Tooltip>
            </Space.Compact>
          )}
        </div>

        <div className="toolbar-right">
          <Tooltip title="搜索 (Ctrl+F)">
            <Button
              icon={<SearchOutlined />}
              size="small"
              type={searchVisible ? 'primary' : 'default'}
              onClick={() => {
                if (searchVisible) {
                  handleSearchClose()
                } else {
                  setSearchVisible(true)
                }
              }}
            />
          </Tooltip>

          <Tooltip title="复制选中内容">
            <Button
              icon={<CopyOutlined />}
              size="small"
              onClick={copySelection}
            />
          </Tooltip>

          <Tooltip title="导出日志">
            <Button
              icon={<ExportOutlined />}
              size="small"
              onClick={exportLog}
            />
          </Tooltip>

          {connection && isConnected && (
            <Tooltip title="历史命令">
              <Button
                icon={<HistoryOutlined />}
                size="small"
                type={historyOpen ? 'primary' : 'default'}
                onClick={() => {
                  if (!historyOpen) fetchHistory()
                  setHistoryOpen(!historyOpen)
                }}
              />
            </Tooltip>
          )}

          {connection && onToggleSFTP && (
            <Tooltip title={sftpVisible ? 'SFTP 定位到当前目录' : '打开 SFTP'}>
              <Button
                icon={<FolderOutlined />}
                size="small"
                type={sftpVisible ? 'primary' : 'default'}
                onClick={async () => {
                  const path = await getCurrentPath()
                  onToggleSFTP(path)
                }}
              />
            </Tooltip>
          )}

          <Tooltip title="终端设置">
            <Button
              icon={<SettingOutlined />}
              size="small"
              type={settingsOpen ? 'primary' : 'default'}
              onClick={() => setSettingsOpen(!settingsOpen)}
            />
          </Tooltip>
        </div>
      </div>

      {/* 历史命令面板 */}
      {historyOpen && (
        <TerminalHistoryPanel
          commands={historyCommands}
          loading={historyLoading}
          onExecute={executeHistoryCommand}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {/* 设置面板 */}
      {settingsOpen && (
        <TerminalSettingsPanel
          wordWrap={wordWrap}
          scrollOnOutput={scrollOnOutput}
          fontSize={fontSize}
          actualTheme={actualTheme}
          currentPresetId={currentPresetId}
          currentPresetsMap={currentPresetsMap}
          currentCustomColors={currentCustomColors}
          onToggleWordWrap={toggleWordWrap}
          onToggleScrollOnOutput={toggleScrollOnOutput}
          onChangeFontSize={changeFontSize}
          onSelectPreset={selectPreset}
          onSetCustomColor={setCustomColor}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* 终端容器 */}
      <div ref={terminalRef} className="terminal-container" />

      {/* 右键菜单 */}
      {contextMenuPos && (
        <div
          className="terminal-context-menu"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
        >
          <Dropdown
            menu={{ items: contextMenuItems }}
            open={true}
            onOpenChange={(open) => { if (!open) setContextMenuPos(null) }}
          >
            <div />
          </Dropdown>
        </div>
      )}
    </div>
  )
}

export default TerminalPanel