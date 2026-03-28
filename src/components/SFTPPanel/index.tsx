import { useState, useEffect, useCallback, useRef } from 'react'
import { Input, Table, Button, App, Empty, Dropdown, Modal } from 'antd'
import type { TableColumnsType, MenuProps } from 'antd'
import {
  FolderOutlined,
  FileOutlined,
  UploadOutlined,
  DownloadOutlined,
  ReloadOutlined,
  FolderAddOutlined,
  DeleteOutlined,
  HomeOutlined,
  DragOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  EditOutlined,
  FileAddOutlined,
  LockOutlined,
  CopyOutlined,
  ArrowLeftOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { useConnectionStore, initSFTP, listFiles } from '../../stores/connectionStore'
import { useTransferStore } from '../../stores/transferStore'
import type { FileInfo } from '../../types'
import { Resizable } from 'react-resizable'
import './index.css'
import { isBinaryFile } from '../EditorPanel/languages'
import Tooltip from '../DelayedTooltip'

interface SFTPPanelProps {
  connectionId?: string
  initialPath?: string
  navSeq?: number
  onOpenFile?: (remotePath: string, fileName: string) => void
}

// 可拖拽调整宽度的表头单元格
const ResizableTitle = (props: Record<string, unknown> & { onResize?: unknown; width?: number }) => {
  const { onResize, width, ...restProps } = props
  if (!width) return <th {...restProps as React.ThHTMLAttributes<HTMLTableCellElement>} />
  return (
    <Resizable
      width={width}
      height={0}
      handle={<span className="column-resize-handle" onClick={e => e.stopPropagation()} />}
      onResize={onResize as Resizable['props']['onResize']}
      draggableOpts={{ enableUserSelectHack: false }}
    >
      <th {...restProps as React.ThHTMLAttributes<HTMLTableCellElement>} />
    </Resizable>
  )
}

const SFTPPanel: React.FC<SFTPPanelProps> = ({ connectionId, initialPath, navSeq, onOpenFile }) => {
  const { getConnection } = useConnectionStore()
  const { message, modal } = App.useApp()
  const dropRef = useRef<HTMLDivElement>(null)

  // 获取连接信息
  const connection = connectionId ? getConnection(connectionId) : undefined
  const isConnected = connection?.status === 'connected'

  // 远程文件状态
  const [remotePath, setRemotePath] = useState('/')
  const [remoteFiles, setRemoteFiles] = useState<FileInfo[]>([])
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [sftpReady, setSftpReady] = useState(false)

  // 防止重复初始化
  const sftpInitializedRef = useRef(false)

  // 显示隐藏文件
  const [showHidden, setShowHidden] = useState(false)

  // 选择状态
  const [selectedRemoteKeys, setSelectedRemoteKeys] = useState<React.Key[]>([])

  // 右键菜单状态
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [contextMenuFile, setContextMenuFile] = useState<FileInfo | null>(null)

  // 重命名弹窗
  const [renameVisible, setRenameVisible] = useState(false)
  const [renameFile, setRenameFile] = useState<FileInfo | null>(null)
  const [newFileName, setNewFileName] = useState('')

  // 修改权限弹窗
  const [chmodVisible, setChmodVisible] = useState(false)
  const [chmodFile, setChmodFile] = useState<FileInfo | null>(null)
  const [chmodValue, setChmodValue] = useState('755')

  // 新建文件弹窗
  const [newFileDialogVisible, setNewFileDialogVisible] = useState(false)
  const [newFileName_, setNewFileName_] = useState('')

  // 新建文件夹弹窗
  const [newFolderDialogVisible, setNewFolderDialogVisible] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  // 传输 store
  const addTransferTasks = useTransferStore(s => s.addTasks)
  const transferTasks = useTransferStore(s => s.tasks)

  // 组件卸载时标记
  const unmountedRef = useRef(false)

  // 组件卸载时标记
  useEffect(() => {
    unmountedRef.current = false
    return () => { unmountedRef.current = true }
  }, [])

  // 拖拽状态
  const [isDragging, setIsDragging] = useState(false)

  // 快速跳转：键入字母跳转到匹配的文件/目录（仅高亮，不影响选中状态）
  const [quickSearch, setQuickSearch] = useState('')
  const [quickSearchMatch, setQuickSearchMatch] = useState<string | null>(null)
  const quickSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 列宽状态（可拖拽调整）
  const [columnWidths, setColumnWidths] = useState({
    name: 180,
    type: 55,
    size: 75,
    modifiedTime: 175,
    permissions: 90,
    ownerGroup: 80,
  })

  // 过滤后的文件列表
  const filteredFiles = showHidden
    ? remoteFiles
    : remoteFiles.filter(f => !f.name.startsWith('.') || f.name === '..')

  // 加载远程文件列表
  const loadRemoteFiles = useCallback(async (path: string) => {
    if (!connectionId) return

    setRemoteLoading(true)
    setQuickSearch('')
    setQuickSearchMatch(null)
    setSelectedRemoteKeys([])
    const result = await listFiles(connectionId, path)
    setRemoteLoading(false)

    if (result.success && result.files) {
      const files: FileInfo[] = [
        { name: '..', type: 'folder', size: 0, modifiedTime: '', permissions: '', owner: '', group: '' },
        ...result.files.filter(f => f.name !== '.' && f.name !== '..'),
      ]
      setRemoteFiles(files)
    } else {
      message.error(`获取文件列表失败: ${result.error}`)
    }
  }, [connectionId])

  // 初始化 SFTP
  useEffect(() => {
    if (!connectionId || !isConnected || sftpInitializedRef.current) return

    sftpInitializedRef.current = true
    setRemoteLoading(true)

    initSFTP(connectionId).then((result) => {
      if (result.success) {
        setSftpReady(true)
        // 如果提供了初始路径，直接使用；否则获取当前工作目录
        const pathToUse = initialPath || ''
        if (pathToUse) {
          setRemotePath(pathToUse)
          listFiles(connectionId, pathToUse).then((listResult) => {
            setRemoteLoading(false)
            if (listResult.success && listResult.files) {
              const files: FileInfo[] = [
                { name: '..', type: 'folder', size: 0, modifiedTime: '', permissions: '', owner: '', group: '' },
                ...listResult.files.filter(f => f.name !== '.' && f.name !== '..'),
              ]
              setRemoteFiles(files)
            }
          })
        } else {
          window.electronAPI.sftpGetcwd(connectionId).then((cwdResult) => {
            if (cwdResult.success && cwdResult.path) {
              setRemotePath(cwdResult.path)
              listFiles(connectionId, cwdResult.path).then((listResult) => {
                setRemoteLoading(false)
                if (listResult.success && listResult.files) {
                  const files: FileInfo[] = [
                    { name: '..', type: 'folder', size: 0, modifiedTime: '', permissions: '', owner: '', group: '' },
                    ...listResult.files.filter(f => f.name !== '.' && f.name !== '..'),
                  ]
                  setRemoteFiles(files)
                }
              })
            } else {
              setRemoteLoading(false)
            }
          })
        }
      } else {
        message.error(`SFTP 初始化失败: ${result.error}`)
        setRemoteLoading(false)
        sftpInitializedRef.current = false
      }
    })

    return () => {
      sftpInitializedRef.current = false
    }
  }, [connectionId, isConnected])

  // 当外部触发导航（navSeq 变化）时，定位到 initialPath
  const prevNavSeqRef = useRef(navSeq)
  useEffect(() => {
    if (
      navSeq !== undefined &&
      navSeq !== prevNavSeqRef.current &&
      initialPath &&
      sftpReady &&
      connectionId
    ) {
      setRemotePath(initialPath)
      loadRemoteFiles(initialPath)
    }
    prevNavSeqRef.current = navSeq
  }, [navSeq, initialPath, sftpReady, connectionId, loadRemoteFiles])

  // 上传完成后自动刷新目录 — 订阅全局 store
  const completedUploadCountRef = useRef(0)
  useEffect(() => {
    if (!connectionId || !sftpReady) return
    const completedUploads = transferTasks.filter(
      t => t.connectionId === connectionId && t.type === 'upload' && t.status === 'completed'
    ).length
    if (completedUploads > completedUploadCountRef.current) {
      loadRemoteFiles(remotePath)
    }
    completedUploadCountRef.current = completedUploads
  }, [transferTasks, connectionId, sftpReady, remotePath, loadRemoteFiles])

  // 刷新远程目录
  const refreshRemote = () => {
    if (sftpReady) {
      loadRemoteFiles(remotePath)
    }
  }

  // 进入远程目录
  const enterRemoteDirectory = useCallback((name: string) => {
    if (!sftpReady) return

    if (name === '..') {
      const parts = remotePath.split('/').filter(Boolean)
      parts.pop()
      const newPath = '/' + parts.join('/')
      setRemotePath(newPath || '/')
      loadRemoteFiles(newPath || '/')
    } else {
      // 使用安全的路径拼接，防止路径注入
      const newPath = joinRemotePath(remotePath, name)
      if (newPath === remotePath) return // name 被过滤为空，不导航
      setRemotePath(newPath)
      loadRemoteFiles(newPath)
    }
  }, [sftpReady, remotePath, loadRemoteFiles])

  // 路径输入处理
  const handleRemotePathKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && sftpReady) {
      loadRemoteFiles(remotePath)
    }
  }

  // 拼接远程路径（防御路径注入）
  const joinRemotePath = (base: string, name: string): string => {
    const safeName = name.replace(/[/\\\0]/g, '')
    if (!safeName || safeName === '.' || safeName === '..') return base
    return base === '/' ? `/${safeName}` : `${base}/${safeName}`
  }

  // 添加上传任务到队列（支持批量，检测文件名冲突）
  const addUploadTasks = (filePaths: string[]) => {
    const tasks = filePaths.map(filePath => {
      const fileName = filePath.split(/[/\\]/).pop() || 'file'
      const remoteFilePath = joinRemotePath(remotePath, fileName)
      return { filePath, fileName, remotePath: remoteFilePath }
    })

    const conflicts = tasks
      .filter(t => remoteFiles.some(f => f.name === t.fileName && f.type === 'file'))
      .map(t => t.fileName)

    const doAdd = () => {
      const result = addTransferTasks(tasks.map(t => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        connectionId: connectionId!,
        serverName: connection?.serverName || '',
        type: 'upload' as const,
        fileName: t.fileName,
        localPath: t.filePath,
        remotePath: t.remotePath,
      })))
      if (result.skipped > 0) {
        message.warning(`已跳过 ${result.skipped} 个同名传输任务，目标已在传输队列中`)
      }
    }

    if (conflicts.length > 0) {
      const displayNames = conflicts.length <= 5
        ? conflicts.join('、')
        : conflicts.slice(0, 5).join('、') + ` 等 ${conflicts.length} 个文件`
      modal.confirm({
        title: '文件已存在',
        content: `以下文件将被覆盖：${displayNames}`,
        okText: '覆盖上传',
        cancelText: '取消',
        centered: true,
        onOk: doAdd,
      })
    } else {
      doAdd()
    }
  }

  // 选择文件上传
  const handleSelectUpload = async () => {
    if (!connectionId || !sftpReady) {
      message.warning('SFTP 连接未就绪')
      return
    }

    const result = await window.electronAPI.dialogOpenFile()
    if (result.canceled || result.filePaths.length === 0) return

    addUploadTasks(result.filePaths)
  }

  // 下载选中的文件
  const handleDownload = async () => {
    if (!connectionId || !sftpReady) {
      message.warning('SFTP 连接未就绪')
      return
    }

    const selectedFiles = remoteFiles.filter(
      f => selectedRemoteKeys.includes(f.name) && f.type === 'file' && f.name !== '..'
    )
    if (selectedFiles.length === 0) {
      message.warning('请先选择要下载的文件')
      return
    }

    if (selectedFiles.length === 1) {
      await handleDownloadSingle(selectedFiles[0].name)
    } else {
      const result = await window.electronAPI.dialogOpenDirectory()
      if (result.canceled || result.filePaths.length === 0) return

      const destDir = result.filePaths[0]
      const queueResult = addTransferTasks(selectedFiles.map(file => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`,
        connectionId: connectionId!,
        serverName: connection?.serverName || '',
        type: 'download' as const,
        fileName: file.name,
        localPath: `${destDir}/${file.name}`,
        remotePath: joinRemotePath(remotePath, file.name),
      })))
      if (queueResult.skipped > 0) {
        message.warning(`已跳过 ${queueResult.skipped} 个重复下载任务，目标已在传输队列中`)
      }
    }
  }

  // 下载单个文件
  const handleDownloadSingle = async (fileName: string) => {
    if (!connectionId || !sftpReady) return

    const file = remoteFiles.find(f => f.name === fileName)
    if (!file || file.type !== 'file') return

    const result = await window.electronAPI.dialogSaveFile(file.name)
    if (result.canceled || !result.filePath) return

    const queueResult = addTransferTasks([{
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      connectionId: connectionId!,
      serverName: connection?.serverName || '',
      type: 'download' as const,
      fileName: file.name,
      localPath: result.filePath!,
      remotePath: joinRemotePath(remotePath, file.name),
    }])
    if (queueResult.skipped > 0) {
      message.warning('该文件已在传输队列中')
    }
  }

  // 创建文件夹
  const handleCreateFolder = async () => {
    if (!connectionId || !sftpReady) return
    setNewFolderDialogVisible(true)
    setNewFolderName('')
  }

  const handleCreateFolderConfirm = async () => {
    if (!connectionId || !sftpReady) return

    const trimmed = newFolderName.trim()
    if (!trimmed) {
      message.error('请输入文件夹名称')
      return
    }
    if (trimmed.includes('/') || trimmed.includes('\\')) {
      message.error('文件夹名称不能包含路径分隔符')
      return
    }

    const folderPath = joinRemotePath(remotePath, trimmed)
    const result = await window.electronAPI.sftpMkdir(connectionId, folderPath)

    if (result.success) {
      message.success('创建成功')
      setNewFolderDialogVisible(false)
      refreshRemote()
    } else {
      message.error(`创建失败: ${result.error}`)
    }
  }

  // 创建空文件
  const handleCreateFile = async () => {
    setNewFileDialogVisible(true)
    setNewFileName_('')
  }

  const handleCreateFileConfirm = async () => {
    if (!connectionId || !sftpReady) return

    const trimmed = newFileName_.trim()
    if (!trimmed) {
      message.error('请输入文件名称')
      return
    }
    if (trimmed.includes('/') || trimmed.includes('\\')) {
      message.error('文件名称不能包含路径分隔符')
      return
    }

    const filePath = joinRemotePath(remotePath, trimmed)
    const result = await window.electronAPI.sftpTouch(connectionId, filePath)

    if (result.success) {
      message.success('创建成功')
      setNewFileDialogVisible(false)
      refreshRemote()
    } else {
      message.error(`创建失败: ${result.error}`)
    }
  }

  // 删除文件/文件夹
  const handleDelete = async (file?: FileInfo) => {
    if (!connectionId || !sftpReady) return

    const filesToDelete = file
      ? (file.name === '..' || file.name === '.' ? [] : [file])
      : remoteFiles.filter(f => selectedRemoteKeys.includes(f.name) && f.name !== '..' && f.name !== '.')

    if (filesToDelete.length === 0) {
      message.info('没有选中要删除的项目')
      return
    }

    // 构建详细的确认内容，列出所有要删除的文件名
    const nameList = filesToDelete.map(f => f.name)
    const displayNames = nameList.length <= 5
      ? nameList.join('、')
      : nameList.slice(0, 5).join('、') + ` 等 ${nameList.length} 个项目`

    modal.confirm({
      title: '确认删除',
      content: (
        <div>
          <p>确定要删除以下{filesToDelete.length > 1 ? ` ${filesToDelete.length} 个` : ''}项目吗？</p>
          <p style={{ fontWeight: 500, wordBreak: 'break-all' }}>{displayNames}</p>
          <p style={{ color: 'var(--error-color)', fontSize: 12 }}>此操作不可恢复</p>
        </div>
      ),
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        let successCount = 0
        let failCount = 0

        for (const f of filesToDelete) {
          const remoteFilePath = joinRemotePath(remotePath, f.name)
          const result = await window.electronAPI.sftpDelete(
            connectionId,
            remoteFilePath,
            f.type === 'folder'
          )
          if (result.success) {
            successCount++
          } else {
            failCount++
          }
        }

        if (failCount === 0) {
          message.success(`成功删除 ${successCount} 个项目`)
        } else {
          message.warning(`删除完成: ${successCount} 成功, ${failCount} 失败`)
        }

        refreshRemote()
        setSelectedRemoteKeys([])
      },
    })
  }

  // 重命名文件
  const handleRename = (file: FileInfo) => {
    setRenameFile(file)
    setNewFileName(file.name)
    setRenameVisible(true)
  }

  const doRename = async (trimmed: string) => {
    if (!connectionId || !sftpReady || !renameFile) return

    const oldPath = joinRemotePath(remotePath, renameFile.name)
    const newPath = joinRemotePath(remotePath, trimmed)
    const result = await window.electronAPI.sftpRename(connectionId, oldPath, newPath)

    if (result.success) {
      message.success('重命名成功')
      setRenameVisible(false)
      refreshRemote()
    } else {
      message.error(`重命名失败: ${result.error}`)
    }
  }

  const handleRenameConfirm = async () => {
    if (!connectionId || !sftpReady || !renameFile) return

    const trimmed = newFileName.trim()
    if (!trimmed) {
      message.error('请输入文件名称')
      return
    }
    if (trimmed.includes('/') || trimmed.includes('\\')) {
      message.error('文件名称不能包含路径分隔符')
      return
    }
    if (trimmed === renameFile.name) {
      setRenameVisible(false)
      return
    }

    const conflict = remoteFiles.find(f => f.name === trimmed && f.name !== renameFile.name)
    if (conflict) {
      modal.confirm({
        title: '目标已存在',
        content: `"${trimmed}" 已存在，是否覆盖？`,
        okText: '覆盖',
        cancelText: '取消',
        centered: true,
        onOk: () => doRename(trimmed),
      })
      return
    }

    doRename(trimmed)
  }

  // 修改权限
  const handleChmod = (file: FileInfo) => {
    setChmodFile(file)
    // 解析当前权限
    const perm = file.permissions || ''
    const mode = perm.length >= 10 ? perm.slice(-9) : perm
    // 转换为八进制
    const octal = permissionsToOctal(mode)
    setChmodValue(octal)
    setChmodVisible(true)
  }

  const permissionsToOctal = (perm: string): string => {
    const parseTriplet = (tri: string): number => {
      let val = 0
      if (tri[0] === 'r') val += 4
      if (tri[1] === 'w') val += 2
      if (tri[2] === 'x' || tri[2] === 's' || tri[2] === 't') val += 1
      return val
    }
    
    if (perm.length < 9) return '644'
    const user = parseTriplet(perm.slice(0, 3))
    const group = parseTriplet(perm.slice(3, 6))
    const other = parseTriplet(perm.slice(6, 9))
    return `${user}${group}${other}`
  }

  const handleChmodConfirm = async () => {
    if (!connectionId || !sftpReady || !chmodFile) return

    const trimmedChmod = chmodValue.trim()
    if (!/^[0-7]{3,4}$/.test(trimmedChmod)) {
      message.error('请输入有效的权限值（如 644、755）')
      return
    }

    const filePath = joinRemotePath(remotePath, chmodFile.name)
    const result = await window.electronAPI.sftpChmod(connectionId, filePath, trimmedChmod)

    if (result.success) {
      message.success('权限修改成功')
      setChmodVisible(false)
      refreshRemote()
    } else {
      message.error(`权限修改失败: ${result.error}`)
    }
  }

  // 右键菜单
  const handleContextMenu = (e: React.MouseEvent, record: FileInfo) => {
    e.preventDefault()
    e.stopPropagation()
    if (record.name === '..') return
    setContextMenuFile(record)
    setContextMenuPos({ x: e.clientX, y: e.clientY })
  }

  // 点击其他地方关闭右键菜单
  useEffect(() => {
    if (!contextMenuPos) return
    const handleClick = () => {
      setContextMenuPos(null)
      setContextMenuFile(null)
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [contextMenuPos])

  // 构建右键菜单项
  const getContextMenuItems = (): MenuProps['items'] => {
    if (!contextMenuFile) {
      return [
        {
          key: 'refresh',
          label: '刷新',
          icon: <ReloadOutlined />,
          onClick: () => {
            refreshRemote()
            setContextMenuPos(null)
          },
        },
        {
          key: 'copyPath',
          label: '复制当前路径',
          icon: <CopyOutlined />,
          onClick: () => {
            navigator.clipboard.writeText(remotePath)
            message.success('路径已复制')
            setContextMenuPos(null)
          },
        },
        { type: 'divider' },
        {
          key: 'upload',
          label: '上传文件',
          icon: <UploadOutlined />,
          onClick: () => {
            handleSelectUpload()
            setContextMenuPos(null)
          },
        },
        { type: 'divider' },
        {
          key: 'newFolder',
          label: '新建文件夹',
          icon: <FolderAddOutlined />,
          onClick: () => {
            handleCreateFolder()
            setContextMenuPos(null)
          },
        },
        {
          key: 'newFile',
          label: '新建文件',
          icon: <FileAddOutlined />,
          onClick: () => {
            handleCreateFile()
            setContextMenuPos(null)
          },
        },
      ]
    }

    const items: MenuProps['items'] = [
      {
        key: 'refresh',
        label: '刷新',
        icon: <ReloadOutlined />,
        onClick: () => {
          refreshRemote()
          setContextMenuPos(null)
        },
      },
      { type: 'divider' },
    ]

    if (contextMenuFile.type === 'folder') {
      items.push({
        key: 'enter',
        label: '进入目录',
        icon: <FolderOutlined />,
        onClick: () => {
          enterRemoteDirectory(contextMenuFile.name)
          setContextMenuPos(null)
        },
      })
    }

    if (contextMenuFile.type === 'file') {
      // 判断是否有多个文件被选中且右键文件在选中范围内
      const selectedFileItems = remoteFiles.filter(
        f => selectedRemoteKeys.includes(f.name) && f.type === 'file' && f.name !== '..'
      )
      const isInSelection = selectedRemoteKeys.includes(contextMenuFile.name)
      const multiSelected = isInSelection && selectedFileItems.length > 1

      items.push({
        key: 'download',
        label: multiSelected ? `下载选中 (${selectedFileItems.length})` : '下载',
        icon: <DownloadOutlined />,
        onClick: () => {
          if (multiSelected) {
            handleDownload()
          } else {
            handleDownloadSingle(contextMenuFile.name)
          }
          setContextMenuPos(null)
        },
      })

      // 文本文件可编辑
      if (onOpenFile && !isBinaryFile(contextMenuFile.name)) {
        items.push({
          key: 'edit',
          label: '编辑',
          icon: <EditOutlined />,
          onClick: () => {
            onOpenFile(joinRemotePath(remotePath, contextMenuFile.name), contextMenuFile.name)
            setContextMenuPos(null)
          },
        })
      }
    }

    const selectedDeletableItems = remoteFiles.filter(
      f => selectedRemoteKeys.includes(f.name) && f.name !== '..' && f.name !== '.'
    )
    const isDeleteTargetInSelection = selectedRemoteKeys.includes(contextMenuFile.name)
    const multiSelectedForDelete = isDeleteTargetInSelection && selectedDeletableItems.length > 1

    // 复制路径
    const copyPath = (file: FileInfo) => {
      const fullPath = joinRemotePath(remotePath, file.name)
      navigator.clipboard.writeText(fullPath)
      message.success('路径已复制')
    }

    items.push(
      {
        key: 'copyPath',
        label: '复制路径',
        icon: <CopyOutlined />,
        onClick: () => {
          copyPath(contextMenuFile)
          setContextMenuPos(null)
        },
      },
      {
        key: 'rename',
        label: '重命名',
        icon: <EditOutlined />,
        onClick: () => {
          handleRename(contextMenuFile)
          setContextMenuPos(null)
        },
      },
      {
        key: 'chmod',
        label: '修改权限',
        icon: <LockOutlined />,
        onClick: () => {
          handleChmod(contextMenuFile)
          setContextMenuPos(null)
        },
      },
      { type: 'divider' },
      {
        key: 'upload',
        label: '上传文件',
        icon: <UploadOutlined />,
        onClick: () => {
          handleSelectUpload()
          setContextMenuPos(null)
        },
      },
      { type: 'divider' },
      {
        key: 'delete',
        label: multiSelectedForDelete ? `删除选中 (${selectedDeletableItems.length})` : '删除',
        icon: <DeleteOutlined />,
        danger: true,
        onClick: () => {
          if (multiSelectedForDelete) {
            handleDelete()
          } else {
            handleDelete(contextMenuFile)
          }
          setContextMenuPos(null)
        },
      }
    )

    return items
  }

  // 空白处右键菜单
  const handleEmptyContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenuFile(null)
    setContextMenuPos({ x: e.clientX, y: e.clientY })
  }

  // 键盘快速跳转
  const enterRemoteDirRef = useRef(enterRemoteDirectory)
  enterRemoteDirRef.current = enterRemoteDirectory

  useEffect(() => {
    const container = dropRef.current
    if (!container) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // 忽略修饰键组合、功能键、特殊按键
      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (e.key.length !== 1 && e.key !== 'Backspace' && e.key !== 'Escape' && e.key !== 'Enter') return

      // 如果焦点在 input 等可编辑元素上，不拦截
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.key === 'Escape') {
        setQuickSearch('')
        setQuickSearchMatch(null)
        return
      }

      if (e.key === 'Backspace') {
        setQuickSearch(prev => prev.slice(0, -1))
        return
      }

      // 回车：如果有匹配项，进入目录或下载文件
      if (e.key === 'Enter') {
        setQuickSearchMatch(current => {
          if (current) {
            const matched = filteredFiles.find(f => f.name === current)
            if (matched?.type === 'folder') {
              enterRemoteDirRef.current(matched.name)
            }
          }
          return null
        })
        setQuickSearch('')
        return
      }

      e.preventDefault()
      const newSearch = quickSearch + e.key.toLowerCase()
      setQuickSearch(newSearch)

      // 重置清除定时器
      if (quickSearchTimerRef.current) clearTimeout(quickSearchTimerRef.current)
      quickSearchTimerRef.current = setTimeout(() => {
        setQuickSearch('')
        setQuickSearchMatch(null)
      }, 1500)

      // 查找匹配的文件（仅高亮和滚动，不修改选中状态）
      const match = filteredFiles.find(
        f => f.name !== '..' && f.name.toLowerCase().startsWith(newSearch)
      )
      if (match) {
        setQuickSearchMatch(match.name)
        const row = container.querySelector(`tr[data-row-key="${CSS.escape(match.name)}"]`)
        if (row) {
          row.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        }
      } else {
        setQuickSearchMatch(null)
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  }, [quickSearch, filteredFiles])

  // 拖拽事件处理
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (!connectionId || !sftpReady) {
      message.warning('SFTP 连接未就绪')
      return
    }

    const files = e.dataTransfer.files
    if (files.length === 0) return

    const filePaths: string[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const filePath = (file as File & { path?: string }).path
      if (!filePath) {
        message.warning(`无法获取文件 "${file.name}" 的路径`)
        continue
      }
      filePaths.push(filePath)
    }
    if (filePaths.length > 0) {
      addUploadTasks(filePaths)
    }
  }

  // 格式化文件大小
  const formatSize = (size: number): string => {
    if (size === 0) return ''
    if (size < 1024) return `${size}B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`
    if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`
    return `${(size / 1024 / 1024 / 1024).toFixed(1)}GB`
  }

  // 格式化时间
  const formatTime = (time: string): string => {
    if (!time) return ''
    const date = new Date(time)
    if (isNaN(date.getTime())) return ''
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  // 列拖拽调整宽度
  const handleColumnResize = (key: string) => (_e: React.SyntheticEvent, { size }: { size: { width: number } }) => {
    setColumnWidths(prev => ({ ...prev, [key]: Math.max(size.width, 40) }))
  }

  const baseColumns: TableColumnsType<FileInfo> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: columnWidths.name,
      ellipsis: true,
      sorter: (a, b) => {
        if (a.name === '..') return -1
        if (b.name === '..') return 1
        return a.name.localeCompare(b.name)
      },
      render: (text, record) => (
        <span className="file-name-cell">
          {record.type === 'folder' ? (
            <FolderOutlined className="file-icon folder" />
          ) : record.type === 'link' ? (
            <FileOutlined className="file-icon link" />
          ) : (
            <FileOutlined className="file-icon file" />
          )}
          <span className={record.name === '..' ? 'parent-dir' : ''}>
            {text}
          </span>
        </span>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: columnWidths.type,
      render: (type: string) => {
        switch (type) {
          case 'folder': return '目录'
          case 'link': return '链接'
          default: return '文件'
        }
      },
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: columnWidths.size,
      sorter: (a, b) => {
        if (a.name === '..') return -1
        if (b.name === '..') return 1
        return a.size - b.size
      },
      render: (size: number) => formatSize(size),
    },
    {
      title: '修改时间',
      dataIndex: 'modifiedTime',
      key: 'modifiedTime',
      width: columnWidths.modifiedTime,
      ellipsis: true,
      sorter: (a, b) => {
        if (a.name === '..') return -1
        if (b.name === '..') return 1
        if (!a.modifiedTime) return -1
        if (!b.modifiedTime) return 1
        return new Date(a.modifiedTime).getTime() - new Date(b.modifiedTime).getTime()
      },
      render: (time: string) => formatTime(time),
    },
    {
      title: '权限',
      dataIndex: 'permissions',
      key: 'permissions',
      width: columnWidths.permissions,
      ellipsis: true,
    },
    {
      title: '用户/组',
      key: 'ownerGroup',
      width: columnWidths.ownerGroup,
      ellipsis: true,
      render: (_: unknown, record: FileInfo) => {
        if (!record.owner && !record.group) return ''
        return `${record.owner}:${record.group}`
      },
    },
  ]

  const columns = baseColumns.map(col => ({
    ...col,
    onHeaderCell: (column: TableColumnsType<FileInfo>[number]) => ({
      width: (column as { width?: number }).width,
      onResize: handleColumnResize((column as { key?: string }).key as string),
    }),
  })) as TableColumnsType<FileInfo>

  if (!connectionId || !isConnected) {
    return (
      <div className="sftp-panel">
        <div className="sftp-empty">
          <Empty description="请先连接服务器" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      </div>
    )
  }

  return (
    <div
      ref={dropRef}
      className={`sftp-panel ${isDragging ? 'dragging' : ''}`}
      tabIndex={0}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={handleEmptyContextMenu}
    >
      {/* 工具栏 */}
      <div className="sftp-toolbar">
        <div className="sftp-toolbar-left">
          <Button
            icon={<HomeOutlined />}
            size="small"
            onClick={() => { setRemotePath('/'); if (sftpReady) loadRemoteFiles('/') }}
          />
          <Input
            value={remotePath}
            onChange={(e) => setRemotePath(e.target.value)}
            onKeyDown={handleRemotePathKeyDown}
            placeholder="路径"
            size="small"
            style={{ flex: 1, minWidth: 100 }}
          />
          <Tooltip title="返回上级目录">
            <Button
              icon={<ArrowLeftOutlined />}
              size="small"
              onClick={() => enterRemoteDirectory('..')}
              disabled={remotePath === '/'}
            />
          </Tooltip>
          <Tooltip title="刷新目录">
            <Button
              icon={<ReloadOutlined />}
              size="small"
              onClick={refreshRemote}
              loading={remoteLoading}
            />
          </Tooltip>
        </div>
        <div className="sftp-toolbar-right">
          <Tooltip title={showHidden ? '隐藏隐藏文件' : '显示隐藏文件'}>
            <Button
              size="small"
              icon={showHidden ? <EyeOutlined /> : <EyeInvisibleOutlined />}
              onClick={() => setShowHidden(!showHidden)}
              type={showHidden ? 'primary' : 'default'}
            />
          </Tooltip>
          <Tooltip title="上传文件">
            <Button
              icon={<UploadOutlined />}
              size="small"
              onClick={handleSelectUpload}
            />
          </Tooltip>
          <Tooltip title="下载选中文件">
            <Button
              icon={<DownloadOutlined />}
              size="small"
              onClick={handleDownload}
              disabled={selectedRemoteKeys.length === 0}
            />
          </Tooltip>
          <Tooltip title="新建文件夹">
            <Button
              icon={<FolderAddOutlined />}
              size="small"
              onClick={handleCreateFolder}
            />
          </Tooltip>
          <Tooltip title="新建文件">
            <Button
              icon={<FileAddOutlined />}
              size="small"
              onClick={handleCreateFile}
            />
          </Tooltip>
          <Tooltip title="删除">
            <Button
              icon={<DeleteOutlined />}
              size="small"
              danger
              onClick={() => handleDelete()}
              disabled={selectedRemoteKeys.length === 0}
            />
          </Tooltip>
        </div>
      </div>

      {/* 拖拽提示 */}
      {isDragging && (
        <div className="drag-hint">
          <DragOutlined style={{ fontSize: 32 }} />
          <span>拖放文件到这里上传</span>
        </div>
      )}

      {/* 文件列表 */}
      <div className="sftp-file-list">
        <Table
          columns={columns}
          dataSource={filteredFiles}
          size="small"
          pagination={false}
          rowKey="name"
          components={{ header: { cell: ResizableTitle } }}
          locale={{
            triggerDesc: '点击降序',
            triggerAsc: '点击升序',
            cancelSort: '取消排序',
            emptyText: '暂无文件',
          }}
          rowSelection={{
            selectedRowKeys: selectedRemoteKeys,
            onChange: (keys) => setSelectedRemoteKeys(keys),
            getCheckboxProps: (record) => ({
              disabled: record.name === '..',
            }),
          }}
          onRow={(record) => ({
            className: quickSearchMatch === record.name ? 'quick-search-highlight' : undefined,
            onDoubleClick: () => {
              if (record.type === 'folder') {
                enterRemoteDirectory(record.name)
              } else if (record.type === 'file') {
                if (onOpenFile && !isBinaryFile(record.name)) {
                  onOpenFile(joinRemotePath(remotePath, record.name), record.name)
                } else {
                  handleDownloadSingle(record.name)
                }
              }
            },
            onContextMenu: (e) => handleContextMenu(e, record),
          })}
        />
      </div>

      {/* 快速搜索提示 */}
      {quickSearch && (
        <div className="quick-search-hint">
          <SearchOutlined /> {quickSearch}
        </div>
      )}

      {/* 右键菜单 */}
      {contextMenuPos && (
        <div
          className="sftp-context-menu"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
        >
          <Dropdown
            menu={{ items: getContextMenuItems() }}
            open={true}
            onOpenChange={(open) => { if (!open) { setContextMenuPos(null); setContextMenuFile(null) } }}
          >
            <div />
          </Dropdown>
        </div>
      )}

      {/* 重命名弹窗 */}
      <Modal
        title="重命名"
        open={renameVisible}
        onOk={handleRenameConfirm}
        onCancel={() => setRenameVisible(false)}
        okText="确定"
        cancelText="取消"
        width={400}
        centered
        destroyOnHidden
        className="group-modal"
      >
        <div className="group-modal-body">
          <Input
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onPressEnter={handleRenameConfirm}
            placeholder="请输入新名称"
            autoFocus
            size="large"
          />
        </div>
      </Modal>

      {/* 修改权限弹窗 */}
      <Modal
        title="修改权限"
        open={chmodVisible}
        onOk={handleChmodConfirm}
        onCancel={() => setChmodVisible(false)}
        okText="确定"
        cancelText="取消"
        width={400}
        centered
        destroyOnHidden
        className="group-modal"
      >
        <div className="group-modal-body">
          <div style={{ marginBottom: 12, color: 'var(--text-secondary)', fontSize: 13 }}>
            文件: {chmodFile?.name}
          </div>
          <Input
            value={chmodValue}
            onChange={(e) => setChmodValue(e.target.value)}
            onPressEnter={handleChmodConfirm}
            placeholder="请输入权限值（如 755）"
            addonBefore="权限"
            size="large"
          />
          <div style={{ marginTop: 8, color: 'var(--text-tertiary)', fontSize: 12 }}>
            常用权限: 755 (目录/可执行), 644 (普通文件), 777 (完全权限)
          </div>
        </div>
      </Modal>

      {/* 新建文件弹窗 */}
      <Modal
        title="新建文件"
        open={newFileDialogVisible}
        onOk={handleCreateFileConfirm}
        onCancel={() => setNewFileDialogVisible(false)}
        okText="确定"
        cancelText="取消"
        width={400}
        centered
        destroyOnHidden
        className="group-modal"
      >
        <div className="group-modal-body">
          <Input
            value={newFileName_}
            onChange={(e) => setNewFileName_(e.target.value)}
            onPressEnter={handleCreateFileConfirm}
            placeholder="请输入文件名称"
            autoFocus
            size="large"
          />
        </div>
      </Modal>

      {/* 新建文件夹弹窗 */}
      <Modal
        title="新建文件夹"
        open={newFolderDialogVisible}
        onOk={handleCreateFolderConfirm}
        onCancel={() => setNewFolderDialogVisible(false)}
        okText="确定"
        cancelText="取消"
        width={400}
        centered
        destroyOnHidden
        className="group-modal"
      >
        <div className="group-modal-body">
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onPressEnter={handleCreateFolderConfirm}
            placeholder="请输入文件夹名称"
            autoFocus
            size="large"
          />
        </div>
      </Modal>
    </div>
  )
}

export default SFTPPanel
