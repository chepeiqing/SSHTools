import { Button, Switch, Space, ColorPicker } from 'antd'
import { CheckOutlined } from '@ant-design/icons'

interface ColorScheme {
  name: string
  foreground: string
  background: string
  cursor: string
}

interface TerminalSettingsPanelProps {
  wordWrap: boolean
  scrollOnOutput: boolean
  fontSize: number
  actualTheme: 'light' | 'dark'
  currentPresetId: string
  currentPresetsMap: Record<string, ColorScheme>
  currentCustomColors: { foreground: string; background: string; cursor: string }
  onToggleWordWrap: () => void
  onToggleScrollOnOutput: () => void
  onChangeFontSize: (delta: number) => void
  onSelectPreset: (id: string) => void
  onSetCustomColor: (
    theme: 'light' | 'dark',
    key: 'foreground' | 'background' | 'cursor',
    color: string
  ) => void
  onClose: () => void
}

const TerminalSettingsPanel: React.FC<TerminalSettingsPanelProps> = ({
  wordWrap,
  scrollOnOutput,
  fontSize,
  actualTheme,
  currentPresetId,
  currentPresetsMap,
  currentCustomColors,
  onToggleWordWrap,
  onToggleScrollOnOutput,
  onChangeFontSize,
  onSelectPreset,
  onSetCustomColor,
  onClose,
}) => {
  const currentPresetName = currentPresetId === 'custom'
    ? '自定义'
    : (currentPresetsMap[currentPresetId]?.name || '未命名预设')

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <span className="settings-title">终端设置</span>
        <Button type="text" size="small" onClick={onClose}>×</Button>
      </div>
      <div className="settings-body">
        <div className="settings-row">
          <span>自动换行</span>
          <Switch size="small" checked={wordWrap} onChange={onToggleWordWrap} />
        </div>
        <div className="settings-row">
          <span>输出时滚动到底部</span>
          <Switch size="small" checked={scrollOnOutput} onChange={onToggleScrollOnOutput} />
        </div>

        <div className="settings-divider" />

        <div className="settings-row">
          <span>字体大小</span>
          <Space size={4}>
            <Button size="small" onClick={() => onChangeFontSize(-2)}>-</Button>
            <span className="font-size-value">{fontSize}</span>
            <Button size="small" onClick={() => onChangeFontSize(2)}>+</Button>
            <Button size="small" onClick={() => onChangeFontSize(0)}>重置</Button>
          </Space>
        </div>

        <div className="settings-divider" />

        <div className="settings-section-title">
          终端配色
          <span className="settings-mode-tag">{actualTheme === 'dark' ? '深色模式' : '浅色模式'}</span>
        </div>
        <div className="settings-theme-summary">
          <div className="settings-theme-summary-title">
            当前正在配置{actualTheme === 'dark' ? '深色终端' : '浅色终端'}
          </div>
          <div className="settings-theme-summary-desc">
            当前预设：{currentPresetName}。浅色和深色会分别保存自己的预设与自定义颜色。
          </div>
        </div>
        <div className="settings-subsection-title">当前模式预设</div>
        <div className="theme-grid">
          {Object.entries(currentPresetsMap).map(([id, scheme]) => (
            <div
              key={id}
              className={`theme-swatch ${currentPresetId === id ? 'active' : ''}`}
              style={{ background: scheme.background }}
              onClick={() => onSelectPreset(id)}
            >
              <span className="swatch-text" style={{ color: scheme.foreground }}>Aa</span>
              {currentPresetId === id && (
                <CheckOutlined className="swatch-check" style={{ color: scheme.foreground }} />
              )}
              <span className="swatch-name" style={{ color: scheme.foreground }}>{scheme.name}</span>
            </div>
          ))}
          <div
            className={`theme-swatch custom-swatch ${currentPresetId === 'custom' ? 'active' : ''}`}
            onClick={() => onSelectPreset('custom')}
          >
            <span className="swatch-text">C</span>
            {currentPresetId === 'custom' && <CheckOutlined className="swatch-check" />}
            <span className="swatch-name">自定义</span>
          </div>
        </div>

        {currentPresetId === 'custom' && (
          <div className="custom-colors">
            <div className="settings-subsection-title">自定义颜色</div>
            <div className="color-row">
              <span>背景色</span>
              <ColorPicker
                value={currentCustomColors.background}
                onChange={(_, hex) => onSetCustomColor(actualTheme, 'background', hex)}
                size="small"
              />
            </div>
            <div className="color-row">
              <span>文字色</span>
              <ColorPicker
                value={currentCustomColors.foreground}
                onChange={(_, hex) => onSetCustomColor(actualTheme, 'foreground', hex)}
                size="small"
              />
            </div>
            <div className="color-row">
              <span>光标色</span>
              <ColorPicker
                value={currentCustomColors.cursor}
                onChange={(_, hex) => onSetCustomColor(actualTheme, 'cursor', hex)}
                size="small"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default TerminalSettingsPanel
