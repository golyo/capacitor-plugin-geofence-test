import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import './App.css'

type LogLevel = 'info' | 'success' | 'error'

type LogItem = {
  time: string
  level: LogLevel
  message: string
}

type CheckinPermission =
  | 'CHECK_IN_ALLOWED'
  | 'CHECK_IN_PENDING'
  | 'CHECK_IN_NOT_ALLOWED'

type CheckinInfo = {
  logicalId: string
  name?: string
  latitude: number
  longitude: number
  radius: number
  airport: string
  checkInPermission?: CheckinPermission
}

type GeofenceStatus = 'NONE' | 'OK' | 'PERMISSION_DENIED' | 'ERROR'

type GeofenceService = {
  initialize: (options?: {
    pathPrefix?: string
    onEnterCheckinZone?: (checkin: CheckinInfo) => void
    onStatusChange?: (next: GeofenceStatus, prev: GeofenceStatus, error?: unknown) => void
    logger?: {
      debug: (...args: unknown[]) => void
      info: (...args: unknown[]) => void
      warn: (...args: unknown[]) => void
      error: (...args: unknown[]) => void
    }
  }) => Promise<void>
  reconfigure: (options?: {
    pathPrefix?: string
    notificationConfig?: {
      title?: string
      text?: string
      vibration?: number[]
      icons?: Record<string, string>
    }
  }) => void
  checkLocation: (checkin: CheckinInfo) => Promise<boolean>
  getDebugInfos: () => Promise<unknown>
  geofenceArrivedToApp: (logicalId: string) => void
  getStatus: () => GeofenceStatus
  hasGeofencedCheckin: () => boolean
  isPlatformAndroid: () => boolean
  CheckInPermission?: {
    CHECK_IN_ALLOWED: CheckinPermission
    CHECK_IN_PENDING: CheckinPermission
    CHECK_IN_NOT_ALLOWED: CheckinPermission
  }
}

const TEST_CHECKIN_A: CheckinInfo = {
  logicalId: 'bp-airport-a',
  name: 'Budapest Airport A',
  latitude: 47.4399,
  longitude: 19.2611,
  radius: 450,
  airport: 'A',
  checkInPermission: 'CHECK_IN_ALLOWED',
}

const TEST_CHECKIN_B: CheckinInfo = {
  logicalId: 'bp-airport-a',
  name: 'Budapest Airport B',
  latitude: 47.444,
  longitude: 19.255,
  radius: 500,
  airport: 'B',
  checkInPermission: 'CHECK_IN_PENDING',
}

const TEST_CHECKIN_DENIED: CheckinInfo = {
  logicalId: 'bp-airport-denied',
  name: 'Budapest Airport Denied',
  latitude: 47.439,
  longitude: 19.25,
  radius: 500,
  airport: 'BUD',
  checkInPermission: 'CHECK_IN_NOT_ALLOWED',
}

