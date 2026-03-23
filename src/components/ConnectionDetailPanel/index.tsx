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

  // 环形进度 SVG
  const CircleProgress = ({ percent, color, label, detail }: { percent: number; color: string; label: string; detail: string }) => {
    const r = 28
    const c = 2 * Math.PI * r
    const offset = c - (percent / 100) * c
    return (
      <div className="circle-progress">
        <svg width="68" height="68" viewBox="0 0 68 68">
          <circle cx="34" cy="34" r={r} fill="none" stroke="var(--border-color)" strokeWidth="5" />
          <circle cx="34" cy="34" r={r} fill="none" stroke={color} strokeWidth="5"
            strokeDasharray={c} strokeDashoffset={offset}
            strokeLinecap="round" transform="rotate(-90 34 34)"
            style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
          <text x="34" y="31" textAnchor="middle" fill="var(--text-color)" fontSize="14" fontWeight="700">{percent}%</text>
          <text x="34" y="44" textAnchor="middle" fill="var(--text-tertiary)" fontSize="8">{label}</text>
        </svg>
        <span className="circle-detail">{detail}</span>
      </div>
    )
  }

  const getColor = (pct: number) => pct > 80 ? '#ff4b4b' : pct > 50 ? '#ff9f43' : '#00d9bc'

  return (
    <div className="connection-detail-panel">
      {/* 头部 */}
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

      {/* 资源概览 — 三环 */}
      {stats && (
        <div className="resource-rings">
          <CircleProgress percent={stats.cpuUsage} color={getColor(stats.cpuUsage)} label="CPU" detail={stats.loadAvg ? `负载 ${stats.loadAvg}` : ''} />
          <CircleProgress percent={stats.memPercent} color={getColor(stats.memPercent)} label="内存" detail={`${formatBytes(stats.memUsed)} / ${formatBytes(stats.memTotal)}`} />
          <CircleProgress percent={stats.diskPercent} color={getColor(stats.diskPercent)} label="磁盘" detail={`${formatBytes(stats.diskUsed)} / ${formatBytes(stats.diskTotal)}`} />
        </div>
      )}

      {/* 服务器信息 */}
      <div className="section-block">
        <div className="section-header">服务器</div>
        <div className="info-card">
          {stats?.osInfo && (
            <div className="info-row">
              <span className="info-label">系统</span>
              <span className="info-value">{stats.osInfo}</span>
            </div>
          )}
          {stats?.hostname && (
            <div className="info-row">
              <span className="info-label">主机名</span>
              <span className="info-value copyable" onClick={() => handleCopy(stats.hostname)}>
                {stats.hostname}<CopyOutlined className="copy-icon" />
              </span>
            </div>
          )}
          <div className="info-row">
            <span className="info-label">地址</span>
            <span className="info-value copyable" onClick={() => handleCopy(`${host}:${port}`)}>
              {host}:{port}<CopyOutlined className="copy-icon" />
            </span>
          </div>
          {stats?.networkIP && (
            <div className="info-row">
              <span className="info-label">内网</span>
              <span className="info-value copyable" onClick={() => handleCopy(stats.networkIP)}>
                {stats.networkIP}<CopyOutlined className="copy-icon" />
              </span>
            </div>
          )}
          <div className="info-row">
            <span className="info-label">用户</span>
            <span className="info-value">{username}</span>
          </div>
        </div>
      </div>

      {/* 运行概况 */}
      {stats && (
        <div className="section-block">
          <div className="section-header">运行</div>
          <div className="quick-stats">
            {stats.uptime && (
              <div className="quick-stat-item">
                <span className="quick-stat-value">{formatUptimeDays(stats.uptime)}</span>
                <span className="quick-stat-label">运行时间</span>
              </div>
            )}
            <div className="quick-stat-item">
              <span className="quick-stat-value">{stats.processCount}</span>
              <span className="quick-stat-label">进程</span>
            </div>
            <div className="quick-stat-item">
              <span className="quick-stat-value">{stats.loginUsers}</span>
              <span className="quick-stat-label">在线用户</span>
            </div>
          </div>
        </div>
      )}

      {/* TOP 进程 */}
      {stats && stats.topProcesses.length > 0 && (
        <div className="section-block">
          <div className="section-header">TOP 进程</div>
          <div className="top-process-list">
            <div className="top-process-header">
              <span className="tp-col tp-cmd">命令</span>
              <span className="tp-col tp-cpu">CPU</span>
              <span className="tp-col tp-mem">MEM</span>
            </div>
            {stats.topProcesses.map((p, i) => (
              <div key={i} className="top-process-row">
                <span className="tp-col tp-cmd" title={`${p.fullCommand} (PID: ${p.pid}, User: ${p.user})`}>{p.command}</span>
                <span className="tp-col tp-cpu">{p.cpu}%</span>
                <span className="tp-col tp-mem">{p.mem}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ConnectionDetailPanel
