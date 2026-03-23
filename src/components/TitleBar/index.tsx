import { useState, useEffect, useRef, useMemo } from 'react'
import { Button, Dropdown, Space, Typography, App, Modal, Input } from 'antd'
import {
  MinusOutlined,
  BorderOutlined,
  CloseOutlined,
  BlockOutlined,
  SettingOutlined,
  SearchOutlined,
  ImportOutlined,
  ExportOutlined,
  InfoCircleOutlined,
  GithubOutlined,
  MailOutlined,
} from '@ant-design/icons'
import { useSettingsModal } from '../SettingsModal'
import { useServerStore } from '../../stores/serverStore'
import { useConnectionStore } from '../../stores/connectionStore'
import type { MenuProps } from 'antd'
import './index.css'

const { Text } = Typography

interface TitleBarProps {
  onConnect?: (serverId: string) => void
}

const TitleBar: React.FC<TitleBarProps> = ({ onConnect }) => {
  const { openSettings } = useSettingsModal()
  const { servers, exportConfig, importConfig } = useServerStore()
  const { connections } = useConnectionStore()
  const [isMaximized, setIsMaximized] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [isMac, setIsMac] = useState(false)
  const [aboutVisible, setAboutVisible] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { message, modal } = App.useApp()

  useEffect(() => {
    const checkMaximized = async () => {
      const maximized = await window.electronAPI?.isMaximized()
      setIsMaximized(maximized || false)
    }
    checkMaximized()

    // 获取平台信息
    window.electronAPI?.getPlatform().then(platform => {
      setIsMac(platform === 'darwin')
    })

    // 监听窗口最大化/还原事件（来自主进程）
    const unsubMax = window.electronAPI?.onWindowMaximized(() => setIsMaximized(true))
    const unsubUnmax = window.electronAPI?.onWindowUnmaximized(() => setIsMaximized(false))

    return () => {
      unsubMax?.()
      unsubUnmax?.()
    }
  }, [])

  const handleMinimize = () => {
    window.electronAPI?.minimizeWindow()
  }

  const handleMaximize = () => {
    window.electronAPI?.maximizeWindow()
  }

  const handleClose = () => {
    const activeCount = Array.from(connections.values()).filter(c => c.status === 'connected').length
    modal.confirm({
      title: '关闭应用',
      content: activeCount > 0
        ? `确定要关闭 SSHTools 吗？当前有 ${activeCount} 个活跃的 SSH 连接将会断开。`
        : '确定要关闭 SSHTools 吗？',
      okText: '关闭',
      cancelText: '取消',
      okButtonProps: { danger: true },
      centered: true,
      onOk: () => {
        window.electronAPI?.closeWindow()
      },
    })
  }

  // 搜索结果
  const searchResults = useMemo(() => {
    if (!searchText.trim()) return []
    const keyword = searchText.toLowerCase()
    return servers.filter(s =>
      s.name.toLowerCase().includes(keyword) ||
      s.host.toLowerCase().includes(keyword) ||
      s.username.toLowerCase().includes(keyword) ||
      (s.description || '').toLowerCase().includes(keyword)
    ).slice(0, 8)
  }, [searchText, servers])

  const searchMenuItems: MenuProps['items'] = searchResults.length > 0
    ? searchResults.map(s => ({
        key: s.id,
        label: (
          <div className="search-result-item">
            <div className="result-main">
              <span className="result-dot" />
              <span className="result-name">{s.name}</span>
            </div>
            <div className="result-sub">{s.username}@{s.host}:{s.port}</div>
          </div>
        ),
        onClick: () => {
          onConnect?.(s.id)
          setSearchText('')
          searchInputRef.current?.blur()
        },
      }))
    : searchText.trim()
      ? [{ key: 'empty', label: <span className="search-empty">未找到匹配的服务器</span>, disabled: true }]
      : []

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && searchFocused) {
        setSearchText('')
        searchInputRef.current?.blur()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [searchFocused])

  // 导出配置（需要输入加密密码）
  const handleExport = () => {
    let pwd = ''
    modal.confirm({
      title: '导出配置',
      content: (
        <div>
          <p style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
            请设置加密密码，用于保护密码和密钥等敏感信息。导入时需要输入相同密码。
          </p>
          <Input.Password
            placeholder="请输入加密密码"
            onChange={(e) => { pwd = e.target.value }}
            autoFocus
          />
        </div>
      ),
      okText: '导出',
      cancelText: '取消',
      onOk: async () => {
        if (!pwd.trim()) {
          message.error('请输入加密密码')
          throw new Error('cancel')
        }
        try {
          const json = await exportConfig(pwd.trim())
          const blob = new Blob([json], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `ssh-tools-config-${new Date().toISOString().slice(0, 10)}.json`
          a.click()
          URL.revokeObjectURL(url)
          message.success('配置已导出')
        } catch (err: unknown) {
          if (err instanceof Error && err.message !== 'cancel') message.error('导出失败')
          throw err
        }
      },
    })
  }

  // 导入配置（需要输入解密密码）
  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      let fileText: string
      try {
        fileText = await file.text()
      } catch {
        message.error('读取文件失败')
        return
      }

      // 检查文件是否包含加密数据
      let needPassword = false
      try {
        const parsed = JSON.parse(fileText)
        needPassword = parsed.encrypted === true
      } catch {
        message.error('配置文件格式无效')
        return
      }

      if (!needPassword) {
        // 旧格式无加密，直接导入
        const result = await importConfig(fileText, '')
        if (result.success) {
          message.success(`成功导入 ${result.count} 个服务器配置`)
        } else {
          message.error(result.error || '导入失败')
        }
        return
      }

      let pwd = ''
      modal.confirm({
        title: '导入配置',
        content: (
          <div>
            <p style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
              该配置文件已加密，请输入导出时设置的密码。
            </p>
            <Input.Password
              placeholder="请输入解密密码"
              onChange={(e) => { pwd = e.target.value }}
              autoFocus
            />
          </div>
        ),
        okText: '导入',
        cancelText: '取消',
        onOk: async () => {
          if (!pwd.trim()) {
            message.error('请输入解密密码')
            throw new Error('cancel')
          }
          const result = await importConfig(fileText, pwd.trim())
          if (result.success) {
            message.success(`成功导入 ${result.count} 个服务器配置`)
          } else {
            message.error(result.error || '导入失败')
            throw new Error(result.error)
          }
        },
      })
    }
    input.click()
  }

  const settingMenuItems: MenuProps['items'] = [
    {
      key: 'settings',
      label: (
        <Space>
          <SettingOutlined />
          <span>全局设置</span>
        </Space>
      ),
      onClick: openSettings,
    },
    { type: 'divider' },
    {
      key: 'import',
      label: (
        <Space>
          <ImportOutlined />
          <span>导入配置</span>
        </Space>
      ),
      onClick: handleImport,
    },
    {
      key: 'export',
      label: (
        <Space>
          <ExportOutlined />
          <span>导出配置</span>
        </Space>
      ),
      onClick: handleExport,
    },
    { type: 'divider' },
    {
      key: 'about',
      label: (
        <Space>
          <InfoCircleOutlined />
          <span>关于</span>
        </Space>
      ),
      onClick: () => setAboutVisible(true),
    },
  ]

  return (
    <div className={`title-bar drag-region ${isMac ? 'title-bar-mac' : ''}`}>
      <div className="title-bar-left no-drag">
        <img src="./icon.svg" className="app-logo-img" alt="logo" />
        <Text className="app-title" strong>SSHTools</Text>
        
        <div className="title-search">
          <Dropdown
            menu={{
              items: searchMenuItems,
              className: 'title-search-dropdown'
            }}
            open={searchFocused && searchText.trim().length > 0}
            trigger={[]}
            placement="bottomLeft"
          >
            <div className={`search-container ${searchFocused ? 'focused' : ''}`}>
              <SearchOutlined className="search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="快速搜索连接..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
              />
              {searchText ? (
                <span className="search-key" onClick={() => { setSearchText(''); searchInputRef.current?.focus() }} style={{ cursor: 'pointer' }}>✕</span>
              ) : (
                <span className="search-key">ESC</span>
              )}
            </div>
          </Dropdown>
        </div>
      </div>

      <div className="title-bar-right no-drag">
        <Dropdown menu={{ items: settingMenuItems }} trigger={['click']} placement="bottomRight">
          <Button type="text" icon={<SettingOutlined />} className="title-bar-btn" />
        </Dropdown>
        {/* macOS 使用原生红绿灯按钮，Windows/Linux 使用自定义按钮 */}
        {!isMac && (
          <div className="window-controls">
            <Button
              type="text"
              icon={<MinusOutlined />}
              className="title-bar-btn"
              onClick={handleMinimize}
            />
            <Button
              type="text"
              icon={isMaximized ? <BlockOutlined /> : <BorderOutlined />}
              className="title-bar-btn"
              onClick={handleMaximize}
            />
            <Button
              type="text"
              icon={<CloseOutlined />}
              className="title-bar-btn close-btn"
              onClick={handleClose}
            />
          </div>
        )}
      </div>

      {/* 关于弹窗 */}
      <Modal
        open={aboutVisible}
        onCancel={() => setAboutVisible(false)}
        footer={null}
        width={400}
        destroyOnHidden
        className="about-modal"
        centered
        closable
      >
        <div className="about-container">
          <div className="about-hero">
            <img src="./icon.svg" alt="SSHTools" className="about-logo" />
            <h2 className="about-app-name">SSHTools</h2>
            <span className="about-version">v{__APP_VERSION__}</span>
          </div>

          <p className="about-desc">
            开源桌面 SSH 管理工具，支持服务器管理、SSH 终端和 SFTP 文件传输。
          </p>

          <div className="about-info">
            <div className="about-info-row">
              <span className="about-info-label">开发者</span>
              <span className="about-info-value">车培清</span>
            </div>
            <div className="about-info-row">
              <span className="about-info-label"><MailOutlined /> 邮箱</span>
              <a className="about-info-link" href="#" onClick={(e) => { e.preventDefault(); window.electronAPI?.openExternal?.('mailto:chepeiqing@sina.com') }}>
                chepeiqing@sina.com
              </a>
            </div>
            <div className="about-info-row">
              <span className="about-info-label"><GithubOutlined /> 源码</span>
              <a className="about-info-link" href="#" onClick={(e) => { e.preventDefault(); window.electronAPI?.openExternal?.('https://github.com/chepeiqing/SSHTools') }}>
                github.com/chepeiqing/SSHTools
              </a>
            </div>
          </div>

          <div className="about-tech">
            <span className="about-tech-tag">Electron</span>
            <span className="about-tech-tag">React</span>
            <span className="about-tech-tag">TypeScript</span>
            <span className="about-tech-tag">Ant Design</span>
            <span className="about-tech-tag">xterm.js</span>
            <span className="about-tech-tag">ssh2</span>
          </div>

          <div className="about-footer">
            <span>MIT License</span>
            <span>© 2024-2026 车培清</span>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default TitleBar
