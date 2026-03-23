import { useState, useEffect, useRef } from 'react'
import { App } from 'antd'
import {
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
}

const ConnectionDetailPanel: React.FC<ConnectionDetailPanelProps> = ({
  connectionId,
  serverName,
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

  const statusLabel = isConnected ? '在线' : isDisconnected ? '离线' : '连接中'

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`
  }

  // 将 uptime 转换为天数显示
  const formatUptimeDays = (raw: string): string => {
    if (!raw) return '—'
    let s = raw.replace(/^up\s+/i, '').trim()
    s = s.replace(/,?\s*\d+\s*users?.*$/i, '').trim()
    s = s.replace(/,?\s*load\s+averag.*$/i, '').trim()

    let totalMinutes = 0

    const weekMatch = s.match(/(\d+)\s*weeks?/i)
    if (weekMatch) totalMinutes += parseInt(weekMatch[1]) * 7 * 24 * 60

    const dayMatch = s.match(/(\d+)\s*days?/i)
    if (dayMatch) totalMinutes += parseInt(dayMatch[1]) * 24 * 60

    const hourMatch = s.match(/(\d+)\s*hours?/i)
    const hmMatch = !hourMatch && s.match(/(\d+):(\d+)/)
    if (hourMatch) {
      totalMinutes += parseInt(hourMatch[1]) * 60
    } else if (hmMatch) {
      totalMinutes += parseInt(hmMatch[1]) * 60 + parseInt(hmMatch[2])
    }

    if (!hmMatch) {
      const minMatch = s.match(/(\d+)\s*min/i)
      if (minMatch) totalMinutes += parseInt(minMatch[1])
    }

    if (totalMinutes === 0) return s || '—'

    const days = totalMinutes / (24 * 60)
    if (days >= 1) return `${Math.floor(days)} 天`
    const hours = totalMinutes / 60
    if (hours >= 1) return `${Math.floor(hours)} 小时`
    return `${totalMinutes} 分钟`
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

      {/* 服务器信息 */}
      <div className="section-block">
        <div className="section-header">服务器信息</div>
        {stats?.osInfo && (
          <>
            <div className="detail-item">
              <span className="detail-label">操作系统</span>
              <span className="detail-value">{stats.osInfo}</span>
            </div>
            <div className="detail-divider" />
          </>
        )}
        {stats?.hostname && (
          <>
            <div className="detail-item">
              <span className="detail-label">主机名</span>
              <span className="detail-value">
                {stats.hostname}
                <CopyOutlined className="copy-icon" onClick={() => handleCopy(stats.hostname)} />
              </span>
            </div>
            <div className="detail-divider" />
          </>
        )}
        <div className="detail-item">
          <span className="detail-label">地址</span>
          <span className="detail-value">
            {host}:{port}
            <CopyOutlined className="copy-icon" onClick={() => handleCopy(`${host}:${port}`)} />
          </span>
        </div>
        {stats?.networkIP && (
          <>
            <div className="detail-divider" />
            <div className="detail-item">
              <span className="detail-label">内网 IP</span>
              <span className="detail-value">
                {stats.networkIP}
                <CopyOutlined className="copy-icon" onClick={() => handleCopy(stats.networkIP)} />
              </span>
            </div>
          </>
        )}
        <div className="detail-divider" />
        <div className="detail-item">
          <span className="detail-label">用户</span>
          <span className="detail-value">{username}</span>
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

      {/* 运行状态 */}
      {stats && (
        <div className="section-block">
          <div className="section-header">运行状态</div>
          <div className="stats-grid">
            {stats.loadAvg && (
              <div className="stats-card">
                <span className="stats-card-value">{stats.loadAvg}</span>
                <span className="stats-card-label">负载均衡</span>
              </div>
            )}
            <div className="stats-card">
              <span className="stats-card-value">{stats.loginUsers}</span>
              <span className="stats-card-label">登录用户</span>
            </div>
            <div className="stats-card">
              <span className="stats-card-value">{stats.processCount}</span>
              <span className="stats-card-label">进程数</span>
            </div>
          </div>
        </div>
      )}

      {/* 资源监控 */}
      {stats && (
        <div className="section-block">
          <div className="section-header">资源监控</div>
          <div className="monitor-list">
            <div className="monitor-item">
              <div className="monitor-label">
                <span>CPU</span>
                <span>{stats.cpuUsage}%</span>
              </div>
              <div className="monitor-bar-bg">
                <div className={`monitor-bar-fill ${stats.cpuUsage > 80 ? 'rose' : stats.cpuUsage > 50 ? 'orange' : 'cyan'}`} style={{ width: `${stats.cpuUsage}%` }} />
              </div>
            </div>
            <div className="monitor-item">
              <div className="monitor-label">
                <span>内存</span>
                <span>{formatBytes(stats.memUsed)} / {formatBytes(stats.memTotal)}</span>
              </div>
              <div className="monitor-bar-bg">
                <div className={`monitor-bar-fill ${stats.memPercent > 80 ? 'rose' : stats.memPercent > 50 ? 'orange' : 'cyan'}`} style={{ width: `${stats.memPercent}%` }} />
              </div>
            </div>
            <div className="monitor-item">
              <div className="monitor-label">
                <span>磁盘</span>
                <span>{formatBytes(stats.diskUsed)} / {formatBytes(stats.diskTotal)}</span>
              </div>
              <div className="monitor-bar-bg">
                <div className={`monitor-bar-fill ${stats.diskPercent > 80 ? 'rose' : stats.diskPercent > 50 ? 'orange' : 'cyan'}`} style={{ width: `${stats.diskPercent}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ConnectionDetailPanel
