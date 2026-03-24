import { Button, Empty, App, Popconfirm } from 'antd'
import {
  CloseOutlined,
  SendOutlined,
  CopyOutlined,
  DeleteOutlined,
} from '@ant-design/icons'

interface TerminalHistoryPanelProps {
  commands: string[]
  onExecute: (cmd: string) => void
  onDelete: (cmd: string) => void
  onClear: () => void
  onClose: () => void
}

const TerminalHistoryPanel: React.FC<TerminalHistoryPanelProps> = ({
  commands,
  onExecute,
  onDelete,
  onClear,
  onClose,
}) => {
  const { message } = App.useApp()

  const handleCopy = async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd)
      message.success('已复制')
    } catch {
      message.error('复制失败')
    }
  }

  return (
    <div className="history-panel">
      <div className="history-header">
        <span className="history-title">历史命令</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {commands.length > 0 && (
            <Popconfirm title="确定清空所有历史？" onConfirm={onClear} okText="清空" cancelText="取消">
              <Button size="small" type="text" danger icon={<DeleteOutlined />} title="清空历史" />
            </Popconfirm>
          )}
          <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClose} />
        </div>
      </div>
      <div className="history-list">
        {commands.length === 0 ? (
          <Empty description="暂无历史命令" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '12px 0' }} />
        ) : (
          commands.map((cmd, i) => (
            <div key={i} className="history-item">
              <code className="history-cmd" title={cmd}>{cmd}</code>
              <div className="history-actions">
                <Button size="small" type="text" icon={<SendOutlined />} onClick={() => onExecute(cmd)} title="执行" />
                <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => handleCopy(cmd)} title="复制" />
                <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => onDelete(cmd)} title="删除" />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default TerminalHistoryPanel
