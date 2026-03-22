import { useState, useEffect, useMemo, useRef } from 'react'
import { Tree, Dropdown, App, Modal, Input } from 'antd'
import {
  PlusOutlined,
  FolderAddOutlined,
  EditOutlined,
  DeleteOutlined,
  ApiOutlined,
  CopyOutlined,
} from '@ant-design/icons'
import type { MenuProps, TreeDataNode } from 'antd'
import { useServerStore, type ServerConfig } from '../../stores/serverStore'
import { useConnectionStore } from '../../stores/connectionStore'
import { onOpenNewSession } from '../SessionManager'
import NewSessionModal from '../SessionManager/NewSessionModal'
import './index.css'

interface ServerTreeProps {
  onConnect: (serverId: string) => void
  className?: string
  showDetail?: boolean
  searchKeyword?: string
  listenNewSession?: boolean
}

const ServerTree: React.FC<ServerTreeProps> = ({ onConnect, className, showDetail, searchKeyword, listenNewSession }) => {
  const [newSessionVisible, setNewSessionVisible] = useState(false)
  const [editingServer, setEditingServer] = useState<ServerConfig | null>(null)
  const [copyData, setCopyData] = useState<Partial<ServerConfig> | null>(null)
  const [defaultGroupId, setDefaultGroupId] = useState<string | undefined>()
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([])
  const [renameVisible, setRenameVisible] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameGroupId, setRenameGroupId] = useState<string | undefined>()
  const [newGroupVisible, setNewGroupVisible] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupParentId, setNewGroupParentId] = useState<string | undefined>()
  const [blankMenuOpen, setBlankMenuOpen] = useState(false)

  const { servers, groups, addServer, updateServer, deleteServer, addGroup, updateGroup, deleteGroup } = useServerStore()
  const { connections } = useConnectionStore()
  const { message, modal } = App.useApp()

  // 初始化时展开所有分组
  const expandedKeysInitRef = useRef(false)
  const allGroupKeys = useMemo(() => groups.map(g => `group-${g.id}`), [groups])
  useEffect(() => {
    setExpandedKeys(prev => {
      const newKeys = allGroupKeys.filter(k => !prev.includes(k) && !expandedKeysInitRef.current)
      if (!expandedKeysInitRef.current) {
        expandedKeysInitRef.current = true
        return allGroupKeys
      }
      return newKeys.length > 0 ? [...prev, ...newKeys] : prev
    })
  }, [allGroupKeys])

  // 监听外部打开新建会话事件
  useEffect(() => {
    if (!listenNewSession) return
    return onOpenNewSession(() => {
      setEditingServer(null)
      setDefaultGroupId(undefined)
      setNewSessionVisible(true)
    })
  }, [listenNewSession])

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

  // 递归构建树形数据
  const buildTreeData = (): TreeDataNode[] => {
    // 搜索过滤：匹配名称、主机、用户名、描述
    const keyword = searchKeyword?.trim().toLowerCase()
    const matchServer = (s: typeof servers[0]) => {
      if (!keyword) return true
      return s.name.toLowerCase().includes(keyword)
        || s.host.toLowerCase().includes(keyword)
        || s.username.toLowerCase().includes(keyword)
        || (s.description || '').toLowerCase().includes(keyword)
    }

    // 搜索模式下，收集所有匹配服务器所在的分组链
    const matchedServerIds = new Set<string>()
    const matchedGroupIds = new Set<string>()
    if (keyword) {
      servers.forEach(s => {
        if (matchServer(s)) {
          matchedServerIds.add(s.id)
          // 向上收集所有祖先分组
          let gid = s.groupId || 'default'
          while (gid) {
            matchedGroupIds.add(gid)
            const g = groups.find(g => g.id === gid)
            gid = g?.parentId || ''
          }
        }
      })
    }

    const serversByGroup = new Map<string, typeof servers>()
    servers.forEach((server) => {
      if (keyword && !matchedServerIds.has(server.id)) return
      const groupId = server.groupId || 'default'
      if (!serversByGroup.has(groupId)) serversByGroup.set(groupId, [])
      serversByGroup.get(groupId)!.push(server)
    })

    const groupColors = ['#00e5ff', '#ff4081', '#7c4dff', '#ff9800', '#4caf50', '#e91e63', '#00bcd4', '#8bc34a']

    const buildGroupNodes = (parentId?: string, depth = 0): TreeDataNode[] => {
      const childGroups = groups
        .filter(g => (g.parentId || undefined) === parentId)
        .filter(g => !keyword || matchedGroupIds.has(g.id))
        .sort((a, b) => a.order - b.order)

      return childGroups.map((group, index) => {
        const groupServers = serversByGroup.get(group.id) || []
        const colorIndex = (depth + index) % groupColors.length
        const groupColor = groupColors[colorIndex]

        const childGroupNodes = buildGroupNodes(group.id, depth + 1)

        const serverNodes: TreeDataNode[] = groupServers.map((server) => {
          const status = getServerStatus(server.id)
          const portLabel = server.port !== 22 ? `:${server.port}` : ''
          return {
            key: server.id,
            title: (
              <div onContextMenu={e => { e.stopPropagation(); setBlankMenuOpen(false) }}>
                <Dropdown menu={{ items: buildServerMenu(server.id) }} trigger={['contextMenu']}>
                  {showDetail ? (
                    <div className="tree-server-card detail">
                      <div className="server-info">
                        <div className="server-name">{server.name}</div>
                        <div className="server-meta-row">
                          <span className="server-host">{server.username}@{server.host}{portLabel}</span>
                          {server.description && (
                            <>
                              <span className="meta-sep" />
                              <span className="server-desc">{server.description}</span>
                            </>
                          )}
                          {server.lastConnectedAt && (
                            <>
                              <span className="meta-sep" />
                              <span className="server-last-connect">{formatTime(server.lastConnectedAt)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <span className={`server-status-dot ${status}`} />
                    </div>
                  ) : (
                    <div className="tree-server-card">
                      <div className="server-info">
                        <div className="server-name">{server.name}</div>
                        <div className="server-host">{server.username}@{server.host}{portLabel}</div>
                      </div>
                      <span className={`server-status-dot ${status}`} />
                    </div>
                  )}
                </Dropdown>
              </div>
            ),
            isLeaf: true,
          }
        })

        const totalCount = countServersInGroup(group.id)

        return {
          key: `group-${group.id}`,
          title: (
            <div onContextMenu={e => { e.stopPropagation(); setBlankMenuOpen(false) }}>
              <Dropdown menu={{ items: buildGroupMenu(group.id) }} trigger={['contextMenu']}>
                <div className="tree-group-title">
                  <span className="group-icon" style={{ backgroundColor: groupColor }} />
                  <span className="group-name">{group.name}</span>
                  <div className="group-count-badge">
                    <span>{totalCount}</span>
                  </div>
                </div>
              </Dropdown>
            </div>
          ),
          children: [...childGroupNodes, ...serverNodes],
        }
      })
    }

    return buildGroupNodes(undefined)
  }

  const countServersInGroup = (groupId: string): number => {
    let count = servers.filter(s => (s.groupId || 'default') === groupId).length
    groups.forEach(g => {
      if (g.parentId === groupId) {
        count += countServersInGroup(g.id)
      }
    })
    return count
  }

  // 单击只选中
  const handleSelect = (selectedKeys: React.Key[]) => {
    if (selectedKeys.length > 0) {
      setSelectedNode(selectedKeys[0] as string)
    }
  }

  const handleTreeClick = (_e: React.MouseEvent, node: TreeDataNode) => {
    const key = node.key as string
    if (key.startsWith('group-')) {
      setExpandedKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
    }
  }

  // 双击连接服务器
  const handleTreeDoubleClick = (_e: React.MouseEvent, node: TreeDataNode) => {
    const key = node.key as string
    if (!key.startsWith('group-')) {
      onConnect(key)
    }
  }

  // 右键菜单处理（不再需要 handleRightClick，菜单直接嵌入节点）

  // 构建服务器右键菜单
  const buildServerMenu = (serverId: string): MenuProps['items'] => {
    const server = servers.find(s => s.id === serverId)
    const groupId = server?.groupId || 'default'
    return [
      { key: 'connect', label: '连接', icon: <ApiOutlined />, onClick: () => onConnect(serverId) },
      { type: 'divider' },
      { key: 'newSession', label: '新建会话', icon: <PlusOutlined />, onClick: () => {
        setEditingServer(null)
        setDefaultGroupId(groupId)
        setNewSessionVisible(true)
      }},
      { key: 'newFolder', label: '新建分组', icon: <FolderAddOutlined />, onClick: () => {
        setNewGroupParentId(groupId)
        setNewGroupVisible(true)
      }},
      { type: 'divider' },
      { key: 'edit', label: '编辑', icon: <EditOutlined />, onClick: () => {
        if (server) {
          setEditingServer(server)
          setDefaultGroupId(undefined)
          setNewSessionVisible(true)
        }
      }},
      { key: 'copy', label: '复制', icon: <CopyOutlined />, onClick: () => {
        if (server) {
          // 以新建模式打开，回显除 id 外的所有数据，名称加 " (副本)"
          const { id: _id, ...rest } = server
          setEditingServer(null)
          setCopyData({ ...rest, name: `${server.name} (副本)` })
          setDefaultGroupId(undefined)
          setNewSessionVisible(true)
        }
      }},
      { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true, onClick: () => {
        modal.confirm({
          title: '确认删除',
          content: `确定要删除 "${server?.name || '该服务器'}" 吗？`,
          okText: '删除',
          okButtonProps: { danger: true },
          cancelText: '取消',
          centered: true,
          onOk: () => {
            deleteServer(serverId)
            if (selectedNode === serverId) setSelectedNode(null)
            message.success('已删除')
          },
        })
      }},
    ]
  }

  // 构建分组右键菜单
  const buildGroupMenu = (groupId: string): MenuProps['items'] => {
    return [
      { key: 'newSession', label: '新建会话', icon: <PlusOutlined />, onClick: () => {
        setEditingServer(null)
        setDefaultGroupId(groupId)
        setNewSessionVisible(true)
      }},
      { key: 'newFolder', label: '新建子分组', icon: <FolderAddOutlined />, onClick: () => {
        setNewGroupParentId(groupId)
        setNewGroupVisible(true)
      }},
      { type: 'divider' },
      { key: 'rename', label: '重命名分组', icon: <EditOutlined />, onClick: () => {
        const group = groups.find(g => g.id === groupId)
        if (group) {
          setRenameGroupId(groupId)
          setRenameValue(group.name)
          setRenameVisible(true)
        }
      }},
      { key: 'delete', label: '删除分组', icon: <DeleteOutlined />, danger: true, onClick: () => {
        const group = groups.find(g => g.id === groupId)
        if (group?.id === 'default') {
          message.warning('默认分组不能删除')
          return
        }
        const childCount = useServerStore.getState().getDescendantGroupIds(groupId).length
        const serverCount = countServersInGroup(groupId)
        const extra = childCount > 0 ? `包含 ${childCount} 个子分组和 ${serverCount} 个服务器，` : ''
        modal.confirm({
          title: '确认删除分组',
          content: `确定要删除分组 "${group?.name}" 吗？${extra}其中的服务器将移到上级分组。`,
          okText: '删除',
          okButtonProps: { danger: true },
          cancelText: '取消',
          centered: true,
          onOk: () => {
            deleteGroup(groupId)
            message.success('分组已删除')
          },
        })
      }},
    ]
  }

  // 空白区域右键菜单
  const blankAreaMenu: MenuProps['items'] = [
    { key: 'newSession', label: '新建会话', icon: <PlusOutlined />, onClick: () => {
      setEditingServer(null)
      setDefaultGroupId(undefined)
      setNewSessionVisible(true)
    }},
    { key: 'newFolder', label: '新建分组', icon: <FolderAddOutlined />, onClick: () => {
      setNewGroupParentId(undefined)
      setNewGroupVisible(true)
    }},
  ]

  const handleRenameOk = () => {
    if (!renameGroupId || !renameValue.trim()) return
    updateGroup(renameGroupId, { name: renameValue.trim() })
    setRenameVisible(false)
    setRenameValue('')
    setRenameGroupId(undefined)
    message.success('分组已重命名')
  }

  const handleNewGroup = () => {
    if (!newGroupName.trim()) return
    addGroup({ name: newGroupName.trim(), order: groups.length, parentId: newGroupParentId })
    setNewGroupVisible(false)
    setNewGroupName('')
    setNewGroupParentId(undefined)
    message.success('分组已创建')
  }

  const newGroupTitle = newGroupParentId
    ? `新建子分组 (在 "${groups.find(g => g.id === newGroupParentId)?.name}" 下)`
    : '新建分组'

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
    if (diff < 2592000000) return `${Math.floor(diff / 86400000)} 天前`
    return new Date(ts).toLocaleDateString()
  }

  return (
    <>
      <Dropdown menu={{ items: blankAreaMenu }} trigger={['contextMenu']} open={blankMenuOpen} onOpenChange={setBlankMenuOpen}>
        <div className={className} style={{ flex: 1 }}>
          <Tree
            blockNode
            treeData={buildTreeData()}
            onSelect={handleSelect}
            onClick={handleTreeClick}
            onDoubleClick={handleTreeDoubleClick}
            expandedKeys={expandedKeys}
            onExpand={setExpandedKeys}
            className="session-tree"
            selectedKeys={selectedNode ? [selectedNode] : []}
            switcherIcon={(nodeProps: any) => nodeProps.isLeaf ? <span style={{ display: 'none' }} /> : undefined}
          />
        </div>
      </Dropdown>

      <NewSessionModal
        visible={newSessionVisible}
        onClose={() => {
          setNewSessionVisible(false)
          setEditingServer(null)
          setCopyData(null)
          setDefaultGroupId(undefined)
        }}
        editData={editingServer}
        initialData={copyData}
        defaultGroupId={defaultGroupId}
        onOk={(values) => {
          if (editingServer) {
            updateServer(editingServer.id, values)
            message.success('会话已更新')
          } else {
            addServer(values)
            message.success('会话创建成功')
          }
          setNewSessionVisible(false)
          setEditingServer(null)
          setCopyData(null)
          setDefaultGroupId(undefined)
        }}
      />

      <Modal
        title="重命名分组"
        open={renameVisible}
        onOk={handleRenameOk}
        onCancel={() => { setRenameVisible(false); setRenameGroupId(undefined) }}
        okText="确定"
        cancelText="取消"
        width={400}
        centered
        destroyOnHidden
        className="group-modal"
      >
        <div className="group-modal-body">
          <Input
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onPressEnter={handleRenameOk}
            placeholder="输入新的分组名称"
            autoFocus
            size="large"
          />
        </div>
      </Modal>

      <Modal
        title={newGroupTitle}
        open={newGroupVisible}
        onOk={handleNewGroup}
        onCancel={() => { setNewGroupVisible(false); setNewGroupParentId(undefined) }}
        okText="确定"
        cancelText="取消"
        width={400}
        centered
        destroyOnHidden
        className="group-modal"
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
    </>
  )
}

export default ServerTree
export type { ServerTreeProps }
