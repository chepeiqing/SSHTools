type SessionConnectEvent = {
  serverId: string
}

const sessionConnectListeners: Array<(event: SessionConnectEvent) => void> = []
const newSessionListeners: Array<() => void> = []

export function onSessionConnect(callback: (event: SessionConnectEvent) => void) {
  sessionConnectListeners.push(callback)
  return () => {
    const index = sessionConnectListeners.indexOf(callback)
    if (index > -1) sessionConnectListeners.splice(index, 1)
  }
}

export function emitSessionConnect(event: SessionConnectEvent) {
  sessionConnectListeners.forEach(cb => cb(event))
}

export function onOpenNewSession(callback: () => void) {
  newSessionListeners.push(callback)
  return () => {
    const index = newSessionListeners.indexOf(callback)
    if (index > -1) newSessionListeners.splice(index, 1)
  }
}

export function emitOpenNewSession() {
  newSessionListeners.forEach(cb => cb())
}

export type { SessionConnectEvent }
