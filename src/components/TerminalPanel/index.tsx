import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import type { ITerminalOptions } from '@xterm/xterm'
import { Button, Dropdown, Input, App, Space } from 'antd'
import type { MenuProps } from 'antd'
import {
  SearchOutlined,
  ClearOutlined,
  CopyOutlined,
  ExportOutlined,
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
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useThemeStore } from '../../stores/themeStore'
import { useConnectionStore } from '../../stores/connectionStore'
import { useServerStore } from '../../stores/serverStore'
import { useTerminalThemeStore, getTerminalColorScheme } from '../../stores/terminalThemeStore'
import { useTerminalHistoryStore } from '../../stores/terminalHistoryStore'
import TerminalHistoryPanel from './TerminalHistoryPanel'
import QuickCommandsPanel from './QuickCommandsPanel'
import Tooltip from '../DelayedTooltip'
import '@xterm/xterm/css/xterm.css'
import './index.css'

interface TerminalPanelProps {
  connectionId?: string
  serverId?: string
  connectionStatus?: 'connecting' | 'connected' | 'disconnected' | 'error'
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
  serverId,
  connectionStatus,
  isActive = true,
  sftpVisible = false,
  onToggleSFTP,
  onReconnect,
  serverConfig,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null)
  const disconnectedOverlayRef = useRef<HTMLDivElement>(null)
  const terminalInstance = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const { actualTheme } = useThemeStore()
  const { getConnection } = useConnectionStore()
  const { message } = App.useApp()

  // 终端设置 — 从全局 store 读取
  const terminalThemeState = useTerminalThemeStore()
  const { fontSize, fontFamily, wordWrap, scrollOnOutput } = terminalThemeState
  const { setFontSize, setWordWrap } = terminalThemeState

  // 使用 ref 存储最新的连接状态，避免闭包问题
  const connectionIdRef = useRef(connectionId)
  const serverIdRef = useRef(serverId)
  const isConnectedRef = useRef(false)
  const reconnectableRef = useRef(false)
  const reconnectPendingRef = useRef(false)
  const needsSessionResetRef = useRef(false)
  const onReconnectRef = useRef(onReconnect)
  const wordWrapRef = useRef(wordWrap)
  const addCommandRef = useRef<(serverId: string, command: string) => void>(() => {})
  const restoreFocusAfterContextMenuRef = useRef(false)

  // 获取连接状态
  const connection = connectionId ? getConnection(connectionId) : undefined
  const effectiveStatus = connection?.status ?? connectionStatus ?? 'disconnected'
  const isConnected = effectiveStatus === 'connected'
  const isDisconnected = effectiveStatus === 'disconnected' || effectiveStatus === 'error'

  // 直接在渲染时更新 ref，确保闭包中始终拿到最新值
  connectionIdRef.current = connectionId
  serverIdRef.current = serverId
  isConnectedRef.current = isConnected || false
  reconnectableRef.current = isDisconnected
  onReconnectRef.current = onReconnect
  wordWrapRef.current = wordWrap

  if (!isDisconnected) {
    reconnectPendingRef.current = false
  }

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
  const [terminalReady, setTerminalReady] = useState(false)

  const [searchVisible, setSearchVisible] = useState(false)
  const [searchText, setSearchText] = useState('')

  // 历史命令 - 使用本地 store
  const [historyOpen, setHistoryOpen] = useState(false)
  const { getHistory, addCommand, deleteCommand, clearHistory } = useTerminalHistoryStore()
  const historyCommands = serverId ? getHistory(serverId) : []
  // 输入缓冲区（用于保存历史命令）
  const inputBufferRef = useRef('')
  // 更新 addCommandRef
  addCommandRef.current = addCommand

  // 右键菜单
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null)

  // 快捷命令面板
  const [quickCmdsOpen, setQuickCmdsOpen] = useState(false)
  const { servers, updateServer } = useServerStore()

  const focusTerminal = useCallback(() => {
    requestAnimationFrame(() => {
      if (!terminalInstance.current || !isActive || isDisconnected || searchVisible) return
      terminalInstance.current.focus()
    })
  }, [isActive, isDisconnected, searchVisible])

  // 终端配色
  const currentPresetId = actualTheme === 'dark' ? terminalThemeState.darkPresetId : terminalThemeState.lightPresetId
  const currentCustomColors = actualTheme === 'dark' ? terminalThemeState.customDark : terminalThemeState.customLight

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
      } else if (text) {
        message.info('当前连接已断开')
      }
    } catch {
      message.error('粘贴失败，请检查剪贴板权限')
    }
  }, [focusTerminal, message])

  const pasteToTerminalAndFocus = useCallback(async () => {
    await pasteToTerminal()
    focusTerminal()
  }, [focusTerminal, pasteToTerminal])

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
  }, [focusTerminal, message])

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
          } else {
            message.info('当前连接已断开')
          }
          terminalInstance.current.clearSelection()
        } catch {
          message.error('操作失败')
        }
      }
    }
  }, [message])

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

    const container = terminalRef.current

    const terminalOptions: ITerminalOptions = {
      fontSize: useTerminalThemeStore.getState().fontSize,
      fontFamily: useTerminalThemeStore.getState().fontFamily,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 50000,
      rightClickSelectsWord: true,
      theme: getTerminalColorScheme(
        useThemeStore.getState().actualTheme,
        useTerminalThemeStore.getState()
      ),
    }
    const term = new Terminal(terminalOptions)

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    const searchAddon = new SearchAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.loadAddon(searchAddon)

    // 自定义快捷键拦截：返回 false 阻止 xterm 处理，交给我们的 UI 逻辑
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      // 只在 keydown 时处理
      if (e.type !== 'keydown') return true

      if (!isConnectedRef.current) {
        const isEnter = e.key === 'Enter' || e.key === 'NumpadEnter'
        if (isEnter && reconnectableRef.current && onReconnectRef.current) {
          return true
        }
        e.preventDefault()
        return false
      }

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

    // 处理终端输入
    term.onData((data) => {
      if (connectionIdRef.current && isConnectedRef.current) {
        window.electronAPI.sshWrite(connectionIdRef.current, data)

        // 追踪用户输入以保存历史命令
        const sid = serverIdRef.current
        if (sid) {
          if (data === '\r' || data === '\n') {
            // 回车：保存缓冲区中的命令
            const cmd = inputBufferRef.current.trim()
            if (cmd) {
              addCommandRef.current(sid, cmd)
            }
            inputBufferRef.current = ''
          } else if (data === '\x03') {
            // Ctrl+C：清空缓冲区
            inputBufferRef.current = ''
          } else if (data === '\x15') {
            // Ctrl+U：清空当前行
            inputBufferRef.current = ''
          } else if (data === '\x7f' || data === '\b') {
            // 退格/删除：删除最后一个字符
            inputBufferRef.current = inputBufferRef.current.slice(0, -1)
          } else if (data.charCodeAt(0) >= 32 && data.charCodeAt(0) < 127) {
            // 可打印 ASCII 字符：累积到缓冲区
            inputBufferRef.current += data
          } else if (data.charCodeAt(0) > 127) {
            // 非 ASCII 字符（如中文）：累积到缓冲区
            inputBufferRef.current += data
          }
          // 忽略其他控制字符（如方向键、功能键等）
        }
      } else if (data === '\r' || data === '\n') {
        // 断开连接后，按回车触发重连
        if (!reconnectPendingRef.current && onReconnectRef.current) {
          term.writeln('')
          term.writeln('\x1b[36m── 正在重新连接... ──\x1b[0m')
          triggerReconnect()
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

    // 等容器有尺寸后再 open 终端，避免 xterm 渲染器初始化失败
    let cancelled = false
    const openWhenReady = () => {
      if (cancelled) return
      if (container.clientWidth === 0 || container.clientHeight === 0) {
        requestAnimationFrame(openWhenReady)
        return
      }

      term.open(container)
      terminalInstance.current = term
      fitAddonRef.current = fitAddon
      searchAddonRef.current = searchAddon
      setTerminalReady(true)

      try {
        fitAddon.fit()
        const dims = fitAddon.proposeDimensions()
        if (dims) {
          setTerminalSize({ cols: dims.cols || 80, rows: dims.rows || 24 })
        }
      } catch { /* ignore */ }

      // 显示连接信息
      if (serverConfig) {
        // const portStr = serverConfig.port !== 22 ? ` -p ${serverConfig.port}` : ''
        term.writeln('')
        term.writeln('\x1b[32m  SSHTools Terminal\x1b[0m')
        // term.writeln(`\x1b[90m  ssh ${serverConfig.username}@${serverConfig.host}${portStr}\x1b[0m`)
      }

      resizeObserver.observe(container)
    }
    requestAnimationFrame(openWhenReady)

    return () => {
      cancelled = true
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
      if (data.id === connectionId) {
        // 更新 store 状态为断开，使 isConnectedRef 在下次渲染时变为 false
        useConnectionStore.getState().updateConnection(connectionId, { status: 'disconnected' })
        needsSessionResetRef.current = true
        inputBufferRef.current = ''
        if (terminalInstance.current) {
          terminalInstance.current.writeln('')
          terminalInstance.current.writeln('\x1b[33m── 连接已断开 ──\x1b[0m')
          terminalInstance.current.writeln('\x1b[33m按 Enter 键重新连接，或点击工具栏「重连」按钮\x1b[0m')
        }
      }
    }

    const handleSSHError = (data: { id: string; error: string }) => {
      if (data.id === connectionId) {
        useConnectionStore.getState().updateConnection(connectionId, { status: 'error', error: data.error })
        needsSessionResetRef.current = true
        inputBufferRef.current = ''
        if (terminalInstance.current) {
          terminalInstance.current.writeln('')
          terminalInstance.current.writeln(`\x1b[31m── 连接错误: ${data.error} ──\x1b[0m`)
          terminalInstance.current.writeln('\x1b[33m按 Enter 键重新连接，或点击工具栏「重连」按钮\x1b[0m')
        }
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
    if (connectionId && isConnected && terminalReady && terminalInstance.current) {
      window.electronAPI.sshStartShell(connectionId).then((result) => {
        if (!result.success) {
          terminalInstance.current?.writeln(`\x1b[31m启动 Shell 失败: ${result.error}\x1b[0m`)
        } else {
          const shouldResetForNewSession = !result.reused && needsSessionResetRef.current

          if (terminalInstance.current && (result.reused || shouldResetForNewSession)) {
            terminalInstance.current.reset()
          }
          if (shouldResetForNewSession && terminalInstance.current) {
            terminalInstance.current.writeln('\x1b[36m── 已重新连接，新的终端会话已建立 ──\x1b[0m')
            terminalInstance.current.writeln('')
          }
          if (shouldResetForNewSession) {
            needsSessionResetRef.current = false
            inputBufferRef.current = ''
          }

          // 显示连接成功提示
          if (terminalInstance.current && !result.reused) {
            terminalInstance.current.writeln(`\x1b[32m  连接成功\x1b[0m`)
            terminalInstance.current.writeln('')
          }
          if (terminalInstance.current && result.buffer) {
            // 写入初始输出（SSH banner + MOTD + Last login 等）
            terminalInstance.current.write(result.buffer)
          }
          if (terminalInstance.current) {
            requestAnimationFrame(() => {
              terminalInstance.current?.scrollToBottom()
              if (isActive) {
                terminalInstance.current?.focus()
              }
            })
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
  }, [connectionId, isConnected, terminalReady])

  useEffect(() => {
    const term = terminalInstance.current
    const container = terminalRef.current
    if (!term || !container) return

    container.classList.toggle('terminal-container-disconnected', isDisconnected)

    if (isDisconnected) {
      needsSessionResetRef.current = true
      term.blur()
      disconnectedOverlayRef.current?.focus()
      return
    }

    if (isActive) {
      term.focus()
    }
  }, [isActive, isDisconnected])

  // 主题/配色变化时更新终端
  useEffect(() => {
    if (terminalInstance.current) {
      try {
        terminalInstance.current.options.theme = terminalColorScheme
      } catch { /* 终端未渲染时忽略 */ }
    }
  }, [terminalColorScheme])

  // 全局字体大小变化时更新终端
  useEffect(() => {
    if (terminalInstance.current) {
      try {
        terminalInstance.current.options.fontSize = fontSize
      } catch { /* ignore */ }
      // 仅在终端可见时重新 fit
      if (isActive) {
        setTimeout(() => {
          try {
            if (wordWrapRef.current) {
              fitAddonRef.current?.fit()
            } else if (terminalInstance.current && fitAddonRef.current) {
              const dims = fitAddonRef.current.proposeDimensions()
              if (dims) {
                terminalInstance.current.resize(500, dims.rows || 24)
              }
            }
          } catch { /* 容器不可见时忽略 */ }
        }, 0)
      }
    }
  }, [fontSize, isActive])

  // 全局字体变化时更新终端
  useEffect(() => {
    if (terminalInstance.current) {
      try {
        terminalInstance.current.options.fontFamily = fontFamily
      } catch { /* ignore */ }
      if (isActive) {
        setTimeout(() => {
          try {
            if (wordWrapRef.current) {
              fitAddonRef.current?.fit()
            } else if (terminalInstance.current && fitAddonRef.current) {
              const dims = fitAddonRef.current.proposeDimensions()
              if (dims) {
                terminalInstance.current.resize(500, dims.rows || 24)
              }
            }
          } catch { /* ignore */ }
        }, 0)
      }
    }
  }, [fontFamily, isActive])

  // 全局换行设置变化时更新终端（仅在当前标签页可见时执行）
  useEffect(() => {
    if (!terminalInstance.current || !fitAddonRef.current || !isActive) return
    try {
      if (!wordWrap) {
        const rows = terminalInstance.current.rows
        terminalInstance.current.resize(500, rows)
        if (connectionIdRef.current && isConnectedRef.current) {
          window.electronAPI.sshResize(connectionIdRef.current, 500, rows)
        }
      } else {
        fitAddonRef.current.fit()
        const dims = fitAddonRef.current.proposeDimensions()
        if (dims && connectionIdRef.current && isConnectedRef.current) {
          window.electronAPI.sshResize(connectionIdRef.current, dims.cols || 80, dims.rows || 24)
        }
      }
    } catch { /* ignore */ }
    if (terminalRef.current) {
      terminalRef.current.classList.toggle('no-wrap', !wordWrap)
    }
  }, [wordWrap, isActive])

  // 右键菜单处理
  useEffect(() => {
    const el = terminalRef.current
    if (!el) return

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      restoreFocusAfterContextMenuRef.current = isActive && !isDisconnected
      setContextMenuPos({ x: e.clientX, y: e.clientY })
    }

    el.addEventListener('contextmenu', handleContextMenu)
    return () => el.removeEventListener('contextmenu', handleContextMenu)
  }, [isActive, isDisconnected])

  // 点击其他地方关闭右键菜单
  useEffect(() => {
    if (!contextMenuPos) return
    const handleClick = () => setContextMenuPos(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [contextMenuPos])

  useEffect(() => {
    if (contextMenuPos || !restoreFocusAfterContextMenuRef.current) return
    restoreFocusAfterContextMenuRef.current = false
    focusTerminal()
  }, [contextMenuPos, focusTerminal])

  // 切换自动换行
  const toggleWordWrap = () => {
    setWordWrap(!wordWrap)
  }

  // scrollOnOutput 通过 ref 访问最新值（闭包安全）
  const scrollOnOutputRef = useRef(scrollOnOutput)
  scrollOnOutputRef.current = scrollOnOutput

  // 调整字体大小（delta=0 表示重置为默认 14）
  const changeFontSize = (delta: number) => {
    setFontSize(delta === 0 ? 14 : fontSize + delta)
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
  pasteToTerminalRef.current = pasteToTerminalAndFocus

  // 清屏
  const clearTerminal = () => {
    if (terminalInstance.current) {
      terminalInstance.current.clear()
    }
  }

  const triggerReconnect = useCallback(() => {
    if (!onReconnectRef.current || !reconnectableRef.current || reconnectPendingRef.current) {
      return
    }

    reconnectPendingRef.current = true
    onReconnectRef.current()
  }, [])

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

  // 执行历史命令（写入 shell）
  const executeHistoryCommand = useCallback((cmd: string) => {
    if (connectionId && isConnected) {
      window.electronAPI.sshWrite(connectionId, cmd + '\n')
      // 同时保存到本地历史（确保执行的命令被记录）
      if (serverId) {
        addCommandRef.current(serverId, cmd)
      }
    }
    setHistoryOpen(false)
    terminalInstance.current?.focus()
  }, [connectionId, isConnected, serverId])

  // 构建右键菜单
  const hasSelection = terminalInstance.current?.hasSelection() || false

  const handleDisconnectedOverlayKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === 'Enter' || e.key === 'NumpadEnter') && onReconnect) {
      e.preventDefault()
      triggerReconnect()
    }
  }

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
        await pasteToTerminalAndFocus()
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
        focusTerminal()
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
        restoreFocusAfterContextMenuRef.current = false
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
          restoreFocusAfterContextMenuRef.current = false
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
          triggerReconnect()
          setContextMenuPos(null)
        },
      },
    ] : []),
  ]


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
                      onClick={triggerReconnect}
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
          <Tooltip title="搜索 (Ctrl+F)" placement="bottom">
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

          <Tooltip title="复制选中内容" placement="bottom">
            <Button
              icon={<CopyOutlined />}
              size="small"
              onClick={copySelection}
            />
          </Tooltip>

          <Tooltip title="导出日志" placement="bottom">
            <Button
              icon={<ExportOutlined />}
              size="small"
              onClick={exportLog}
            />
          </Tooltip>

          {connection && isConnected && serverId && (
            <Tooltip title="历史命令" placement="bottom">
              <Button
                icon={<HistoryOutlined />}
                size="small"
                type={historyOpen ? 'primary' : 'default'}
                onClick={() => setHistoryOpen(!historyOpen)}
              />
            </Tooltip>
          )}

          {connection && serverId && (
            <Tooltip title="快捷命令" placement="bottom">
              <Button
                icon={<ThunderboltOutlined />}
                size="small"
                type={quickCmdsOpen ? 'primary' : 'default'}
                onClick={() => setQuickCmdsOpen(!quickCmdsOpen)}
              />
            </Tooltip>
          )}

          {connection && onToggleSFTP && (
            <Tooltip title={sftpVisible ? 'SFTP 定位到当前目录' : '打开 SFTP'} placement="bottomRight">
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

        </div>
      </div>

      {/* 历史命令面板 */}
      {historyOpen && serverId && (
        <TerminalHistoryPanel
          commands={historyCommands}
          onExecute={executeHistoryCommand}
          onDelete={(cmd) => deleteCommand(serverId, cmd)}
          onClear={() => clearHistory(serverId)}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {/* 快捷命令面板 */}
      {quickCmdsOpen && serverId && (
        <QuickCommandsPanel
          commands={servers.find(s => s.id === serverId)?.quickCommands || []}
          onExecute={(cmd) => {
            if (connectionId && isConnected) {
              window.electronAPI.sshWrite(connectionId, cmd)
            }
            terminalInstance.current?.focus()
          }}
          onSave={(cmds) => {
            updateServer(serverId, { quickCommands: cmds })
          }}
          onClose={() => setQuickCmdsOpen(false)}
        />
      )}

      {/* 终端容器 */}
      <div ref={terminalRef} className="terminal-container" />

      {isDisconnected && onReconnect && (
        <div
          ref={disconnectedOverlayRef}
          className="terminal-disconnected-overlay"
          tabIndex={0}
          onKeyDown={handleDisconnectedOverlayKeyDown}
          onClick={() => disconnectedOverlayRef.current?.focus()}
        >
          <DisconnectOutlined className="terminal-disconnected-icon" />
          <div className="terminal-disconnected-title">连接已断开</div>
          <div className="terminal-disconnected-hint">按回车重新连接</div>
        </div>
      )}

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
