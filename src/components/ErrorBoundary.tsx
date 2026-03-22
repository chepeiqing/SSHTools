import React from 'react'
import { Button, Result } from 'antd'

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <Result
          status="error"
          title="页面出错了"
          subTitle={this.state.error?.message || '未知错误'}
          extra={[
            <Button key="reload" type="primary" onClick={() => window.location.reload()}>
              重新加载
            </Button>,
            <Button key="reset" onClick={() => this.setState({ hasError: false })}>
              尝试恢复
            </Button>,
          ]}
        />
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
