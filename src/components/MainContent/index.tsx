import { useState, useEffect, useRef, useCallback } from 'react'
import { Tabs, Button, Dropdown, App, Input, Modal, Checkbox } from 'antd'
import {
  PlusOutlined,
  ApiOutlined,
  CopyOutlined,
  DisconnectOutlined,
  LinkOutlined,
  CloseOutlined,
  FolderOutlined,
  FolderAddOutlined,
  RightOutlined,
  LeftOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  HomeOutlined,
  SearchOutlined,
  LockOutlined,
  FileTextOutlined,
  CodeOutlined,
  ThunderboltOutlined,
  SettingOutlined,
  BookOutlined,
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import TerminalPanel from '../TerminalPanel'
import SFTPPanel from '../SFTPPanel'
import ConnectionDetailPanel from '../ConnectionDetailPanel'
import EditorPanel from '../EditorPanel'
import ServerTree from '../ServerTree'
import NewSessionModal from '../SessionManager/NewSessionModal'
import CommandsPanel from '../CommandsPanel'
import DocPanel from '../DocPanel'
import { useConnectionStore, connectServer, disconnectServer } from '../../stores/connectionStore'
import { useServerStore } from '../../stores/serverStore'
import { onSessionConnect } from '../SessionManager'
import { useSettingsModal } from '../SettingsModal'
import './index.css'

// 序列化标签数据（用于跨窗口传输）
interface SerializedTab {
  key: string
  label: string
  type: 'home' | 'terminal' | 'editor' | 'commands' | 'doc'
  serverId?: string
  serverName?: string
  connectionId?: string
  status?: string
}

interface TabItem {
  key: string
  label: string
  type: 'home' | 'terminal' | 'editor' | 'commands' | 'doc'
  serverId?: string
  serverName?: string
  connectionId?: string
  status?: 'connecting' | 'connected' | 'disconnected' | 'error'
  sftpVisible: boolean
  sftpHeight: number
  sftpPath?: string
  sftpNavSeq: number  // 递增序号，每次触发导航时 +1
  detailPanelVisible: boolean
  // editor 专用字段
  editorRemotePath?: string
  editorFileName?: string
  editorDirty?: boolean
}

const HOME_TAB_KEY = '__home__'

// 从跨窗口传输的数据反序列化为 TabItem
function deserializeTab(tabData: Record<string, unknown>): TabItem {
  const type = tabData.type as 'terminal' | 'editor' | 'commands' | 'doc'

  // commands / doc 类型特殊处理
  if (type === 'commands' || type === 'doc') {
    return {
      key: tabData.key as string,
      label: tabData.label as string || (type === 'commands' ? '常用命令' : '使用文档'),
      type,
      sftpVisible: false,
      sftpHeight: 0,
      sftpNavSeq: 0,
      detailPanelVisible: false,
    }
  }
  
  return {
    key: tabData.key as string,
    label: tabData.label as string,
    type: type,
    serverId: tabData.serverId as string | undefined,
    serverName: tabData.serverName as string | undefined,
    connectionId: tabData.connectionId as string | undefined,
    status: (tabData.status as TabItem['status']) || 'connected',
    sftpVisible: false,
    sftpHeight: 0,
    sftpNavSeq: 0,
    detailPanelVisible: true,
  }
}

// 判断是否为认证相关错误
function isAuthError(error?: string): boolean {
  if (!error) return false
  const lower = error.toLowerCase()
  return lower.includes('authentication') ||
    lower.includes('auth') ||
    lower.includes('password') ||
    lower.includes('publickey') ||
    lower.includes('all configured authentication methods failed')
}

// 翻译常见 SSH 错误信息
function translateError(error?: string): string {
  if (!error) return ''
  const lower = error.toLowerCase()
  if (lower.includes('all configured authentication methods failed')) return '所有认证方式均失败，请检查密码或密钥是否正确'
  if (lower.includes('authentication failed')) return '认证失败，密码或密钥不正确'
  if (lower.includes('no supported authentication')) return '服务器不支持当前认证方式'
  if (lower.includes('connection refused')) return '连接被拒绝，请检查主机地址和端口'
  if (lower.includes('timed out') || lower.includes('timeout')) return '连接超时，请检查网络和主机地址'
  if (lower.includes('getaddrinfo') || lower.includes('enotfound')) return '无法解析主机名，请检查地址是否正确'
  if (lower.includes('econnreset')) return '连接被重置'
  if (lower.includes('host key')) return '主机密钥验证失败'
  return error
}

interface MainContentProps {
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
}

const MainContent: React.FC<MainContentProps> = ({
  sidebarCollapsed,
  onToggleSidebar,
}) => {
  const [tabs, setTabs] = useState<TabItem[]>([
    {
      key: HOME_TAB_KEY,
      label: '首页',
      type: 'home',
      sftpVisible: false,
      sftpHeight: 0,
      sftpNavSeq: 0,
      detailPanelVisible: false,
    },
  ])
  const [activeKey, setActiveKey] = useState<string>(HOME_TAB_KEY)
  const activeKeyRef = useRef(activeKey)
  activeKeyRef.current = activeKey
  const [detailPanelVisible, setDetailPanelVisible] = useState(true)
  const [detailPanelWidth, setDetailPanelWidth] = useState(300)
  const { message, modal } = App.useApp()

  const { servers, groups, touchServer, updateServer, addServer, addGroup } = useServerStore()
  const { connections, getConnection } = useConnectionStore()

  // 新建会话弹窗状态
  const [newSessionVisible, setNewSessionVisible] = useState(false)

  // 密码重试弹窗状态
  const [retryModal, setRetryModal] = useState<{
    visible: boolean
    serverId: string
    serverName: string
    username: string
    host: string
    port: number
    tabKey: string
    authType: 'password' | 'privateKey'
    reason: 'no_password' | 'auth_failed'
    error?: string
  } | null>(null)
  const retryPasswordRef = useRef('')
  const retryPassphraseRef = useRef('')
  const retryRememberRef = useRef(false)

  // 新建分组弹窗状态
  const [newGroupVisible, setNewGroupVisible] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  // 详情面板展开/收起后，通知终端 refit
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 50)
    return () => clearTimeout(timer)
  }, [detailPanelVisible])

  // 监听连接状态变化
  useEffect(() => {
    setTabs(prevTabs => prevTabs.map(tab => {
      if (!tab.connectionId) return tab

      const conn = getConnection(tab.connectionId)
      if (!conn) return { ...tab, status: 'disconnected' as const }

      return {
        ...tab,
        status: conn.status === 'connected' ? 'connected' :
                conn.status === 'connecting' ? 'connecting' :
                conn.status === 'error' ? 'error' : 'disconnected',
      }
    }))
  }, [connections, getConnection])

  // === 标签拖出窗口（跨窗口迁移） ===
  const tearOffTab = useCallback(async (tabKey: string, screenX: number, screenY: number) => {
    const tab = tabs.find(t => t.key === tabKey)
    if (!tab || tab.type === 'home') return

    const tabData: SerializedTab = {
      key: tab.key,
      label: tab.label,
      type: tab.type,
      serverId: tab.serverId,
      serverName: tab.serverName,
      connectionId: tab.connectionId,
      status: tab.status,
    }

    // 先询问主进程（主进程用真实光标位置判断），再决定是否移除标签
    const result = await window.electronAPI.tabTearOut({ tabData: { ...tabData }, screenX, screenY })
    if (result.action === 'none') return

    // 从当前窗口移除标签（不断开 SSH 连接）
    setTabs(prev => {
      const remaining = prev.filter(t => t.key !== tabKey)

      // 清理源窗口的连接状态（如果没有其他标签在用同一个连接）
      const removedTab = prev.find(t => t.key === tabKey)
      if (removedTab?.connectionId) {
        const otherTabUsing = remaining.some(t => t.connectionId === removedTab.connectionId)
        if (!otherTabUsing) {
          useConnectionStore.getState().removeConnection(removedTab.connectionId)
        }
      }

      // 如果移除的是当前活跃标签，选中上一个标签
      // 使用 activeKeyRef 获取最新值（避免 await 后闭包过期）
      // 使用 queueMicrotask 在本次渲染前完成（setTimeout 会导致一帧空白）
      if (activeKeyRef.current === tabKey) {
        const nextKey = remaining.length > 0 ? remaining[remaining.length - 1].key : HOME_TAB_KEY
        queueMicrotask(() => setActiveKey(nextKey))
      }
      return remaining
    })
  }, [tabs])

  const tearOffTabRef = useRef(tearOffTab)
  useEffect(() => { tearOffTabRef.current = tearOffTab })

  // === 接收来自其他窗口的标签 ===
  useEffect(() => {
    const receiveTab = (tabData: Record<string, unknown>) => {
      const newTab = deserializeTab(tabData)

      // 在 connectionStore 中注册连接状态（新窗口的 store 中没有）
      if (newTab.connectionId && newTab.serverId) {
        const { setConnection, getConnection } = useConnectionStore.getState()
        if (!getConnection(newTab.connectionId)) {
          setConnection(newTab.connectionId, {
            id: newTab.connectionId,
            serverId: newTab.serverId,
            serverName: newTab.serverName || '',
            status: 'connected',
            sftpReady: false,
          })
        }
      }

      // 根据光标屏幕坐标计算插入位置
      const screenX = tabData._screenX as number | undefined
      if (screenX !== undefined) {
        const navList = document.querySelector('.main-tabs .ant-tabs-nav-list')
        if (navList) {
          const tabNodes = Array.from(navList.querySelectorAll<HTMLElement>('.ant-tabs-tab'))
          // screenX → clientX（Electron 无边框窗口中 window.screenX 即视口左边缘屏幕坐标）
          const clientX = screenX - window.screenX
          let insertKey: string | null = null
          let insertPos: 'before' | 'after' = 'after'
          for (const node of tabNodes) {
            const rect = node.getBoundingClientRect()
            const mid = rect.left + rect.width / 2
            if (clientX < mid) {
              const key = node.getAttribute('data-node-key')
              if (key && key !== HOME_TAB_KEY) {
                insertKey = key
                insertPos = 'before'
              }
              break
            }
          }
          setTabs(prev => {
            if (insertKey) {
              const idx = prev.findIndex(t => t.key === insertKey)
              if (idx >= 0) {
                const newTabs = [...prev]
                newTabs.splice(insertPos === 'before' ? idx : idx + 1, 0, newTab)
                return newTabs
              }
            }
            return [...prev, newTab]
          })
          setActiveKey(newTab.key)
          return
        }
      }

      setTabs(prev => [...prev, newTab])
      setActiveKey(newTab.key)
    }

    const cleanup = window.electronAPI.onTabReceived(receiveTab)
    return cleanup
  }, [])

  // === 跨窗口拖拽指示器（目标窗口侧） ===
  useEffect(() => {
    const handleDragOver = (screenX: number) => {
      const navList = document.querySelector('.main-tabs .ant-tabs-nav-list')
      if (!navList) return
      // 清除旧指示器
      navList.querySelectorAll('.tab-drop-left, .tab-drop-right').forEach(el => {
        el.classList.remove('tab-drop-left', 'tab-drop-right')
      })
      // screenX → clientX
      const clientX = screenX - window.screenX
      const tabNodes = Array.from(navList.querySelectorAll<HTMLElement>('.ant-tabs-tab'))
      for (const node of tabNodes) {
        const key = node.getAttribute('data-node-key')
        if (key === HOME_TAB_KEY) continue
        const rect = node.getBoundingClientRect()
        if (clientX >= rect.left && clientX <= rect.right) {
          const mid = rect.left + rect.width / 2
          node.classList.add(clientX < mid ? 'tab-drop-left' : 'tab-drop-right')
          return
        }
      }
      // 光标在最后一个标签之后
      const lastTab = tabNodes[tabNodes.length - 1]
      if (lastTab) {
        const rect = lastTab.getBoundingClientRect()
        if (clientX > rect.right) {
          lastTab.classList.add('tab-drop-right')
        }
      }
    }

    const handleDragLeave = () => {
      const navList = document.querySelector('.main-tabs .ant-tabs-nav-list')
      if (!navList) return
      navList.querySelectorAll('.tab-drop-left, .tab-drop-right').forEach(el => {
        el.classList.remove('tab-drop-left', 'tab-drop-right')
      })
    }

    const cleanupOver = window.electronAPI.onTabDragOver(handleDragOver)
    const cleanupLeave = window.electronAPI.onTabDragLeave(handleDragLeave)
    return () => { cleanupOver(); cleanupLeave() }
  }, [])

  // === 新窗口加载初始标签 ===
  useEffect(() => {
    window.electronAPI.getInitTabs().then((tabData) => {
      if (!tabData) return

      const newTab = deserializeTab(tabData)

      // 在 connectionStore 中注册连接状态
      if (newTab.connectionId && newTab.serverId) {
        useConnectionStore.getState().setConnection(newTab.connectionId, {
          id: newTab.connectionId,
          serverId: newTab.serverId,
          serverName: newTab.serverName || '',
          status: 'connected',
          sftpReady: false,
        })
      }

      setTabs(prev => [...prev, newTab])
      setActiveKey(newTab.key)
    })
  }, [])

  // === 标签拖拽排序（基于 pointer 事件，支持自定义光标和窗口外捕获） ===
  const dragStateRef = useRef<{
    dragKey: string | null
    startX: number
    startY: number
    isDragging: boolean
    captureTarget: HTMLElement | null
    pointerId: number
  }>({ dragKey: null, startX: 0, startY: 0, isDragging: false, captureTarget: null, pointerId: -1 })
  const tabKeysStr = tabs.map(t => t.key).join(',')

  useEffect(() => {
    const navList = document.querySelector('.main-tabs .ant-tabs-nav-list')
    const nav = document.querySelector('.main-tabs .ant-tabs-nav')
    if (!navList || !nav) return

    const getTabNodes = () => Array.from(navList.querySelectorAll<HTMLElement>('.ant-tabs-tab'))
    const DRAG_THRESHOLD = 5

    const clearIndicators = () => {
      navList.querySelectorAll('.tab-drop-left, .tab-drop-right').forEach(el => {
        el.classList.remove('tab-drop-left', 'tab-drop-right')
      })
    }

    const findDropTarget = (x: number): { node: HTMLElement; pos: 'left' | 'right' } | null => {
      const nodes = getTabNodes()
      let closest: HTMLElement | null = null
      let minDist = Infinity
      for (const node of nodes) {
        const rect = node.getBoundingClientRect()
        if (x >= rect.left && x <= rect.right) {
          const mid = rect.left + rect.width / 2
          return { node, pos: x < mid ? 'left' : 'right' }
        }
        const center = rect.left + rect.width / 2
        const dist = Math.abs(x - center)
        if (dist < minDist) {
          minDist = dist
          closest = node
        }
      }
      if (closest) {
        const rect = closest.getBoundingClientRect()
        const mid = rect.left + rect.width / 2
        return { node: closest, pos: x < mid ? 'left' : 'right' }
      }
      return null
    }

    const cleanup = () => {
      const state = dragStateRef.current
      clearIndicators()
      document.body.classList.remove('tab-dragging-active')
      document.querySelector('.tab-tearoff-hint')?.remove()
      if (state.captureTarget && state.pointerId >= 0) {
        try { state.captureTarget.releasePointerCapture(state.pointerId) } catch { /* already released */ }
      }
      state.isDragging = false
      state.dragKey = null
      state.captureTarget = null
      state.pointerId = -1
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      const tab = (e.currentTarget as HTMLElement).closest('.ant-tabs-tab') as HTMLElement | null
      if (!tab) return
      const key = tab.getAttribute('data-node-key')
      if (!key || key === HOME_TAB_KEY) return
      if ((e.target as HTMLElement).closest('.ant-tabs-tab-remove')) return

      // 设置 pointer capture，确保窗口外也能收到 pointermove/pointerup
      tab.setPointerCapture(e.pointerId)

      dragStateRef.current.dragKey = key
      dragStateRef.current.startX = e.clientX
      dragStateRef.current.startY = e.clientY
      dragStateRef.current.isDragging = false
      dragStateRef.current.captureTarget = tab
      dragStateRef.current.pointerId = e.pointerId
    }

    const startDrag = (_e: PointerEvent) => {
      const state = dragStateRef.current
      state.isDragging = true
      document.body.classList.add('tab-dragging-active')

      const tabNode = navList.querySelector<HTMLElement>(`.ant-tabs-tab[data-node-key="${state.dragKey}"]`)
      const tabName = tabNode?.querySelector('.tab-name')?.textContent || ''

      // 通知主进程开始拖拽（主进程创建跨窗口统一的悬浮标签）
      window.electronAPI.tabDragHoverStart(tabName)
    }

    const onPointerMove = (e: PointerEvent) => {
      const state = dragStateRef.current
      if (!state.dragKey) return

      if (!state.isDragging) {
        const dx = e.clientX - state.startX
        const dy = e.clientY - state.startY
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
        startDrag(e)
      }

      const isInWindow = e.clientX > 0 && e.clientY > 0 &&
        e.clientX < window.innerWidth && e.clientY < window.innerHeight

      const navRect = nav.getBoundingClientRect()
      const isOverNav = e.clientX >= navRect.left && e.clientX <= navRect.right &&
        e.clientY >= navRect.top && e.clientY <= navRect.bottom

      if (isOverNav) {
        const target = findDropTarget(e.clientX)
        if (target) {
          const key = target.node.getAttribute('data-node-key')
          if (key && key !== state.dragKey && !(key === HOME_TAB_KEY && target.pos === 'left')) {
            clearIndicators()
            target.node.classList.add(`tab-drop-${target.pos}`)
          } else {
            clearIndicators()
          }
        } else {
          clearIndicators()
        }
      } else {
        clearIndicators()
      }

      const hint = document.querySelector('.tab-tearoff-hint')
      if (!isInWindow) {
        if (!hint) {
          const newHint = document.createElement('div')
          newHint.className = 'tab-tearoff-hint'
          newHint.textContent = '松开以在新窗口中打开'
          document.body.appendChild(newHint)
          requestAnimationFrame(() => newHint.classList.add('visible'))
        }
      } else if (hint) {
        hint.classList.remove('visible')
      }
    }

    const onPointerUp = (e: PointerEvent) => {
      const state = dragStateRef.current
      if (!state.dragKey) return

      const dragKey = state.dragKey

      if (!state.isDragging) {
        state.dragKey = null
        if (state.captureTarget && state.pointerId >= 0) {
          try { state.captureTarget.releasePointerCapture(state.pointerId) } catch { /* */ }
        }
        state.captureTarget = null
        state.pointerId = -1
        return
      }

      window.electronAPI.tabDragHoverEnd()

      // 用拖放指示器判断是否为同窗口排序（而非坐标判断，避免重叠区域误判）
      const dropNode = navList.querySelector<HTMLElement>('.tab-drop-left, .tab-drop-right')

      if (dropNode) {
        // 有指示器 → 同窗口排序
        const dropKey = dropNode.getAttribute('data-node-key')
        if (dropKey && dropKey !== dragKey) {
          const pos = dropNode.classList.contains('tab-drop-right') ? 'right' : 'left'
          setTabs(prev => {
            const dragIdx = prev.findIndex(t => t.key === dragKey)
            const dropIdx = prev.findIndex(t => t.key === dropKey)
            if (dragIdx < 0 || dropIdx < 0) return prev
            const newTabs = [...prev]
            const [dragged] = newTabs.splice(dragIdx, 1)
            const newDropIdx = newTabs.findIndex(t => t.key === dropKey)
            const insertIdx = pos === 'right' ? newDropIdx + 1 : newDropIdx
            newTabs.splice(insertIdx, 0, dragged)
            return newTabs
          })
        }
      } else if (dragKey !== HOME_TAB_KEY && tearOffTabRef.current) {
        // 无指示器 → 交由主进程判断（跨窗口迁移或取消）
        tearOffTabRef.current(dragKey, e.screenX, e.screenY)
      }

      cleanup()
    }

    // pointerdown 绑定在各个标签上（pointer capture 确保窗口外也能收到事件）
    const tabNodes = getTabNodes()
    tabNodes.forEach(node => {
      const key = node.getAttribute('data-node-key')
      if (key && key !== HOME_TAB_KEY) {
        node.addEventListener('pointerdown', onPointerDown)
      }
    })
    // pointermove / pointerup 绑定在 document 上（通过 pointer capture 冒泡）
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)

    return () => {
      tabNodes.forEach(node => {
        node.removeEventListener('pointerdown', onPointerDown)
      })
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      cleanup()
      dragStateRef.current.dragKey = null
    }
  }, [tabKeysStr])

  // 打开常用命令面板
  const openCommandsTab = () => {
    // 检查是否已有命令面板标签
    const existingTab = tabs.find(t => t.type === 'commands')
    if (existingTab) {
      setActiveKey(existingTab.key)
      return
    }

    const tabKey = `commands-${Date.now()}`
    const newTab: TabItem = {
      key: tabKey,
      label: '常用命令',
      type: 'commands',
      sftpVisible: false,
      sftpHeight: 0,
      sftpNavSeq: 0,
      detailPanelVisible: false,
    }
    setTabs(prev => [...prev, newTab])
    setActiveKey(tabKey)
  }

  // 打开使用文档
  const openDocTab = () => {
    const existingTab = tabs.find(t => t.type === 'doc')
    if (existingTab) {
      setActiveKey(existingTab.key)
      return
    }

    const tabKey = `doc-${Date.now()}`
    const newTab: TabItem = {
      key: tabKey,
      label: '使用文档',
      type: 'doc',
      sftpVisible: false,
      sftpHeight: 0,
      sftpNavSeq: 0,
      detailPanelVisible: false,
    }
    setTabs(prev => [...prev, newTab])
    setActiveKey(tabKey)
  }

  // 连接服务器并创建标签
  const connectAndCreateTab = async (serverId: string) => {
    const server = servers.find(s => s.id === serverId)
    if (!server) {
      message.error('服务器配置不存在')
      return
    }

    // 记录最近连接时间
    touchServer(serverId)

    const tabKey = `terminal-${serverId}-${Date.now()}`

    const newTab: TabItem = {
      key: tabKey,
      label: server.name,
      type: 'terminal',
      serverId,
      serverName: server.name,
      status: 'connecting',
      sftpVisible: false,
      sftpHeight: 0,
      sftpNavSeq: 0,
      detailPanelVisible: true,
    }
    setTabs(prev => [...prev, newTab])
    setActiveKey(tabKey)

    // 不记住密码且密码为空：弹出密码输入框
    const needsPassword = server.rememberPassword === false && !server.password && !server.privateKey
    if (needsPassword) {
      setTabs(prev => prev.map(tab =>
        tab.key === tabKey ? { ...tab, status: 'error' as const } : tab
      ))
      setRetryModal({
        visible: true,
        serverId,
        serverName: server.name,
        username: server.username,
        host: server.host,
        port: server.port,
        tabKey,
        authType: server.authType,
        reason: 'no_password',
      })
      return
    }

    const result = await connectServer(serverId, server.name, {
      host: server.host,
      port: server.port,
      username: server.username,
      password: server.password,
      privateKey: server.privateKey,
      passphrase: server.passphrase,
    })

    if (result.success && result.connectionId) {
      setTabs(prev => prev.map(tab =>
        tab.key === tabKey
          ? { ...tab, connectionId: result.connectionId, status: 'connected' }
          : tab
      ))
      message.success(`已连接到 ${server.name}`)
    } else {
      setTabs(prev => prev.map(tab =>
        tab.key === tabKey
          ? { ...tab, status: 'error' }
          : tab
      ))
      // 认证失败时弹出密码重试弹窗
      if (isAuthError(result.error)) {
        setRetryModal({
          visible: true,
          serverId,
          serverName: server.name,
          username: server.username,
          host: server.host,
          port: server.port,
          tabKey,
          authType: server.authType,
          reason: 'auth_failed',
          error: result.error,
        })
      } else {
        message.error(`连接失败: ${translateError(result.error)}`)
      }
    }
  }

  // 使用 ref 保存最新的 connectAndCreateTab，解决 useEffect 闭包依赖问题
  const connectAndCreateTabRef = useRef(connectAndCreateTab)
  useEffect(() => {
    connectAndCreateTabRef.current = connectAndCreateTab
  })

  // 监听 SessionManager 的连接事件
  useEffect(() => {
    const unsubscribe = onSessionConnect((event) => {
      connectAndCreateTabRef.current(event.serverId)
    })
    return unsubscribe
  }, [])

  // 使用新密码重试连接
  const retryConnectWithNewCredentials = async () => {
    if (!retryModal) return

    const { serverId, serverName, tabKey, authType } = retryModal
    const server = servers.find(s => s.id === serverId)
    if (!server) {
      message.error('服务器配置不存在')
      setRetryModal(null)
      return
    }

    const newPassword = retryPasswordRef.current.trim()
    const newPassphrase = retryPassphraseRef.current.trim()

    if (authType === 'password' && !newPassword) {
      message.error('请输入新密码')
      return
    }
    if (authType === 'privateKey' && !newPassphrase && !newPassword) {
      message.error('请输入密钥口令')
      return
    }

    const shouldRemember = retryRememberRef.current

    setRetryModal(null)
    retryPasswordRef.current = ''
    retryPassphraseRef.current = ''
    retryRememberRef.current = false

    // 更新标签状态为 connecting
    setTabs(prev => prev.map(t =>
      t.key === tabKey ? { ...t, status: 'connecting' as const } : t
    ))

    const connectConfig: {
      host: string
      port: number
      username: string
      password?: string
      privateKey?: string
      passphrase?: string
    } = {
      host: server.host,
      port: server.port,
      username: server.username,
    }

    if (authType === 'password') {
      connectConfig.password = newPassword
    } else {
      connectConfig.privateKey = server.privateKey
      connectConfig.passphrase = newPassphrase || newPassword
    }

    const result = await connectServer(serverId, serverName, connectConfig)

    if (result.success && result.connectionId) {
      setTabs(prev => prev.map(t =>
        t.key === tabKey
          ? { ...t, connectionId: result.connectionId, status: 'connected' }
          : t
      ))
      // 保存凭据到服务器配置
      const updateData: Partial<{ rememberPassword: boolean; password: string; passphrase: string }> = { rememberPassword: shouldRemember }
      if (shouldRemember) {
        if (authType === 'password') {
          updateData.password = newPassword
        } else {
          updateData.passphrase = newPassphrase || newPassword
        }
      }
      updateServer(serverId, updateData)
      message.success(`已连接到 ${serverName}`)
    } else {
      setTabs(prev => prev.map(t =>
        t.key === tabKey ? { ...t, status: 'error' } : t
      ))
      // 再次认证失败，继续弹窗
      if (isAuthError(result.error)) {
        setRetryModal({
          visible: true,
          serverId,
          serverName,
          username: server.username,
          host: server.host,
          port: server.port,
          tabKey,
          authType,
          reason: 'auth_failed',
          error: result.error,
        })
      } else {
        message.error(`连接失败: ${translateError(result.error)}`)
      }
    }
  }

  // 切换 SFTP 面板（带路径时强制打开，不带路径时切换）
  const toggleSFTP = (tabKey: string, path?: string) => {
    setTabs(prev => prev.map(tab => {
      if (tab.key !== tabKey) return tab
      if (path) {
        // 有路径 → 强制打开并更新路径，递增序号触发导航
        return { ...tab, sftpVisible: true, sftpPath: path, sftpNavSeq: tab.sftpNavSeq + 1 }
      }
      // 无路径 → 普通切换
      return { ...tab, sftpVisible: !tab.sftpVisible }
    }))
  }

  // 更新 SFTP 高度
  const updateSFTPHeight = (tabKey: string, height: number) => {
    setTabs(prev => prev.map(tab =>
      tab.key === tabKey ? { ...tab, sftpHeight: height } : tab
    ))
  }

  // 复制会话
  const duplicateTab = async (tabKey: string) => {
    const tab = tabs.find(t => t.key === tabKey)
    if (!tab || !tab.serverId) {
      message.warning('无法复制此会话')
      return
    }

    const currentIndex = tabs.findIndex(t => t.key === tabKey)
    await connectAndCreateTab(tab.serverId)

    setTabs(prev => {
      const newTabIndex = prev.length - 1
      const newTab = prev[newTabIndex]
      const newTabs = [...prev.slice(0, newTabIndex), ...prev.slice(newTabIndex + 1)]
      newTabs.splice(currentIndex + 1, 0, newTab)
      return newTabs
    })
  }

  // 断开连接
  const disconnectTab = (tabKey: string) => {
    const tab = tabs.find(t => t.key === tabKey)
    if (tab?.connectionId) {
      disconnectServer(tab.connectionId)
      setTabs(prev => prev.map(t =>
        t.key === tabKey ? { ...t, status: 'disconnected' as const, connectionId: undefined } : t
      ))
      message.info('已断开连接')
    }
  }

  // 重新连接
  const reconnectTab = async (tabKey: string) => {
    const tab = tabs.find(t => t.key === tabKey)
    if (!tab || !tab.serverId) return

    const server = servers.find(s => s.id === tab.serverId)
    if (!server) {
      message.error('服务器配置不存在')
      return
    }

    // 不记住密码且密码为空：弹出密码输入框
    const needsPassword = server.rememberPassword === false && !server.password && !server.privateKey
    if (needsPassword) {
      setRetryModal({
        visible: true,
        serverId: tab.serverId,
        serverName: server.name,
        username: server.username,
        host: server.host,
        port: server.port,
        tabKey,
        authType: server.authType,
        reason: 'no_password',
      })
      return
    }

    setTabs(prev => prev.map(t =>
      t.key === tabKey ? { ...t, status: 'connecting' as const } : t
    ))

    const result = await connectServer(tab.serverId, server.name, {
      host: server.host,
      port: server.port,
      username: server.username,
      password: server.password,
      privateKey: server.privateKey,
      passphrase: server.passphrase,
    })

    if (result.success && result.connectionId) {
      setTabs(prev => prev.map(t =>
        t.key === tabKey
          ? { ...t, connectionId: result.connectionId, status: 'connected' }
          : t
      ))
      message.success('重新连接成功')
    } else {
      setTabs(prev => prev.map(t =>
        t.key === tabKey ? { ...t, status: 'error' } : t
      ))
      // 认证失败时弹出密码重试弹窗
      if (isAuthError(result.error)) {
        setRetryModal({
          visible: true,
          serverId: tab.serverId!,
          serverName: server.name,
          username: server.username,
          host: server.host,
          port: server.port,
          tabKey,
          authType: server.authType,
          reason: 'auth_failed',
          error: result.error,
        })
      } else {
        message.error(`连接失败: ${translateError(result.error)}`)
      }
    }
  }

  // 关闭标签
  const removeTab = (targetKey: string) => {
    if (targetKey === HOME_TAB_KEY) return // 首页不可关闭

    const tab = tabs.find(t => t.key === targetKey)

    // 编辑器标签未保存时提示
    if (tab?.type === 'editor' && tab.editorDirty) {
      modal.confirm({
        title: '文件未保存',
        content: `"${tab.editorFileName}" 有未保存的更改，确定要关闭吗？`,
        okText: '关闭',
        cancelText: '取消',
        okButtonProps: { danger: true },
        centered: true,
        onOk: () => {
          doRemoveTab(targetKey)
        },
      })
      return
    }

    doRemoveTab(targetKey)
  }

  const doRemoveTab = (targetKey: string) => {
    const tab = tabs.find(t => t.key === targetKey)
    if (tab?.connectionId && tab.type === 'terminal') {
      disconnectServer(tab.connectionId)
    }

    const newTabs = tabs.filter((tab) => tab.key !== targetKey)
    setTabs(newTabs)

    if (activeKey === targetKey && newTabs.length > 0) {
      setActiveKey(newTabs[newTabs.length - 1].key)
    }
  }

  // 关闭其他标签
  const closeOtherTabs = (targetKey: string) => {
    const otherTabs = tabs.filter(t => t.key !== targetKey && t.key !== HOME_TAB_KEY && t.type === 'terminal')
    if (otherTabs.length === 0) return

    modal.confirm({
      title: '关闭其他标签',
      content: `确定要关闭其他 ${otherTabs.length} 个标签吗？相关 SSH 连接将会断开。`,
      okText: '关闭',
      cancelText: '取消',
      okButtonProps: { danger: true },
      centered: true,
      onOk: () => {
        otherTabs.forEach(tab => {
          if (tab.connectionId) {
            disconnectServer(tab.connectionId)
          }
        })
        const keepTabs = tabs.filter(t => t.key === targetKey || t.key === HOME_TAB_KEY)
        setTabs(keepTabs)
        setActiveKey(targetKey)
      },
    })
  }

  // 关闭所有标签（保留首页）
  const closeAllTabs = () => {
    const terminalTabs = tabs.filter(t => t.type === 'terminal')
    if (terminalTabs.length === 0) return

    modal.confirm({
      title: '关闭所有标签',
      content: `确定要关闭全部 ${terminalTabs.length} 个标签吗？所有 SSH 连接将会断开。`,
      okText: '全部关闭',
      cancelText: '取消',
      okButtonProps: { danger: true },
      centered: true,
      onOk: () => {
        terminalTabs.forEach(tab => {
          if (tab.connectionId) {
            disconnectServer(tab.connectionId)
          }
        })
        const homeTab = tabs.find(t => t.key === HOME_TAB_KEY)
        setTabs(homeTab ? [homeTab] : [])
        setActiveKey(HOME_TAB_KEY)
      },
    })
  }

  // 在编辑器标签中打开远程文件
  const openEditorTab = (connectionId: string, serverName: string, remotePath: string, fileName: string) => {
    // 如果已经打开了同一文件，切换到该标签
    const existingTab = tabs.find(t => t.type === 'editor' && t.connectionId === connectionId && t.editorRemotePath === remotePath)
    if (existingTab) {
      setActiveKey(existingTab.key)
      return
    }

    const tabKey = `editor-${Date.now()}`
    const newTab: TabItem = {
      key: tabKey,
      label: fileName,
      type: 'editor',
      connectionId,
      serverName,
      sftpVisible: false,
      sftpHeight: 0,
      sftpNavSeq: 0,
      detailPanelVisible: false,
      editorRemotePath: remotePath,
      editorFileName: fileName,
      editorDirty: false,
    }
    setTabs(prev => [...prev, newTab])
    setActiveKey(tabKey)
  }

  // 获取标签状态样式
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'var(--success-color)'
      case 'connecting': return 'var(--warning-color)'
      case 'error': return 'var(--error-color)'
      default: return 'var(--text-tertiary)'
    }
  }

  // 构建右键菜单
  const buildContextMenu = (tabKey: string): MenuProps => {
    if (tabKey === HOME_TAB_KEY) {
      return { items: [] }
    }

    const tab = tabs.find(t => t.key === tabKey)
    const isConnected = tab?.status === 'connected'
    const hasServer = tab?.serverId && tab.serverId !== ''

    const items: MenuProps['items'] = []

    if (hasServer) {
      items.push({
        key: 'duplicate',
        label: '复制会话',
        icon: <CopyOutlined />,
        onClick: () => duplicateTab(tabKey),
      })

      items.push({
        key: 'toggle-sftp',
        label: tab?.sftpVisible ? '隐藏 SFTP' : '显示 SFTP',
        icon: <FolderOutlined />,
        onClick: () => toggleSFTP(tabKey),
      })
    }

    if (isConnected) {
      items.push({
        key: 'disconnect',
        label: '断开连接',
        icon: <DisconnectOutlined />,
        onClick: () => disconnectTab(tabKey),
      })
    } else if (hasServer && (tab?.status === 'disconnected' || tab?.status === 'error')) {
      items.push({
        key: 'connect',
        label: '连接',
        icon: <LinkOutlined />,
        onClick: () => reconnectTab(tabKey),
      })
    }

    if (items.length > 0) {
      items.push({ type: 'divider' })
    }

    const terminalTabs = tabs.filter(t => t.type === 'terminal')
    if (terminalTabs.length > 1) {
      items.push({
        key: 'close-others',
        label: '关闭其他',
        icon: <CloseOutlined />,
        onClick: () => closeOtherTabs(tabKey),
      })
    }

    if (terminalTabs.length > 0) {
      items.push({
        key: 'close-all',
        label: '关闭所有连接',
        icon: <CloseOutlined />,
        danger: true,
        onClick: closeAllTabs,
      })
    }

    return { items }
  }

  // 标签渲染
  const renderTabLabel = (tab: TabItem) => {
    if (tab.type === 'home') {
      return (
        <div className="tab-label">
          <HomeOutlined />
          <span className="tab-name">首页</span>
        </div>
      )
    }

    if (tab.type === 'editor') {
      return (
        <div className="tab-label">
          <FileTextOutlined />
          <span className="tab-name">{tab.label}</span>
          {tab.editorDirty && <span className="tab-dirty-dot" title="未保存" />}
        </div>
      )
    }

    if (tab.type === 'commands') {
      return (
        <div className="tab-label">
          <CodeOutlined />
          <span className="tab-name">{tab.label}</span>
        </div>
      )
    }

    if (tab.type === 'doc') {
      return (
        <div className="tab-label">
          <BookOutlined />
          <span className="tab-name">{tab.label}</span>
        </div>
      )
    }

    return (
      <Dropdown
        menu={buildContextMenu(tab.key)}
        trigger={['contextMenu']}
      >
        <div className="tab-label">
          <ApiOutlined />
          <span className="tab-name">{tab.label}</span>
          <span
            className="tab-status-dot"
            style={{ backgroundColor: getStatusColor(tab.status || 'disconnected') }}
            title={tab.status}
          />
        </div>
      </Dropdown>
    )
  }

  // 获取当前活动标签
  const activeTab = tabs.find(t => t.key === activeKey)
  const showDetailPanel = activeTab?.type === 'terminal' && detailPanelVisible

  // 构建新建菜单项
  const buildNewMenuItems = (): MenuProps['items'] => {
    const items: MenuProps['items'] = [
      {
        key: '__new_session__',
        label: '新建会话...',
        icon: <PlusOutlined />,
      },
      {
        key: '__new_group__',
        label: '新建分组',
        icon: <FolderAddOutlined />,
      },
    ]

    if (servers.length > 0) {
      items.push({ type: 'divider' })
      servers.forEach(server => {
        items.push({
          key: server.id,
          label: server.name,
          icon: <ApiOutlined />,
        })
      })
    }

    return items
  }

  // 新建分组处理
  const handleNewGroup = () => {
    if (!newGroupName.trim()) return
    addGroup({ name: newGroupName.trim(), order: groups.length })
    setNewGroupVisible(false)
    setNewGroupName('')
    message.success('分组已创建')
  }

  // 处理新建菜单点击
  const handleNewMenuClick = ({ key }: { key: string }) => {
    if (key === '__new_session__') {
      setNewSessionVisible(true)
    } else if (key === '__new_group__') {
      setNewGroupName('')
      setNewGroupVisible(true)
    } else {
      connectAndCreateTab(key)
    }
  }

  const tabItems = tabs.map((tab) => ({
    key: tab.key,
    label: renderTabLabel(tab),
    children: tab.type === 'home' ? (
      <HomePage onConnect={connectAndCreateTab} onNewSession={() => setNewSessionVisible(true)} onOpenCommands={openCommandsTab} onOpenDoc={openDocTab} />
    ) : tab.type === 'commands' ? (
      <CommandsPanel />
    ) : tab.type === 'doc' ? (
      <DocPanel />
    ) : tab.type === 'editor' ? (
      <EditorPanel
        connectionId={tab.connectionId!}
        remotePath={tab.editorRemotePath!}
        fileName={tab.editorFileName!}
        serverName={tab.serverName || ''}
        onDirty={(dirty) => {
          setTabs(prev => prev.map(t =>
            t.key === tab.key ? { ...t, editorDirty: dirty } : t
          ))
        }}
      />
    ) : (
      <SessionTabContent
        tab={tab}
        isActive={tab.key === activeKey}
        detailPanelVisible={detailPanelVisible}
        onToggleSFTP={(path) => toggleSFTP(tab.key, path)}
        onUpdateSFTPHeight={(h) => updateSFTPHeight(tab.key, h)}
        onReconnect={() => reconnectTab(tab.key)}
        onDisconnect={() => disconnectTab(tab.key)}
        onOpenFile={(remotePath, fileName) => {
          openEditorTab(tab.connectionId!, tab.serverName || '', remotePath, fileName)
        }}
      />
    ),
    closable: tab.type !== 'home',
  }))

  return (
    <div className="main-content">
      <Tabs
        type="editable-card"
        activeKey={activeKey}
        onChange={setActiveKey}
        items={tabItems}
        hideAdd
        onEdit={(targetKey, action) => {
          if (action === 'remove' && typeof targetKey === 'string') {
            removeTab(targetKey)
          }
        }}
        className="main-tabs"
        tabBarExtraContent={{
          left: (
            <Button
              type="text"
              icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={onToggleSidebar}
              className="sidebar-toggle-btn"
              title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
            />
          ),
          right: (
            <div className="tabbar-extra">
              <Dropdown
                menu={{
                  items: buildNewMenuItems(),
                  onClick: handleNewMenuClick,
                }}
                trigger={['click']}
              >
                <Button type="text" icon={<PlusOutlined />} title="新建连接" />
              </Dropdown>
              {activeTab?.type === 'terminal' && (
                <Button
                  type="text"
                  icon={detailPanelVisible ? <RightOutlined /> : <LeftOutlined />}
                  onClick={() => setDetailPanelVisible(!detailPanelVisible)}
                  title={detailPanelVisible ? '隐藏详情面板' : '显示详情面板'}
                />
              )}
            </div>
          ),
        }}
      />

      {/* 右侧详情面板容器 (可拖拽宽度) */}
      {showDetailPanel && (
        <DetailPanelResizer width={detailPanelWidth} onWidthChange={setDetailPanelWidth}>
          {activeTab?.type === 'terminal' && (
            <ConnectionDetailPanel
              connectionId={activeTab.connectionId}
              serverName={activeTab.serverName}
            />
          )}
        </DetailPanelResizer>
      )}

      {/* 密码输入弹窗 */}
      <Modal
        open={retryModal?.visible ?? false}
        onOk={retryConnectWithNewCredentials}
        onCancel={() => {
          setRetryModal(null)
          retryPasswordRef.current = ''
          retryPassphraseRef.current = ''
          retryRememberRef.current = false
        }}
        footer={null}
        width={420}
        destroyOnHidden
        className="credential-modal"
        centered
        closable
      >
        <div className="cred-modal-container">
          <div className="cred-modal-header">
            <div className="cred-modal-icon">
              <LockOutlined />
            </div>
            <div className="cred-modal-title-group">
              <h3 className="cred-modal-title">
                {retryModal?.reason === 'no_password' ? '输入密码' : '认证失败'}
              </h3>
              <p className="cred-modal-subtitle">
                {retryModal?.reason === 'no_password'
                  ? <>连接 <strong>{retryModal?.serverName}</strong> 需要输入密码</>
                  : <>连接 <strong>{retryModal?.serverName}</strong> 失败，请重新输入</>
                }
              </p>
              <p className="cred-modal-host">
                {retryModal?.username}@{retryModal?.host}{retryModal?.port !== 22 ? `:${retryModal?.port}` : ''}
              </p>
            </div>
          </div>

          {retryModal?.reason === 'auth_failed' && retryModal?.error && (
            <div className="cred-modal-error">{translateError(retryModal.error)}</div>
          )}

          <div className="cred-modal-body">
            {retryModal?.authType === 'password' ? (
              <Input.Password
                placeholder="请输入密码"
                onChange={(e) => { retryPasswordRef.current = e.target.value }}
                onPressEnter={retryConnectWithNewCredentials}
                autoFocus
                size="large"
              />
            ) : (
              <Input.Password
                placeholder="请输入密钥口令"
                onChange={(e) => { retryPassphraseRef.current = e.target.value }}
                onPressEnter={retryConnectWithNewCredentials}
                autoFocus
                size="large"
              />
            )}
            <Checkbox
              defaultChecked={false}
              onChange={(e) => { retryRememberRef.current = e.target.checked }}
              className="cred-modal-remember"
            >
              记住密码
            </Checkbox>
          </div>

          <div className="cred-modal-footer">
            <Button onClick={() => {
              setRetryModal(null)
              retryPasswordRef.current = ''
              retryPassphraseRef.current = ''
              retryRememberRef.current = false
            }}>
              取消
            </Button>
            <Button type="primary" onClick={retryConnectWithNewCredentials}>
              连接
            </Button>
          </div>
        </div>
      </Modal>

      {/* 新建分组弹窗 */}
      <Modal
        title="新建分组"
        open={newGroupVisible}
        onOk={handleNewGroup}
        onCancel={() => { setNewGroupVisible(false); setNewGroupName('') }}
        okText="确定"
        cancelText="取消"
        width={400}
        destroyOnHidden
        className="group-modal"
        centered
      >
        <div className="group-modal-body">
          <Input
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            onPressEnter={handleNewGroup}
            placeholder="输入分组名称"
            autoFocus
            size="large"
          />
        </div>
      </Modal>

      {/* 新建会话弹窗 */}
      <NewSessionModal
        visible={newSessionVisible}
        onClose={() => setNewSessionVisible(false)}
        onOk={(values) => {
          addServer(values)
          message.success('会话创建成功')
          setNewSessionVisible(false)
        }}
      />
    </div>
  )
}

