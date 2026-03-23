import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider, App as AntApp } from 'antd'
import App from './App'
import { useThemeStoreWithAntd } from './stores/themeStore'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/fira-code'
import '@fontsource-variable/source-code-pro'
import '@fontsource/cascadia-code/400.css'
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
