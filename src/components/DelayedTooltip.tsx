import { Tooltip } from 'antd'
import type { TooltipProps } from 'antd'

const DelayedTooltip: React.FC<TooltipProps> = (props) => {
  const {
    classNames,
    styles,
    overlayClassName,
    overlayStyle,
    overlayInnerStyle,
    ...restProps
  } = props

  const rootStyle = {
    maxWidth: 'calc(100vw - 16px)',
    ...overlayStyle,
    ...styles?.root,
  }

  const bodyStyle = {
    maxWidth: 'min(320px, calc(100vw - 16px))',
    whiteSpace: 'normal' as const,
    overflowWrap: 'anywhere' as const,
    ...overlayInnerStyle,
    ...styles?.body,
  }

  return (
    <Tooltip
      mouseEnterDelay={0.6}
      mouseLeaveDelay={0.1}
      autoAdjustOverflow
      align={{ overflow: { adjustX: 1, adjustY: 1 } }}
      classNames={{
        ...classNames,
        root: ['app-delayed-tooltip', overlayClassName, classNames?.root].filter(Boolean).join(' '),
      }}
      styles={{
        ...styles,
        root: rootStyle,
        body: bodyStyle,
      }}
      {...restProps}
    />
  )
}

export default DelayedTooltip
