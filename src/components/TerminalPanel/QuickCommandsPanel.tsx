import { useState, useRef } from 'react'
import { Button, Input, Empty, App, Popconfirm } from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  CloseOutlined,
  SendOutlined,
  EditOutlined,
  CheckOutlined,
} from '@ant-design/icons'

interface QuickCommand {
  name: string
  command: string
}

interface QuickCommandsPanelProps {
  commands: QuickCommand[]
  onExecute: (command: string) => void
  onSave: (commands: QuickCommand[]) => void
  onClose: () => void
}

const QuickCommandsPanel: React.FC<QuickCommandsPanelProps> = ({
  commands,
  onExecute,
  onSave,
  onClose,
}) => {
  const { message } = App.useApp()
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editCommand, setEditCommand] = useState('')
  const [adding, setAdding] = useState(false)
  const nameInputRef = useRef<any>(null)

  const handleAdd = () => {
    setAdding(true)
    setEditName('')
    setEditCommand('')
    setTimeout(() => nameInputRef.current?.focus(), 50)
  }

  const handleSaveNew = () => {
    if (!editName.trim() || !editCommand.trim()) {
      message.warning('请填写名称和命令')
      return
    }
    onSave([...commands, { name: editName.trim(), command: editCommand.trim() }])
    setAdding(false)
    setEditName('')
    setEditCommand('')
  }

  const handleEdit = (index: number) => {
    setEditingIndex(index)
    setEditName(commands[index].name)
    setEditCommand(commands[index].command)
  }

  const handleSaveEdit = () => {
    if (editingIndex === null) return
    if (!editName.trim() || !editCommand.trim()) {
      message.warning('请填写名称和命令')
      return
    }
    const updated = [...commands]
    updated[editingIndex] = { name: editName.trim(), command: editCommand.trim() }
    onSave(updated)
    setEditingIndex(null)
  }

  const handleDelete = (index: number) => {
    const updated = commands.filter((_, i) => i !== index)
    onSave(updated)
  }

  return (
    <div className="quick-commands-panel">
      <div className="quick-commands-header">
        <span className="quick-commands-title">快捷命令</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <Button size="small" type="text" icon={<PlusOutlined />} onClick={handleAdd} title="添加命令" />
          <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClose} />
        </div>
      </div>

      <div className="quick-commands-list">
        {commands.length === 0 && !adding && (
          <Empty description="暂无快捷命令" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '12px 0' }} />
        )}

        {commands.map((cmd, i) => (
          <div key={i} className="quick-command-item">
            {editingIndex === i ? (
              <div className="quick-command-edit">
                <Input size="small" placeholder="名称" value={editName} onChange={e => setEditName(e.target.value)} />
                <Input size="small" placeholder="命令" value={editCommand} onChange={e => setEditCommand(e.target.value)} onPressEnter={handleSaveEdit} />
                <div className="quick-command-edit-actions">
                  <Button size="small" type="primary" icon={<CheckOutlined />} onClick={handleSaveEdit} />
                  <Button size="small" onClick={() => setEditingIndex(null)}>取消</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="quick-command-info" onClick={() => onExecute(cmd.command)} title={`点击输入: ${cmd.command}`}>
                  <span className="quick-command-name">{cmd.name}</span>
                  <code className="quick-command-code">{cmd.command}</code>
                </div>
                <div className="quick-command-actions">
                  <Button size="small" type="text" icon={<SendOutlined />} onClick={() => onExecute(cmd.command)} title="输入到终端" />
                  <Button size="small" type="text" icon={<EditOutlined />} onClick={() => handleEdit(i)} title="编辑" />
                  <Popconfirm title="确定删除？" onConfirm={() => handleDelete(i)} okText="删除" cancelText="取消">
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} title="删除" />
                  </Popconfirm>
                </div>
              </>
            )}
          </div>
        ))}

        {adding && (
          <div className="quick-command-item">
            <div className="quick-command-edit">
              <Input ref={nameInputRef} size="small" placeholder="命令名称" value={editName} onChange={e => setEditName(e.target.value)} />
              <Input size="small" placeholder="命令内容" value={editCommand} onChange={e => setEditCommand(e.target.value)} onPressEnter={handleSaveNew} />
              <div className="quick-command-edit-actions">
                <Button size="small" type="primary" icon={<CheckOutlined />} onClick={handleSaveNew} />
                <Button size="small" onClick={() => setAdding(false)}>取消</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default QuickCommandsPanel
