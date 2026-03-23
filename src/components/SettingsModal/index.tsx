import { create } from 'zustand'
import { Modal, Button, Space, Switch, ColorPicker, Select } from 'antd'
import {
  SunOutlined,
  MoonOutlined,
  DesktopOutlined,
  CheckOutlined,
} from '@ant-design/icons'
import { useThemeStore } from '../../stores/themeStore'
import { useTerminalThemeStore, darkPresets, lightPresets } from '../../stores/terminalThemeStore'
import './index.css'

// 全局设置弹窗状态
interface SettingsModalState {
  open: boolean
  openSettings: () => void
  closeSettings: () => void
}

export const useSettingsModal = create<SettingsModalState>((set) => ({
  open: false,
  openSettings: () => set({ open: true }),
  closeSettings: () => set({ open: false }),
}))

const SettingsModal: React.FC = () => {
  const { open, closeSettings } = useSettingsModal()
  const { mode, actualTheme, setMode } = useThemeStore()
  const terminalTheme = useTerminalThemeStore()
  const {
    fontSize, fontFamily, wordWrap, scrollOnOutput,
    setFontSize, setFontFamily, setWordWrap, setScrollOnOutput,
    setPreset, setCustomColor,
  } = terminalTheme

  const currentPresetId = actualTheme === 'dark' ? terminalTheme.darkPresetId : terminalTheme.lightPresetId
  const currentCustomColors = actualTheme === 'dark' ? terminalTheme.customDark : terminalTheme.customLight
  const currentPresetsMap = actualTheme === 'dark' ? darkPresets : lightPresets

  const themeModes: { key: 'light' | 'dark' | 'system'; icon: React.ReactNode; label: string }[] = [
    { key: 'light', icon: <SunOutlined />, label: '浅色' },
    { key: 'dark', icon: <MoonOutlined />, label: '深色' },
    { key: 'system', icon: <DesktopOutlined />, label: '跟随系统' },
  ]

  return (
    <Modal
      open={open}
      onCancel={closeSettings}
      footer={null}
      centered
      width={480}
      className="settings-modal-wrapper"
      closable
      destroyOnHidden
      mask={false}
    >
      <div className="settings-modal">
        <div className="settings-modal-header">
          <h3 className="settings-modal-title">全局设置</h3>
          <p className="settings-modal-subtitle">更改后立即对所有终端生效</p>
        </div>

        <div className="settings-modal-body">
          {/* 外观设置 */}
          <div className="settings-modal-section">
            <div className="settings-modal-section-title">外观</div>
            <div className="theme-mode-group">
              {themeModes.map(m => (
                <div
                  key={m.key}
                  className={`theme-mode-card ${mode === m.key ? 'active' : ''}`}
                  onClick={() => setMode(m.key)}
                >
                  <span className="theme-mode-icon">{m.icon}</span>
                  <span className="theme-mode-label">{m.label}</span>
                  {mode === m.key && <CheckOutlined className="theme-mode-check" />}
                </div>
              ))}
            </div>
          </div>

          {/* 终端设置 */}
          <div className="settings-modal-section">
            <div className="settings-modal-section-title">终端</div>

            <div className="settings-modal-row">
              <span>字体大小</span>
              <Space size={4}>
                <Button size="small" onClick={() => setFontSize(fontSize - 2)}>−</Button>
                <span className="settings-modal-font-value">{fontSize}</span>
                <Button size="small" onClick={() => setFontSize(fontSize + 2)}>+</Button>
                <Button size="small" onClick={() => setFontSize(14)}>重置</Button>
              </Space>
            </div>

            <div className="settings-modal-row">
              <span>字体</span>
              <Select
                size="small"
                value={fontFamily}
                onChange={setFontFamily}
                style={{ width: 220 }}
                options={[
                  { label: 'JetBrains Mono', value: '"JetBrains Mono Variable", Consolas, monospace' },
                  { label: 'Fira Code', value: '"Fira Code Variable", Consolas, monospace' },
                  { label: 'Source Code Pro', value: '"Source Code Pro Variable", Consolas, monospace' },
                  { label: 'Cascadia Code', value: '"Cascadia Code", Consolas, monospace' },
                  { label: 'Consolas', value: 'Consolas, "Courier New", monospace' },
                  { label: 'Courier New', value: '"Courier New", Consolas, monospace' },
                ]}
              />
            </div>

            <div className="settings-modal-row">
              <span>终端自动换行</span>
              <Switch size="small" checked={wordWrap} onChange={setWordWrap} />
            </div>

            <div className="settings-modal-row">
              <span>输出时自动滚动</span>
              <Switch size="small" checked={scrollOnOutput} onChange={setScrollOnOutput} />
            </div>
          </div>

          {/* 终端配色 */}
          <div className="settings-modal-section">
            <div className="settings-modal-section-title">
              终端配色
              <span className="settings-modal-mode-tag">{actualTheme === 'dark' ? '深色' : '浅色'}模式</span>
            </div>

            <div className="settings-modal-theme-grid">
              {Object.entries(currentPresetsMap).map(([id, scheme]) => (
                <div
                  key={id}
                  className={`theme-swatch ${currentPresetId === id ? 'active' : ''}`}
                  style={{ background: scheme.background }}
                  onClick={() => setPreset(actualTheme, id)}
                >
                  <span className="swatch-text" style={{ color: scheme.foreground }}>Aa</span>
                  {currentPresetId === id && <CheckOutlined className="swatch-check" style={{ color: scheme.foreground }} />}
                  <span className="swatch-name" style={{ color: scheme.foreground }}>{scheme.name}</span>
                </div>
              ))}
              <div
                className={`theme-swatch custom-swatch ${currentPresetId === 'custom' ? 'active' : ''}`}
                onClick={() => setPreset(actualTheme, 'custom')}
              >
                <span className="swatch-text">🎨</span>
                {currentPresetId === 'custom' && <CheckOutlined className="swatch-check" />}
                <span className="swatch-name">自定义</span>
              </div>
            </div>

            {currentPresetId === 'custom' && (
              <div className="settings-modal-custom-colors">
                <div className="settings-modal-color-row">
                  <span>背景色</span>
                  <ColorPicker
                    value={currentCustomColors.background}
                    onChange={(_, hex) => setCustomColor(actualTheme, 'background', hex)}
                    size="small"
                  />
                </div>
                <div className="settings-modal-color-row">
                  <span>文字色</span>
                  <ColorPicker
                    value={currentCustomColors.foreground}
                    onChange={(_, hex) => setCustomColor(actualTheme, 'foreground', hex)}
                    size="small"
                  />
                </div>
                <div className="settings-modal-color-row">
                  <span>光标色</span>
                  <ColorPicker
                    value={currentCustomColors.cursor}
                    onChange={(_, hex) => setCustomColor(actualTheme, 'cursor', hex)}
                    size="small"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default SettingsModal
