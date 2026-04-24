import { useState, useEffect, useRef, useCallback } from 'react'
import { Spin, App, Button, Dropdown, Space, Tag } from 'antd'
import {
  SaveOutlined,
  ReloadOutlined,
  FileTextOutlined,
  CloudUploadOutlined,
} from '@ant-design/icons'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, Compartment } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { search } from '@codemirror/search'
import { getLanguageExtension, getLanguageName } from './languages'
import { useThemeStore } from '../../stores/themeStore'
import type { MenuProps } from 'antd'
import './index.css'

interface EditorPanelProps {
  connectionId: string
  remotePath: string
  fileName: string
  serverName: string
  onDirty?: (dirty: boolean) => void
}

const ENCODINGS = [
  { key: 'utf-8', label: 'UTF-8' },
  { key: 'utf-8-bom', label: 'UTF-8 with BOM' },
  { key: 'utf-16le', label: 'UTF-16 LE' },
  { key: 'utf-16be', label: 'UTF-16 BE' },
  { key: 'latin1', label: 'Latin-1 (ISO 8859-1)' },
]

const EditorPanel: React.FC<EditorPanelProps> = ({
  connectionId,
  remotePath,
  fileName,
  serverName,
  onDirty,
}) => {
  const { message } = App.useApp()
  const actualTheme = useThemeStore(s => s.actualTheme)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [encoding, setEncoding] = useState('utf-8')
  const [fileSize, setFileSize] = useState(0)

  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const themeComp = useRef(new Compartment())
  const langComp = useRef(new Compartment())
  const originalContentRef = useRef('')
  const encodingRef = useRef('utf-8')
  const connectionIdRef = useRef(connectionId)
  const remotePathRef = useRef(remotePath)

  connectionIdRef.current = connectionId
  remotePathRef.current = remotePath

  // 保存文件
  const handleSave = useCallback(async () => {
    const view = viewRef.current
    if (!view) return

    setSaving(true)
    try {
      const content = view.state.doc.toString()
      const result = await window.electronAPI.sftpWriteFile(
        connectionIdRef.current,
        remotePathRef.current,
        content,
        encodingRef.current
      )
      if (result.success) {
        originalContentRef.current = content
        setDirty(false)
        onDirty?.(false)
        message.success('保存成功')
      } else {
        message.error(result.error || '保存失败')
      }
    } catch {
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }, [message, onDirty])

  // 初始化编辑器 & 加载文件
  useEffect(() => {
    if (!editorRef.current) return

    let destroyed = false
    const container = editorRef.current

    const loadFile = async () => {
      setLoading(true)
      setError(null)

      try {
        const result = await window.electronAPI.sftpReadFile(connectionId, remotePath)
        if (destroyed) return

        if (!result.success) {
          setError(result.error || '读取文件失败')
          setLoading(false)
          return
        }

        const content = result.content || ''
        const detectedEncoding = result.encoding || 'utf-8'
        setEncoding(detectedEncoding)
        encodingRef.current = detectedEncoding
        setFileSize(result.size || 0)
        originalContentRef.current = content

        // 构建编辑器扩展
        const langExt = await getLanguageExtension(fileName)
        const isDark = actualTheme === 'dark'

        const saveKeymap = keymap.of([{
          key: 'Mod-s',
          run: () => {
            handleSave()
            return true
          },
        }])

        const updateListener = EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const currentContent = update.state.doc.toString()
            const isDirty = currentContent !== originalContentRef.current
            setDirty(isDirty)
            onDirty?.(isDirty)
          }
        })

        const state = EditorState.create({
          doc: content,
          extensions: [
            basicSetup,
            search(),
            saveKeymap,
            updateListener,
            themeComp.current.of(isDark ? oneDark : syntaxHighlighting(defaultHighlightStyle)),
            langComp.current.of(langExt),
            EditorView.lineWrapping,
          ],
        })

        // 清理旧编辑器
        if (viewRef.current) {
          viewRef.current.destroy()
        }

        const view = new EditorView({
          state,
          parent: container,
        })
        viewRef.current = view
        setLoading(false)
      } catch {
        if (!destroyed) {
          setError('加载文件失败')
          setLoading(false)
        }
      }
    }

    loadFile()

    return () => {
      destroyed = true
      if (viewRef.current) {
        viewRef.current.destroy()
        viewRef.current = null
      }
    }
  }, [connectionId, remotePath])

  // 主题切换
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const isDark = actualTheme === 'dark'
    view.dispatch({
      effects: themeComp.current.reconfigure(isDark ? oneDark : syntaxHighlighting(defaultHighlightStyle)),
    })
  }, [actualTheme])

  // 重新加载文件
  const handleReload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.sftpReadFile(
        connectionIdRef.current,
        remotePathRef.current
      )
      if (!result.success) {
        setError(result.error || '重新加载失败')
        setLoading(false)
        return
      }

      const content = result.content || ''
      const detectedEncoding = result.encoding || 'utf-8'
      setEncoding(detectedEncoding)
      encodingRef.current = detectedEncoding
      setFileSize(result.size || 0)
      originalContentRef.current = content

      const view = viewRef.current
      if (view) {
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: content,
          },
        })
      }

      setDirty(false)
      onDirty?.(false)
      setLoading(false)
      message.success('已重新加载')
    } catch {
      setError('重新加载失败')
      setLoading(false)
    }
  }, [message, onDirty])

  // 切换编码重新加载
  const handleEncodingChange = useCallback((newEncoding: string) => {
    setEncoding(newEncoding)
    encodingRef.current = newEncoding
    // 编码切换仅影响保存时使用的编码，不重新加载
    // 如果用户需要以其他编码重新解码文件内容，需要从服务器重新读取
    message.info(`编码已切换为 ${ENCODINGS.find(e => e.key === newEncoding)?.label || newEncoding}，保存时将使用此编码`)
  }, [message])

  const encodingMenuItems: MenuProps['items'] = ENCODINGS.map(e => ({
    key: e.key,
    label: (
      <Space>
        <span>{e.label}</span>
        {encoding === e.key && <span style={{ color: 'var(--primary-color)' }}>✓</span>}
      </Space>
    ),
    onClick: () => handleEncodingChange(e.key),
  }))

  const langName = getLanguageName(fileName)

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  if (error) {
    return (
      <div className="editor-panel">
        <div className="editor-error">
          <FileTextOutlined style={{ fontSize: 48, color: 'var(--text-tertiary)' }} />
          <p>{error}</p>
          <Button onClick={handleReload}>重试</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="editor-panel">
      {/* 工具栏 */}
      <div className="editor-toolbar">
        <div className="editor-toolbar-left">
          <span className="editor-file-path" title={remotePath}>
            <FileTextOutlined /> {serverName}: {remotePath}
          </span>
        </div>
        <div className="editor-toolbar-right">
          {dirty && <Tag color="orange">未保存</Tag>}
          <Tag>{langName}</Tag>
          <Tag>{formatSize(fileSize)}</Tag>
          <Dropdown menu={{ items: encodingMenuItems }} trigger={['click']}>
            <Tag className="editor-encoding-tag">
              {ENCODINGS.find(e => e.key === encoding)?.label || encoding}
            </Tag>
          </Dropdown>
          <Button
            type="text"
            icon={<ReloadOutlined />}
            size="small"
            onClick={handleReload}
            title="重新加载"
          />
          <Button
            type="primary"
            icon={saving ? <CloudUploadOutlined /> : <SaveOutlined />}
            size="small"
            onClick={handleSave}
            loading={saving}
            disabled={!dirty}
          >
            保存
          </Button>
        </div>
      </div>

      {/* 编辑器区域 */}
      <div className="editor-container" style={{ position: 'relative' }}>
        {loading && (
          <div className="editor-loading">
            <Spin tip="加载中..." />
          </div>
        )}
        <div
          ref={editorRef}
          className="editor-codemirror"
          style={{ opacity: loading ? 0 : 1 }}
        />
      </div>
    </div>
  )
}

export default EditorPanel