// 首页组件
interface HomePageProps {
  onConnect: (serverId: string) => void
  onNewSession: () => void
  onOpenCommands: () => void
  onOpenDoc: () => void
}

const HomePage: React.FC<HomePageProps> = ({ onConnect, onNewSession, onOpenCommands, onOpenDoc }) => {
  const { servers } = useServerStore()
  const { openSettings } = useSettingsModal()
  const [searchKeyword, setSearchKeyword] = useState('')
  const [shortcutTipOpen, setShortcutTipOpen] = useState(false)

  return (
    <div className="home-page">
      <div className="home-hero">
        <img src="./icon.svg" alt="SSHTools" className="home-hero-logo" />
        <h1 className="home-title">SSHTools</h1>
        <p className="home-subtitle">双击服务器卡片快速连接，终端内可通过 <ThunderboltOutlined /> 管理快捷命令</p>
      </div>

      <div className="home-modules">
        <div className="module-item" onClick={onNewSession}>
          <div className="module-icon"><PlusOutlined /></div>
          <span className="module-label">新建连接</span>
        </div>
        <div className="module-item" onClick={onOpenCommands}>
          <div className="module-icon"><CodeOutlined /></div>
          <span className="module-label">常用命令</span>
        </div>
        <div className="module-item" onClick={() => setShortcutTipOpen(true)}>
          <div className="module-icon"><ThunderboltOutlined /></div>
          <span className="module-label">快捷指令</span>
        </div>
        <div className="module-item" onClick={onOpenDoc}>
          <div className="module-icon"><BookOutlined /></div>
          <span className="module-label">使用文档</span>
        </div>
        <div className="module-item" onClick={openSettings}>
          <div className="module-icon"><SettingOutlined /></div>
          <span className="module-label">全局设置</span>
        </div>
      </div>

      <div className="home-search">
        <Input
          placeholder="搜索服务器名称、主机、备注..."
          prefix={<SearchOutlined />}
          allowClear
          value={searchKeyword}
          onChange={e => setSearchKeyword(e.target.value)}
          className="home-search-input"
        />
      </div>

      {servers.length === 0 ? (
        <div className="home-empty">
          <p>还没有服务器配置</p>
          <Button type="primary" icon={<PlusOutlined />} onClick={onNewSession}>
            新建连接
          </Button>
        </div>
      ) : (
        <div className="home-servers">
          <ServerTree
            onConnect={onConnect}
            className="home-tree-wrapper"
            showDetail
            searchKeyword={searchKeyword}
          />
        </div>
      )}

      <Modal
        open={shortcutTipOpen}
        onCancel={() => setShortcutTipOpen(false)}
        footer={null}
        centered
        width={420}
        className="credential-modal"
        closable
        destroyOnHidden
      >
        <div className="cred-modal-container">
          <div className="cred-modal-header">
            <div className="cred-modal-icon">
              <ThunderboltOutlined />
            </div>
            <div className="cred-modal-title-group">
              <h3 className="cred-modal-title">快捷指令</h3>
              <p className="cred-modal-subtitle">每个服务器连接可自定义快捷指令</p>
            </div>
          </div>
          <div className="cred-modal-body">
            <div className="shortcut-tip-steps">
              <div className="shortcut-tip-step">
                <span className="shortcut-tip-num">1</span>
                <span>连接服务器后，在终端工具栏点击 <ThunderboltOutlined style={{ color: 'var(--primary-color)' }} /> 图标</span>
              </div>
              <div className="shortcut-tip-step">
                <span className="shortcut-tip-num">2</span>
                <span>点击 <PlusOutlined style={{ color: 'var(--primary-color)' }} /> 添加自定义命令（名称 + 命令内容）</span>
              </div>
              <div className="shortcut-tip-step">
                <span className="shortcut-tip-num">3</span>
                <span>点击命令即可输入到终端，回车由你决定</span>
              </div>
            </div>
            <p className="shortcut-tip-note">快捷指令按服务器独立存储，不同服务器可配置不同的命令集。</p>
          </div>
          <div className="cred-modal-footer">
            <Button type="primary" onClick={() => setShortcutTipOpen(false)}>知道了</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// 会话标签内容组件（包含终端和 SFTP）
interface SessionTabContentProps {
  tab: TabItem
  isActive: boolean
  detailPanelVisible: boolean
  onToggleSFTP: (path?: string) => void
  onUpdateSFTPHeight: (height: number) => void
  onReconnect: () => void
  onDisconnect: () => void
  onOpenFile?: (remotePath: string, fileName: string) => void
}

const SessionTabContent: React.FC<SessionTabContentProps> = ({
  tab,
  isActive,
  onToggleSFTP,
  onUpdateSFTPHeight,
  onReconnect,
  onOpenFile,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isResizing, setIsResizing] = useState(false)
  const startYRef = useRef(0)
  const startHeightRef = useRef(0)

  // SFTP 打开时自动设置为容器高度的一半
  useEffect(() => {
    if (tab.sftpVisible && tab.sftpHeight === 0 && containerRef.current) {
      const containerHeight = containerRef.current.clientHeight
      onUpdateSFTPHeight(Math.max(200, Math.floor(containerHeight / 2)))
    }
  }, [tab.sftpVisible, tab.sftpHeight, onUpdateSFTPHeight])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    startYRef.current = e.clientY
    startHeightRef.current = tab.sftpHeight
  }, [tab.sftpHeight])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return

      const diff = startYRef.current - e.clientY
      const newHeight = Math.max(60, startHeightRef.current + diff)
      onUpdateSFTPHeight(newHeight)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, onUpdateSFTPHeight])

  const sftpReady = tab.sftpVisible && tab.sftpHeight > 0

  // 获取服务器配置
  const { servers } = useServerStore()
  const server = tab.serverId ? servers.find(s => s.id === tab.serverId) : undefined

  return (
    <div ref={containerRef} className="session-tab-content">
      {/* 终端面板 */}
      <div className="terminal-wrapper" style={sftpReady ? { height: `calc(100% - ${tab.sftpHeight}px - 6px)`, flex: 'none' } : undefined}>
        <TerminalPanel
          connectionId={tab.connectionId}
          serverId={tab.serverId}
          isActive={isActive}
          sftpVisible={tab.sftpVisible}
          onToggleSFTP={onToggleSFTP}
          onReconnect={onReconnect}
          serverConfig={server ? { host: server.host, port: server.port, username: server.username } : undefined}
        />
      </div>

      {/* SFTP 面板 */}
      {sftpReady && (
        <>
          {/* 拖拽分割线 */}
          <div
            className={`resize-divider ${isResizing ? 'resizing' : ''}`}
            onMouseDown={handleMouseDown}
          />

          {/* SFTP 内容 */}
          <div className="sftp-wrapper" style={{ height: tab.sftpHeight }}>
            <SFTPPanel
              connectionId={tab.connectionId}
              initialPath={tab.sftpPath}
              navSeq={tab.sftpNavSeq}
              onOpenFile={onOpenFile}
            />
          </div>
        </>
      )}
    </div>
  )
}

// 右侧详情面板拖拽调整宽度
interface DetailPanelResizerProps {
  width: number
  onWidthChange: (width: number) => void
  children: React.ReactNode
}

const DetailPanelResizer: React.FC<DetailPanelResizerProps> = ({ width, onWidthChange, children }) => {
  const [isResizing, setIsResizing] = useState(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    startXRef.current = e.clientX
    startWidthRef.current = width
  }, [width])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      // 向左拖 → 宽度增大
      const diff = startXRef.current - e.clientX
      const newWidth = Math.max(240, Math.min(500, startWidthRef.current + diff))
      onWidthChange(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      // 拖拽完成后通知终端 refit
      setTimeout(() => window.dispatchEvent(new Event('resize')), 50)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, onWidthChange])

  return (
    <div className="detail-panel-container visible" style={{ width }}>
      <div
        className={`detail-panel-drag-handle ${isResizing ? 'resizing' : ''}`}
        onMouseDown={handleMouseDown}
      />
      {children}
    </div>
  )
}

export default MainContent
