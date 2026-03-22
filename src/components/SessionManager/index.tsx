import { useState, useRef, useEffect, useCallback } from 'react'
import { useServerStore } from '../../stores/serverStore'
import { useConnectionStore } from '../../stores/connectionStore'
import ServerTree from '../ServerTree'
import './index.css'

// 用于通知 MainContent 创建标签的事件
type SessionConnectEvent = {
  serverId: string
}

// 简单的事件发射器
const sessionConnectListeners: ((event: SessionConnectEvent) => void)[] = []

export function onSessionConnect(callback: (event: SessionConnectEvent) => void) {
  sessionConnectListeners.push(callback)
  return () => {
    const index = sessionConnectListeners.indexOf(callback)
    if (index > -1) sessionConnectListeners.splice(index, 1)
  }
}

export function emitSessionConnect(event: SessionConnectEvent) {
  sessionConnectListeners.forEach(cb => cb(event))
}

// 用于从外部打开新建会话弹窗
const newSessionListeners: (() => void)[] = []

export function onOpenNewSession(callback: () => void) {
  newSessionListeners.push(callback)
  return () => {
    const index = newSessionListeners.indexOf(callback)
    if (index > -1) newSessionListeners.splice(index, 1)
  }
}

export function emitOpenNewSession() {
  newSessionListeners.forEach(cb => cb())
}

interface SessionManagerProps {
  collapsed: boolean
}

const SessionManager: React.FC<SessionManagerProps> = ({ collapsed }) => {
  const [width, setWidth] = useState(260)
  const [isResizing, setIsResizing] = useState(false)

  const siderRef = useRef<HTMLDivElement>(null)
  const startXRef = useRef(0)
  const startWidthRef = useRef(260)

  const { servers } = useServerStore()
  const { connections } = useConnectionStore()

  // 根据 serverId 获取连接状态
  const getServerStatus = (serverId: string): 'connected' | 'connecting' | 'disconnected' => {
    for (const [, conn] of connections) {
      if (conn.serverId === serverId) {
        if (conn.status === 'connected') return 'connected'
        if (conn.status === 'connecting') return 'connecting'
      }
    }
    return 'disconnected'
  }

  // 快速连接列表：按最近连接时间倒序，取最近 4 条
  const quickConnections = [...servers]
    .filter(s => s.lastConnectedAt)
    .sort((a, b) => (b.lastConnectedAt || 0) - (a.lastConnectedAt || 0))
    .slice(0, 4)

  // 处理拖拽调整宽度
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    startXRef.current = e.clientX
    startWidthRef.current = width
  }, [width])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const diff = e.clientX - startXRef.current
      const newWidth = Math.max(180, startWidthRef.current + diff)
      setWidth(newWidth)
    }
    const handleMouseUp = () => setIsResizing(false)
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  const handleConnect = (serverId: string) => {
    emitSessionConnect({ serverId })
  }

  return (
    <div
      ref={siderRef}
      className={`session-manager ${collapsed ? 'collapsed' : ''} ${isResizing ? 'resizing' : ''}`}
      style={{ width: collapsed ? 0 : width }}
    >
      {!collapsed && (
        <div className="session-manager-content">
          {/* 快速连接 */}
          {quickConnections.length > 0 && (
            <>
              <div className="section-title no-border">
                <span>快速连接</span>
              </div>
              <div className="quick-connect-list">
                {quickConnections.map(server => {
                  const status = getServerStatus(server.id)
                  return (
                    <div key={server.id} className="quick-card" onDoubleClick={() => handleConnect(server.id)}>
                      <div className="quick-card-info">
                        <div className="quick-card-name">{server.name}</div>
                        <div className="quick-card-host">{server.username}@{server.host}</div>
                      </div>
                      <span className={`quick-card-status ${status}`} />
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* 所有连接 */}
          <div className={`section-title ${quickConnections.length === 0 ? 'no-border' : ''}`}>
            <span>所有连接</span>
            <span className="all-count">{servers.length}</span>
          </div>

          <ServerTree onConnect={handleConnect} className="session-tree-container" listenNewSession />
        </div>
      )}

      {/* 拖拽手柄 */}
      {!collapsed && (
        <div className={`resize-handle ${isResizing ? 'resizing' : ''}`} onMouseDown={handleMouseDown} />
      )}
    </div>
  )
}

export default SessionManager
