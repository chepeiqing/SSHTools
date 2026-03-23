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
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import TerminalPanel from '../TerminalPanel'
import SFTPPanel from '../SFTPPanel'
import ConnectionDetailPanel from '../ConnectionDetailPanel'
import EditorPanel from '../EditorPanel'
import ServerTree from '../ServerTree'
import NewSessionModal from '../SessionManager/NewSessionModal'
import { useConnectionStore, connectServer, disconnectServer } from '../../stores/connectionStore'
import { useServerStore } from '../../stores/serverStore'
import { onSessionConnect } from '../SessionManager'
import './index.css'

interface TabItem {
  key: string
  label: string
  type: 'home' | 'terminal' | 'editor'
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
  const [detailPanelVisible, setDetailPanelVisible] = useState(true)
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

  // 详情面板展开/收起后，通知终端 refit（CSS transition 300ms，延迟 350ms 触发）
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 350)
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

  // === 标签拖拽排序 ===
  const dragStateRef = useRef<{ dragKey: string | null }>({ dragKey: null })
  const tabKeysStr = tabs.map(t => t.key).join(',')

  useEffect(() => {
    const navList = document.querySelector('.main-tabs .ant-tabs-nav-list')
    const nav = document.querySelector('.main-tabs .ant-tabs-nav')
    if (!navList || !nav) return

    const getTabNodes = () => Array.from(navList.querySelectorAll<HTMLElement>('.ant-tabs-tab'))

    const clearIndicators = () => {
      navList.querySelectorAll('.tab-drop-left, .tab-drop-right').forEach(el => {
        el.classList.remove('tab-drop-left', 'tab-drop-right')
      })
    }

    // 根据鼠标 x 坐标找到最近的目标标签
    const findDropTarget = (x: number): { node: HTMLElement; pos: 'left' | 'right' } | null => {
      const nodes = getTabNodes()
      let closest: HTMLElement | null = null
      let minDist = Infinity
      for (const node of nodes) {
        const rect = node.getBoundingClientRect()
        // 优先精确命中
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

    const onDragStart = (e: DragEvent) => {
      const tab = e.currentTarget as HTMLElement
      const key = tab.getAttribute('data-node-key')
      if (!key) return
      // 从关闭按钮区域发起的拖拽不处理
      if ((e.target as HTMLElement).closest('.ant-tabs-tab-remove')) {
        e.preventDefault()
        return
      }
      dragStateRef.current.dragKey = key
      e.dataTransfer!.effectAllowed = 'move'
      e.dataTransfer!.setData('text/plain', '')
    }

    const onNavDragOver = (e: Event) => {
      const de = e as DragEvent
      de.preventDefault()
      const { dragKey } = dragStateRef.current
      if (!dragKey) return

      const target = findDropTarget(de.clientX)
      if (!target) { clearIndicators(); return }

      const key = target.node.getAttribute('data-node-key')
      if (!key || dragKey === key) { clearIndicators(); return }
      if (key === HOME_TAB_KEY && target.pos === 'left') { clearIndicators(); return }

      clearIndicators()
      target.node.classList.add(`tab-drop-${target.pos}`)
    }

    const onNavDrop = (e: Event) => {
      const de = e as DragEvent
      de.preventDefault()
      const { dragKey } = dragStateRef.current
      if (!dragKey) { clearIndicators(); return }

      // 从当前显示的指示器上获取目标
      const dropNode = navList.querySelector<HTMLElement>('.tab-drop-left, .tab-drop-right')
      if (!dropNode) {
        // 兜底：通过坐标查找
        const target = findDropTarget(de.clientX)
        if (!target) { clearIndicators(); dragStateRef.current.dragKey = null; return }
        const key = target.node.getAttribute('data-node-key')
        if (!key || dragKey === key) { clearIndicators(); dragStateRef.current.dragKey = null; return }
      }

      const targetNode = dropNode || findDropTarget(de.clientX)?.node
      const dropKey = targetNode?.getAttribute('data-node-key')
      if (!dropKey || dragKey === dropKey) {
        clearIndicators()
        dragStateRef.current.dragKey = null
        return
      }

      const pos = targetNode!.classList.contains('tab-drop-right') ? 'right' : 'left'

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

      clearIndicators()
      dragStateRef.current.dragKey = null
    }

    const onDragEnd = () => {
      clearIndicators()
      dragStateRef.current.dragKey = null
    }

    const onNavDragLeave = (e: Event) => {
      const de = e as DragEvent
      const navEl = de.currentTarget as HTMLElement
      const related = de.relatedTarget as HTMLElement | null
      // 仅当鼠标真正离开导航区域时才清除指示器
      if (!related || !navEl.contains(related)) {
        clearIndicators()
      }
    }

    // dragstart / dragend 绑定在各个可拖拽标签上
    const tabNodes = getTabNodes()
    tabNodes.forEach(node => {
      const key = node.getAttribute('data-node-key')
      if (key && key !== HOME_TAB_KEY) {
        node.setAttribute('draggable', 'true')
        node.addEventListener('dragstart', onDragStart)
        node.addEventListener('dragend', onDragEnd)
      }
    })

    // dragover / drop / dragleave 绑定在整个导航区域，扩大可放置范围
    nav.addEventListener('dragover', onNavDragOver)
    nav.addEventListener('drop', onNavDrop)
    nav.addEventListener('dragleave', onNavDragLeave)

    return () => {
      tabNodes.forEach(node => {
        node.removeAttribute('draggable')
        node.removeEventListener('dragstart', onDragStart)
        node.removeEventListener('dragend', onDragEnd)
      })
      nav.removeEventListener('dragover', onNavDragOver)
      nav.removeEventListener('drop', onNavDrop)
      nav.removeEventListener('dragleave', onNavDragLeave)
      clearIndicators()
      dragStateRef.current.dragKey = null
    }
  }, [tabKeysStr])

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
      <HomePage onConnect={connectAndCreateTab} onNewSession={() => setNewSessionVisible(true)} />
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

      {/* 右侧详情面板容器 (带动画) */}
      <div className={`detail-panel-container ${showDetailPanel ? 'visible' : ''}`}>
        {activeTab?.type === 'terminal' && (
          <ConnectionDetailPanel
            connectionId={activeTab.connectionId}
            serverName={activeTab.serverName}
            onDisconnect={() => disconnectTab(activeTab.key)}
            onReconnect={() => reconnectTab(activeTab.key)}
          />
        )}
      </div>

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
}

const HomePage: React.FC<HomePageProps> = ({ onConnect, onNewSession }) => {
  const { servers } = useServerStore()
  const [searchKeyword, setSearchKeyword] = useState('')

  return (
    <div className="home-page">
      <div className="home-hero">
        <img src="./icon.svg" alt="SSHTools" className="home-hero-logo" />
        <h1 className="home-title">SSHTools</h1>
        <p className="home-subtitle">双击服务器卡片快速连接，右键管理会话和分组</p>
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
  const terminalHeight = sftpReady ? `calc(100% - ${tab.sftpHeight}px - 6px)` : '100%'

  // 获取服务器配置
  const { servers } = useServerStore()
  const server = tab.serverId ? servers.find(s => s.id === tab.serverId) : undefined

  return (
    <div ref={containerRef} className="session-tab-content">
      {/* 终端面板 */}
      <div className="terminal-wrapper" style={{ height: terminalHeight }}>
        <TerminalPanel
          connectionId={tab.connectionId}
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

export default MainContent
