import { useState } from 'react'
import { Input, Button } from 'antd'
import {
  SearchOutlined,
  PlusOutlined,
  FolderAddOutlined,
} from '@ant-design/icons'
import ServerTree from '../ServerTree'
import Tooltip from '../DelayedTooltip'
import './index.css'

interface ServerListPanelProps {
  onConnect: (serverId: string) => void
}

const ServerListPanel: React.FC<ServerListPanelProps> = ({ onConnect }) => {
  const [searchKeyword, setSearchKeyword] = useState('')

  return (
    <div className="server-list-panel">
      <div className="server-list-topbar">
        <span className="server-list-topbar-title">会话管理</span>
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索服务器..."
          value={searchKeyword}
          onChange={e => setSearchKeyword(e.target.value)}
          allowClear
          className="server-list-search"
        />
        <div className="server-list-topbar-actions">
          <Tooltip title="新建会话">
            <Button
              type="text"
              icon={<PlusOutlined />}
              onClick={() => window.dispatchEvent(new CustomEvent('server-tree-new-session'))}
              className="server-list-action-btn"
            />
          </Tooltip>
          <Tooltip title="新建分组">
            <Button
              type="text"
              icon={<FolderAddOutlined />}
              onClick={() => {
                // 触发 ServerTree 内部的新建分组，通过自定义事件
                window.dispatchEvent(new CustomEvent('server-tree-new-group'))
              }}
              className="server-list-action-btn"
            />
          </Tooltip>
        </div>
      </div>

      <div className="server-list-tree-wrapper">
        <ServerTree
          onConnect={onConnect}
          className="server-list-tree"
          showDetail
          searchKeyword={searchKeyword}
          listenNewSession
        />
      </div>
    </div>
  )
}

export default ServerListPanel
