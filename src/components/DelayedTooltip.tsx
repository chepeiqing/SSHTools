import { Tooltip } from 'antd'
import type { TooltipProps } from 'antd'

const DelayedTooltip: React.FC<TooltipProps> = (props) => {
  const overlayStyle = {
    maxWidth: 'calc(100vw - 16px)',
    ...props.overlayStyle,
  }

  const overlayInnerStyle = {
    maxWidth: 'min(320px, calc(100vw - 16px))',
    whiteSpace: 'normal' as const,
    overflowWrap: 'anywhere' as const,
    ...props.overlayInnerStyle,
  }

  return (
    <Tooltip
      mouseEnterDelay={0.6}
      mouseLeaveDelay={0.1}
      autoAdjustOverflow
      align={{ overflow: { adjustX: 1, adjustY: 1 } }}
      overlayClassName={['app-delayed-tooltip', props.overlayClassName].filter(Boolean).join(' ')}
      overlayStyle={overlayStyle}
      overlayInnerStyle={overlayInnerStyle}
      {...props}
    />
  )
}

export default DelayedTooltip
