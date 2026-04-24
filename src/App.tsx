import { lazy, Suspense, useEffect } from 'react'
import TitleBar from './components/TitleBar'
import { emitSessionConnect } from './components/SessionManager/events'
import ErrorBoundary from './components/ErrorBoundary'
import { useThemeStore } from './stores/themeStore'
import { initTerminalSettingsSync } from './stores/terminalThemeStore'
import { hydrateCredentials, restoreFromBackup } from './stores/serverStore'
import './styles/global.css'

const MainContent = lazy(() => import('./components/MainContent'))
const SettingsModal = lazy(() => import('./components/SettingsModal'))

const appFallback = (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
    正在加载...
  </div>
)

const App: React.FC = () => {
  const initTheme = useThemeStore((state) => state.initTheme)
  const actualTheme = useThemeStore((state) => state.actualTheme)

  useEffect(() => {
    initTheme()
    initTerminalSettingsSync()
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
          <Suspense fallback={appFallback}>
            <MainContent />
          </Suspense>
        </div>
        <Suspense fallback={null}>
          <SettingsModal />
        </Suspense>
      </div>
    </ErrorBoundary>
  )
}

export default App
