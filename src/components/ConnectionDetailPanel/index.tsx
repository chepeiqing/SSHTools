import { useState, useEffect, useRef } from 'react'
import { Button, App } from 'antd'
import {
  DisconnectOutlined,
  ReloadOutlined,
  CloudServerOutlined,
  CopyOutlined,
} from '@ant-design/icons'
import { useConnectionStore } from '../../stores/connectionStore'
import { useServerStore } from '../../stores/serverStore'
import type { SystemStats } from '../../types'
import './index.css'

interface ConnectionDetailPanelProps {
  connectionId?: string
  serverName?: string
  onDisconnect?: () => void
  onReconnect?: () => void
}

const ConnectionDetailPanel: React.FC<ConnectionDetailPanelProps> = ({
  connectionId,
  serverName,
  onDisconnect,
  onReconnect,
}) => {
  const { getConnection } = useConnectionStore()
  const { servers } = useServerStore()
  const { message } = App.useApp()
  const connection = connectionId ? getConnection(connectionId) : undefined
  const server = connection ? servers.find(s => s.id === connection.serverId) : undefined

  const [stats, setStats] = useState<SystemStats | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isConnected = connection?.status === 'connected'

  // 定时获取系统监控信息
  useEffect(() => {
    if (!connectionId || !isConnected) {
      setStats(null)
      return
    }

    let cancelled = false

    const fetchStats = async () => {
      try {
        const result = await window.electronAPI.sshGetSystemStats(connectionId)
        if (!cancelled && result.success && result.stats) {
          setStats(result.stats)
        }
      } catch { /* ignore */ }
    }

    fetchStats()
    timerRef.current = setInterval(fetchStats, 5000)

    return () => {
      cancelled = true
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [connectionId, isConnected])

  if (!connectionId) {
    return (
      <div className="connection-detail-panel">
        <div className="connection-detail-empty">
          <div className="connection-logo-placeholder">
            <CloudServerOutlined />
          </div>
          <span>选择一个连接查看详情</span>
        </div>
      </div>
    )
  }

  const isDisconnected = connection?.status === 'disconnected' || connection?.status === 'error'
  const displayName = serverName || connection?.serverName || '未知服务器'
  const host = server?.host || '—'
  const port = server?.port || 22
  const username = server?.username || '—'
  const authType = server?.authType === 'privateKey' ? 'SSH 密钥' : '密码'

  const statusLabel = isConnected ? '在线' : isDisconnected ? '离线' : '连接中'

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`
  }

  // 将 uptime 格式化为天数
  const formatUptimeDays = (raw: string): string => {
    if (!raw) return '—'
    const dayMatch = raw.match(/(\d+)\s*days?/i)
    if (dayMatch) return `${dayMatch[1]} 天`
    const hourMatch = raw.match(/(\d+)\s*hours?/i)
    if (hourMatch) return `${hourMatch[1]} 小时`
    const minMatch = raw.match(/(\d+)\s*min/i)
    if (minMatch) return `${minMatch[1]} 分钟`
    return raw.replace(/^up\s+/i, '').trim()
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    message.success('已复制')
  }

  return (
    <div className="connection-detail-panel">
      {/* 头部Logo与标题 */}
      <div className="connection-detail-header">
        <div className="connection-logo">
          <CloudServerOutlined />
        </div>
        <div className="connection-header-info">
          <div className="connection-detail-title">{displayName}</div>
          <div className={`connection-status-tag-row ${isConnected ? 'online' : isDisconnected ? 'offline' : 'connecting'}`}>
             <span className="status-dot-pulse" />
             <span className="status-text">{statusLabel}</span>
          </div>
        </div>
      </div>

      {/* 连接详情 */}
      <div className="section-block">
        <div className="section-header">连接详情</div>
        <div className="detail-item">
          <span className="detail-label">主机</span>
          <span className="detail-value">
            {host}
            <CopyOutlined className="copy-icon" onClick={() => handleCopy(host)} />
          </span>
        </div>
        <div className="detail-divider" />
        <div className="detail-item">
          <span className="detail-label">端口</span>
          <span className="detail-value">{port}</span>
        </div>
        <div className="detail-divider" />
        <div className="detail-item">
          <span className="detail-label">用户名</span>
          <span className="detail-value">{username}</span>
        </div>
        <div className="detail-divider" />
        <div className="detail-item">
          <span className="detail-label">认证</span>
          <span className="detail-value">{authType}</span>
        </div>
        {stats?.uptime && (
          <>
            <div className="detail-divider" />
            <div className="detail-item">
              <span className="detail-label">运行时间</span>
              <span className="detail-value">{formatUptimeDays(stats.uptime)}</span>
            </div>
          </>
        )}
      </div>

      {/* 资源监控 */}
      {stats && (
        <div className="section-block">
          <div className="section-header">资源监控</div>
          <div className="monitor-list">
            <div className="monitor-item">
              <div className="monitor-label">
                <span>CPU 负载</span>
                <span>{stats.cpuUsage}%</span>
              </div>
              <div className="monitor-bar-bg">
                <div className="monitor-bar-fill cyan" style={{ width: `${stats.cpuUsage}%` }} />
              </div>
            </div>
            <div className="monitor-item">
              <div className="monitor-label">
                <span>内存占用</span>
                <span>{formatBytes(stats.memUsed)} / {formatBytes(stats.memTotal)}</span>
              </div>
              <div className="monitor-bar-bg">
                <div className="monitor-bar-fill orange" style={{ width: `${stats.memPercent}%` }} />
              </div>
            </div>
            <div className="monitor-item">
              <div className="monitor-label">
                <span>磁盘空间</span>
                <span>{formatBytes(stats.diskUsed)} / {formatBytes(stats.diskTotal)}</span>
              </div>
              <div className="monitor-bar-bg">
                <div className="monitor-bar-fill rose" style={{ width: `${stats.diskPercent}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SSH 命令 */}
      <div className="section-block">
        <div className="section-header">SSH 命令行</div>
        <div className="command-box">
          <code>ssh {username}@{host}{port !== 22 ? ` -p ${port}` : ''}</code>
        </div>
      </div>

      {/* 操作区域 */}
      <div className="connection-actions">
        {isConnected && (
          <Button
            type="text"
            icon={<DisconnectOutlined />}
            onClick={onDisconnect}
            className="action-btn-ghost"
          >
            断开连接
          </Button>
        )}
        {isDisconnected && (
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={onReconnect}
            className="action-btn-filled"
          >
            重新连接
          </Button>
        )}
      </div>
    </div>
  )
}

export default ConnectionDetailPanel
