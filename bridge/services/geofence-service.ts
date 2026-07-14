import { Capacitor } from '@capacitor/core';
import { resolveLogger, type Logger } from '../utils/logger';

/**
 * Geofence is temporarily DISABLED.
 *
 * The native geofencing relied on the custom `capacitor-plugin-geofence`, which
 * still needs further development. To ship a working app without it, this module
 * is a no-op stub that preserves the public `window.Geofence` API surface so the
 * web app keeps loading and treats geofencing as unavailable (the same handled
 * state as when location permission is denied).
 *
 * To re-enable: restore the plugin-backed implementation (see git history),
 * re-add `capacitor-plugin-geofence` (+ `@capacitor/geolocation`) to package.json,
 * and run `npx cap sync`.
 */
const MODULE = 'Geofence';

export const Status = {
  NONE: 'NONE',
  OK: 'OK',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  ERROR: 'ERROR',
} as const;
export type GeofenceStatus = (typeof Status)[keyof typeof Status];

export const CheckInPermission = {
  CHECK_IN_ALLOWED: 'CHECK_IN_ALLOWED',
  CHECK_IN_PENDING: 'CHECK_IN_PENDING',
  CHECK_IN_NOT_ALLOWED: 'CHECK_IN_NOT_ALLOWED',
} as const;

export interface CheckinInfo {
  logicalId: string;
  name?: string;
  latitude: number;
  longitude: number;
  radius: number;
  airport: string;
  checkInPermission?: string;
}

export interface GeofenceOptions {
  logger?: Logger;
  pathPrefix?: string;
  onEnterCheckinZone?: (checkin: CheckinInfo) => void;
  onStatusChange?: (newStatus: GeofenceStatus, oldStatus: GeofenceStatus, error?: unknown) => void;
  notificationConfig?: {
    title?: string;
    text?: string;
    vibration?: number[];
    icons?: Record<string, string>;
  };
  geolocation?: PositionOptions;
}

const isPlatformAndroid = () => Capacitor.getPlatform() === 'android';

/**
 * No-op geofence service. Reports geofencing as unavailable and does nothing,
 * while preserving the public API the web app calls.
 */
export function createGeofenceService(initialOptions?: GeofenceOptions) {
  const logger: Logger = resolveLogger(initialOptions);
  // Geofencing is unavailable while the custom plugin is disabled.
  const status: GeofenceStatus = Status.PERMISSION_DENIED;

  logger.info(`[${MODULE}] Geofence plugin is disabled — running in no-op mode.`);

  const initialize = async (_opts?: GeofenceOptions): Promise<void> => {
    logger.info(`[${MODULE}] initialize() ignored — geofencing disabled.`);
  };

  const reconfigure = (_opts?: GeofenceOptions): void => undefined;

  const checkLocation = async (_info: CheckinInfo): Promise<boolean> => {
    logger.debug(`[${MODULE}] checkLocation() ignored — geofencing disabled.`);
    return false;
  };

  const getDebugInfos = async () => ({ position: null, checkinInfos: [] as unknown[] });

  const geofenceArrivedToApp = (_logicalId: string): void => undefined;

  return {
    initialize,
    reconfigure,
    checkLocation,
    getDebugInfos,
    geofenceArrivedToApp,
    isPlatformAndroid,
    Status,
    getStatus: () => status,
    hasGeofencedCheckin: () => false,
  };
}

export type GeofenceApi = ReturnType<typeof createGeofenceService>;
