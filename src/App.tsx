import { useEffect, useMemo, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Geofence, TransitionType } from 'capacitor-plugin-geofence'
import './App.css'

type AppGeofence = {
  id: string
  latitude: number
  longitude: number
  radius: number
  transitionType: number
  loiteringDelay?: number
  startTime?: string
  endTime?: string
  notification?: {
    id?: number
    title?: string
    text?: string
    openAppOnClick?: boolean
    frequency?: number
    vibrate?: number[]
    data?: unknown
  }
}

const TEST_GEOFENCE_ID = 'bp-parlament-geofence'
const TEST_NOTIFICATION_ID = 9001

const TEST_COORDINATES = {
  latitude: 47.50786,
  longitude: 19.04593,
  radius: 500,
}

const buildSingleTestGeofence = (): AppGeofence => ({
  id: TEST_GEOFENCE_ID,
  latitude: TEST_COORDINATES.latitude,
  longitude: TEST_COORDINATES.longitude,
  radius: TEST_COORDINATES.radius,
  transitionType: TransitionType.BOTH,
  loiteringDelay: 60000,
  startTime: '2026-01-01T00:00:00.000Z',
  endTime: '2030-01-01T00:00:00.000Z',
  notification: {
    id: TEST_NOTIFICATION_ID,
    title: 'Geofence $transition',
    text: 'Test geofence transition happened.',
    openAppOnClick: true,
    frequency: 0,
    vibrate: [200, 200, 200],
    data: {
      source: 'geofence-test-app',
      geofenceId: TEST_GEOFENCE_ID,
    },
  },
})

type LogLevel = 'info' | 'success' | 'error'

type LogItem = {
  time: string
  level: LogLevel
  message: string
}

type PermissionStatusMap = Record<string, string>

function App() {
  const [logs, setLogs] = useState<LogItem[]>([])
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatusMap | null>(null)
  const testGeofence = useMemo(() => buildSingleTestGeofence(), [])

  const appendLog = (level: LogLevel, message: string) => {
    const line = `[geofence-test][${level}] ${message}`
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

  const checkPermissions = async () => {
    await runAction('checkPermissionStatus', async () => {
      const result = await Geofence.checkPermissionStatus()
      setPermissionStatus(result)
      return result
    })
  }

  useEffect(() => {
    Geofence.onNotificationClicked = (notificationData: unknown) => {
      appendLog('info', `callback:onNotificationClicked -> ${JSON.stringify(notificationData)}`)
    }

    Geofence.onTransitionReceived = (geofences: AppGeofence[]) => {
      appendLog('info', `callback:onTransitionReceived -> ${JSON.stringify(geofences)}`)
    }

    appendLog('info', 'Callbacks bound: onNotificationClicked, onTransitionReceived')
    checkPermissions().catch((error) => {
      appendLog('error', `initial checkPermissionStatus -> error: ${JSON.stringify(error)}`)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="app">
      <h1>Capacitor Geofence Plugin Test</h1>

      <section className="panel">
        <h2>Environment</h2>
        <p>
          <strong>Platform:</strong> {Capacitor.getPlatform()} ({Capacitor.isNativePlatform() ? 'native' : 'web'})
        </p>
        <p>
          <strong>Test geofence ID:</strong> {TEST_GEOFENCE_ID}
        </p>
        <p>
          <strong>Coordinates:</strong> lat {TEST_COORDINATES.latitude}, lng {TEST_COORDINATES.longitude}, radius{' '}
          {TEST_COORDINATES.radius}m
        </p>
      </section>

      <section className="panel">
        <h2>Permission / lifecycle tests</h2>
        <div className="buttonGrid">
          <button onClick={() => void checkPermissions()}>checkPermissions</button>
          <button
            onClick={() =>
              runAction('initialize (permission flow)', async () => {
                const ready = await Geofence.initialize((result) => {
                  appendLog('info', `initialize callback -> requested: ${JSON.stringify(result.requested)}`)
                  appendLog('info', `initialize callback -> granted: ${JSON.stringify(result.granted)}`)
                  appendLog('info', `initialize callback -> missing: ${JSON.stringify(result.missing)}`)
                  appendLog('info', `initialize callback -> ready: ${JSON.stringify(result.ready)}`)
                })
                const status = await Geofence.checkPermissionStatus()
                setPermissionStatus(status)
                return { ready, status }
              })
            }
          >
            initialize
          </button>
          <button onClick={() => runAction('deviceReady', () => Geofence.deviceReady())}>deviceReady</button>
          <button onClick={() => runAction('ping', () => Geofence.ping())}>ping</button>
        </div>
        <div className="permissionStatus">
          <strong>Permission status:</strong>{' '}
          {permissionStatus ? JSON.stringify(permissionStatus) : 'N/A'}
        </div>
      </section>

      <section className="panel">
        <h2>Geofence method tests</h2>
        <div className="buttonGrid">
          <button onClick={() => runAction('addOrUpdate (single)', () => Geofence.addOrUpdate(testGeofence))}>
            addOrUpdate single
          </button>
          <button
            onClick={() =>
              runAction('addOrUpdate (array)', () =>
                Geofence.addOrUpdate([
                  testGeofence,
                  {
                    ...testGeofence,
                    id: `${TEST_GEOFENCE_ID}-2`,
                    latitude: testGeofence.latitude + 0.0007,
                    notification: {
                      ...testGeofence.notification,
                      id: TEST_NOTIFICATION_ID + 1,
                    },
                  },
                ]),
              )
            }
          >
            addOrUpdate array
          </button>
          <button onClick={() => runAction('getWatched', () => Geofence.getWatched())}>getWatched</button>
          <button onClick={() => runAction('remove', () => Geofence.remove([TEST_GEOFENCE_ID]))}>remove by ID</button>
          <button onClick={() => runAction('removeAll', () => Geofence.removeAll())}>removeAll</button>
          <button
            onClick={() =>
              runAction('dismissNotifications', () => Geofence.dismissNotifications([TEST_NOTIFICATION_ID]))
            }
          >
            dismissNotifications
          </button>
          <button onClick={() => runAction('snooze', () => Geofence.snooze(TEST_GEOFENCE_ID, 120))}>snooze 120s</button>
        </div>
      </section>

      <section className="panel">
        <h2>Callback simulation buttons</h2>
        <div className="buttonGrid">
          <button
            onClick={() =>
              runAction('simulate onTransitionReceived', async () => {
                Geofence.onTransitionReceived([testGeofence])
              })
            }
          >
            simulate transition callback
          </button>
          <button
            onClick={() =>
              runAction('simulate onNotificationClicked', async () => {
                Geofence.onNotificationClicked({ id: TEST_NOTIFICATION_ID, source: 'manual-simulate' })
              })
            }
          >
            simulate notification callback
          </button>
          <button onClick={() => setLogs([])}>clear logs</button>
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
