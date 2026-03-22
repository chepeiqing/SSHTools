import { Button } from 'antd'

interface TerminalHistoryPanelProps {
  commands: string[]
  loading: boolean
  onExecute: (cmd: string) => void
  onClose: () => void
}

const TerminalHistoryPanel: React.FC<TerminalHistoryPanelProps> = ({
  commands,
  loading,
  onExecute,
  onClose,
}) => {
  return (
    <div className="history-panel">
      <div className="history-header">
        <span className="history-title">历史命令</span>
        <Button type="text" size="small" onClick={onClose}>✕</Button>
      </div>
      <div className="history-list">
        {loading ? (
          <div className="history-empty">加载中...</div>
        ) : commands.length === 0 ? (
          <div className="history-empty">暂无历史命令</div>
        ) : (
          commands.map((cmd, i) => (
            <div
              key={i}
              className="history-item"
              onClick={() => onExecute(cmd)}
              title={cmd}
            >
              {cmd}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default TerminalHistoryPanel
