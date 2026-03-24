import { Button, Tooltip } from 'antd'
import {
  UploadOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  LoadingOutlined,
  CloseOutlined,
  DeleteOutlined,
  ClearOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  StopOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons'
import { useTransferStore } from '../../stores/transferStore'
import type { TransferTask } from '../../stores/transferStore'
import './index.css'

const TransferPanel: React.FC = () => {
  const {
    tasks,
    panelVisible,
    setPanelVisible,
    pauseTask,
    cancelTask,
    resumeTask,
    retryTask,
    clearCompleted,
    clearAll,
  } = useTransferStore()

  if (!panelVisible || tasks.length === 0) return null

  const transferringCount = tasks.filter(t => t.status === 'transferring').length
  const completedCount = tasks.filter(t => t.status === 'completed').length
  const failedCount = tasks.filter(t => t.status === 'failed').length
  const pendingCount = tasks.filter(t => t.status === 'pending').length
  const pausedCount = tasks.filter(t => t.status === 'paused').length
  const cancelledCount = tasks.filter(t => t.status === 'cancelled').length

  // Group tasks by serverName
  const grouped = tasks.reduce<Record<string, TransferTask[]>>((acc, task) => {
    const key = task.serverName || task.connectionId
    if (!acc[key]) acc[key] = []
    acc[key].push(task)
    return acc
  }, {})

  const renderStatusIcon = (task: TransferTask) => {
    switch (task.status) {
      case 'transferring': return <LoadingOutlined style={{ color: 'var(--primary-color)' }} />
      case 'pending': return <ClockCircleOutlined style={{ color: '#8c8c8c' }} />
      case 'paused': return <PauseCircleOutlined style={{ color: '#faad14' }} />
      case 'completed': return <CheckCircleOutlined style={{ color: '#52c41a' }} />
      case 'cancelled': return <MinusCircleOutlined style={{ color: '#8c8c8c' }} />
      case 'failed': return (
        <Tooltip title={task.error}>
          <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
        </Tooltip>
      )
    }
  }

  return (
    <div className="transfer-panel-popover">
      <div className="transfer-panel-header">
        <span className="transfer-panel-title">
          传输队列
          <span className="transfer-panel-stats">
            {transferringCount > 0 && <span className="stat-transferring">{transferringCount} 传输中</span>}
            {pendingCount > 0 && <span className="stat-pending">{pendingCount} 等待</span>}
            {pausedCount > 0 && <span className="stat-pending">{pausedCount} 已暂停</span>}
            {completedCount > 0 && <span className="stat-completed">{completedCount} 完成</span>}
            {cancelledCount > 0 && <span className="stat-pending">{cancelledCount} 已取消</span>}
            {failedCount > 0 && <span className="stat-failed">{failedCount} 失败</span>}
          </span>
        </span>
        <span className="transfer-panel-actions">
          {completedCount > 0 && (
            <Button size="small" type="text" icon={<ClearOutlined />} onClick={clearCompleted} title="清除已完成" />
          )}
          <Button size="small" type="text" icon={<DeleteOutlined />} onClick={clearAll} title="清除全部" />
          <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => setPanelVisible(false)} title="关闭面板" />
        </span>
      </div>
      <div className="transfer-panel-body">
        {Object.entries(grouped).map(([serverName, serverTasks]) => (
          <div key={serverName} className="transfer-group">
            <div className="transfer-group-header">{serverName}</div>
            {serverTasks.map(task => (
              <div key={task.id} className={`transfer-item ${task.status}`}>
                <span className="transfer-item-icon">
                  {task.type === 'upload' ? <UploadOutlined /> : <DownloadOutlined />}
                </span>
                <span className="transfer-item-name" title={task.fileName}>{task.fileName}</span>
                <span className="transfer-item-status">
                  {task.status === 'pending' && '等待中'}
                  {task.status === 'paused' && '已暂停'}
                  {task.status === 'transferring' && (
                    <>
                      {task.progress}%
                      {task.speed && <span className="transfer-speed">{task.speed}</span>}
                    </>
                  )}
                  {task.status === 'completed' && '已完成'}
                  {task.status === 'cancelled' && '已取消'}
                  {task.status === 'failed' && (
                    <Tooltip title={task.error}><span>失败</span></Tooltip>
                  )}
                </span>
                {(task.status === 'transferring' || task.status === 'paused') && (
                  <div className="transfer-item-progress-bar">
                    <div className="transfer-item-progress-fill" style={{ width: `${task.progress}%` }} />
                  </div>
                )}
                <span className="transfer-item-status-icon">{renderStatusIcon(task)}</span>
                <span className="transfer-item-actions">
                  {task.status === 'pending' && (
                    <Button className="transfer-action-btn" size="small" type="text" danger onClick={() => cancelTask(task.id)}>
                      取消
                    </Button>
                  )}
                  {task.status === 'transferring' && (
                    <>
                      <Tooltip title="暂停传输">
                        <Button className="transfer-action-btn" size="small" type="text" onClick={() => pauseTask(task.id)}>
                          <PauseCircleOutlined />
                        </Button>
                      </Tooltip>
                      <Tooltip title="取消传输">
                        <Button className="transfer-action-btn" size="small" type="text" danger onClick={() => cancelTask(task.id)}>
                          <StopOutlined />
                        </Button>
                      </Tooltip>
                    </>
                  )}
                  {task.status === 'paused' && (
                    <>
                      <Tooltip title="继续传输">
                        <Button className="transfer-action-btn" size="small" type="text" onClick={() => resumeTask(task.id)}>
                          <PlayCircleOutlined />
                        </Button>
                      </Tooltip>
                      <Tooltip title="取消传输">
                        <Button className="transfer-action-btn" size="small" type="text" danger onClick={() => cancelTask(task.id)}>
                          <StopOutlined />
                        </Button>
                      </Tooltip>
                    </>
                  )}
                  {task.status === 'failed' && (
                    <Button className="transfer-action-btn" size="small" type="text" onClick={() => retryTask(task.id)}>
                      重试
                    </Button>
                  )}
                  {task.status === 'cancelled' && (
                    <Button className="transfer-action-btn" size="small" type="text" onClick={() => retryTask(task.id)}>
                      重新开始
                    </Button>
                  )}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default TransferPanel