function App() {
  const [logs, setLogs] = useState<LogItem[]>([])
  const [statusSnapshot, setStatusSnapshot] = useState<GeofenceStatus>('NONE')
  const [debugSnapshot, setDebugSnapshot] = useState<string>('N/A')

  const appendLog = (level: LogLevel, message: string) => {
    const line = `[geofence-service-test][${level}] ${message}`
    if (level === 'error') {
      console.error(line)
    } else if (level === 'success') {
      console.info(line)
    } else {
      console.log(line)
    }
    setLogs((prev) => [
      {
        time: new Date().toLocaleTimeString(),
        level,
        message,
      },
      ...prev,
    ])
  }

  const geofenceService = (window.Geofence as GeofenceService | undefined) ?? null

  const makeBridgeLogger = () => ({
    debug: (...args: unknown[]) => appendLog('info', `[bridge debug] ${args.map(String).join(' ')}`),
    info: (...args: unknown[]) => appendLog('info', `[bridge info] ${args.map(String).join(' ')}`),
    warn: (...args: unknown[]) => appendLog('info', `[bridge warn] ${args.map(String).join(' ')}`),
    error: (...args: unknown[]) => appendLog('error', `[bridge error] ${args.map(String).join(' ')}`),
  })

  const runAction = async (title: string, action: () => Promise<unknown>) => {
    appendLog('info', `${title} -> started`)
    try {
      const result = await action()
      if (typeof result !== 'undefined') {
        appendLog('success', `${title} -> success: ${JSON.stringify(result)}`)
      } else {
        appendLog('success', `${title} -> success`)
      }
    } catch (error) {
      appendLog('error', `${title} -> error: ${JSON.stringify(error)}`)
      console.error(error)
    }
  }

  const ensureService = (): GeofenceService => {
    if (!geofenceService) {
      throw new Error('window.Geofence not available')
    }
    return geofenceService
  }

  useEffect(() => {
    if (!geofenceService) {
      appendLog('error', 'window.Geofence instance is missing (bridge entry not loaded).')
      return
    }
    appendLog('info', 'window.Geofence instance detected.')
    setStatusSnapshot(geofenceService.getStatus())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="app">
      <h1>window.Geofence Service Test</h1>

      <section className="panel">
        <h2>Environment</h2>
        <p>
          <strong>Platform:</strong> {Capacitor.getPlatform()} ({Capacitor.isNativePlatform() ? 'native' : 'web'})
        </p>
        <p>
          <strong>window.Geofence:</strong> {geofenceService ? 'available' : 'missing'}
        </p>
        <p>
          <strong>Status snapshot:</strong> {statusSnapshot}
        </p>
      </section>

      <section className="panel">
        <h2>Lifecycle + interface tests</h2>
        <div className="buttonGrid">
          <button
            onClick={() =>
              runAction('initialize', async () => {
                const service = ensureService()
                await service.initialize({
                  pathPrefix: '#/checkin/',
                  logger: makeBridgeLogger(),
                  onEnterCheckinZone: (checkin) => {
                    appendLog('success', `onEnterCheckinZone -> ${JSON.stringify(checkin)}`)
                  },
                  onStatusChange: (next, prev, error) => {
                    appendLog('info', `onStatusChange -> ${prev} => ${next} (${JSON.stringify(error)})`)
                    setStatusSnapshot(next)
                  },
                })
                const status = service.getStatus()
                setStatusSnapshot(status)
                return { status }
              })
            }
          >
            initialize
          </button>
          <button
            onClick={() =>
              runAction('reconfigure', async () => {
                const service = ensureService()
                service.reconfigure({
                  notificationConfig: {
                    title: 'Check-in zone reached for {airport}',
                    text: 'Enter transition received for {logicalId}',
                    vibration: [0, 120, 60, 120],
                  },
                })
                return { ok: true }
              })
            }
          >
            reconfigure
          </button>
          <button
            onClick={() =>
              runAction('getStatus', async () => {
                const service = ensureService()
                const status = service.getStatus()
                setStatusSnapshot(status)
                return { status }
              })
            }
          >
            getStatus
          </button>
          <button
            onClick={() =>
              runAction('hasGeofencedCheckin', async () => {
                const service = ensureService()
                return { hasGeofencedCheckin: service.hasGeofencedCheckin() }
              })
            }
          >
            hasGeofencedCheckin
          </button>
          <button
            onClick={() =>
              runAction('getDebugInfos', async () => {
                const service = ensureService()
                const debugInfo = await service.getDebugInfos()
                setDebugSnapshot(JSON.stringify(debugInfo))
                return debugInfo
              })
            }
          >
            debugInfo
          </button>
          <button
            onClick={() =>
              runAction('geofenceArrivedToApp (test)', async () => {
                const service = ensureService()
                service.geofenceArrivedToApp(TEST_CHECKIN_A.logicalId)
              })
            }
          >
            geofenceArrivedToApp
          </button>
          <button onClick={() => setLogs([])}>clear logs</button>
        </div>
        <div className="permissionStatus">
          <strong>Debug snapshot:</strong> {debugSnapshot}
        </div>
      </section>

      <section className="panel">
        <h2>checkLocation tests (enter transition only)</h2>
        <div className="buttonGrid">
          <button
            onClick={() =>
              runAction('checkLocation A (allowed)', async () => {
                const service = ensureService()
                return service.checkLocation(TEST_CHECKIN_A)
              })
            }
          >
            checkLocation A
          </button>
          <button
            onClick={() =>
              runAction('checkLocation B (pending)', async () => {
                const service = ensureService()
                return service.checkLocation(TEST_CHECKIN_B)
              })
            }
          >
            checkLocation B
          </button>
          <button
            onClick={() =>
              runAction('checkLocation denied', async () => {
                const service = ensureService()
                return service.checkLocation(TEST_CHECKIN_DENIED)
              })
            }
          >
            checkLocation denied
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Logs</h2>
        <div className="logs">
          {logs.length === 0 && <div className="logItem info">No logs yet.</div>}
          {logs.map((log, index) => (
            <div key={`${log.time}-${index}`} className={`logItem ${log.level}`}>
              [{log.time}] {log.message}
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App
