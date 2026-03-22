import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider, App as AntApp } from 'antd'
import App from './App'
import { useThemeStoreWithAntd } from './stores/themeStore'
import './styles/global.css'

const Root: React.FC = () => {
  const { antdTheme, algorithm } = useThemeStoreWithAntd()

  return (
    <ConfigProvider
      theme={{
        token: antdTheme,
        algorithm,
      }}
    >
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
