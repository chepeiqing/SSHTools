import { useState, useEffect } from 'react'
import TitleBar from './components/TitleBar'
import SessionManager, { emitSessionConnect } from './components/SessionManager'
import MainContent from './components/MainContent'
import ErrorBoundary from './components/ErrorBoundary'
import { useThemeStore } from './stores/themeStore'
import { hydrateCredentials, restoreFromBackup } from './stores/serverStore'
import './styles/global.css'

const App: React.FC = () => {
  const initTheme = useThemeStore((state) => state.initTheme)
  const actualTheme = useThemeStore((state) => state.actualTheme)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)

  useEffect(() => {
    initTheme()
    // 先从备份恢复配置（重新安装后 localStorage 为空），再恢复凭据
    restoreFromBackup().then(() => hydrateCredentials())
  }, [initTheme])

  // 应用深色模式 class
  useEffect(() => {
    if (actualTheme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [actualTheme])

  return (
    <ErrorBoundary>
      <div className="app-container">
        <TitleBar onConnect={(serverId) => emitSessionConnect({ serverId })} />
        <div className="app-main">
          <SessionManager collapsed={sidebarCollapsed} />
          <MainContent
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
        </div>
      </div>
    </ErrorBoundary>
  )
}

export default App
