import { Capacitor } from '@capacitor/core';
import { Geolocation, type Position, type PositionOptions } from '@capacitor/geolocation';
import {
  Geofence as GeofencePlugin,
  TransitionType,
} from 'capacitor-plugin-geofence';
import { resolveLogger, type Logger } from '../utils/logger';

const MODULE = 'Geofence';
const EARTH_RADIUS = 6371e3; // meters
const GEOLOCATION_THRESHOLD = 50; // meters
const CACHE_LOCATION_MILLISECONDS = 2000;

const NOTIFICATION_TITLE = 'You have reached the check-in zone.';
const NOTIFICATION_TEXT = 'Check-in for {airport} is now available.';
const NOTIFICATION_VIBRATION = [0];

const NOTIFICATION_ICONS_MAP: Record<string, Record<string, string>> = {
  ios: { smallIcon: 'res://icon/icon-small.png', icon: 'res://icon/icon.png' },
  android: { smallIcon: 'res://notification_icon', icon: 'res://notification_icon' },
};

const DEFAULT_GEOLOCATION: PositionOptions = {
  enableHighAccuracy: true,
};

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
export type CheckInPermissionType = (typeof CheckInPermission)[keyof typeof CheckInPermission];

export interface CheckinInfo {
  logicalId: string;
  name?: string;
  latitude: number;
  longitude: number;
  radius: number;
  airport: string;
  checkInPermission?: CheckInPermissionType | string;
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

type GeofencedMeta = {
  geofenceId: string;
  checkinInfo: CheckinInfo;
  geofenceStarted: boolean;
};

const isPlatformAndroid = () => Capacitor.getPlatform() === 'android';

const replaceVars = (template: string, vars: object) =>
  Object.entries(vars).reduce(
    (acc, [name, value]) => acc.replaceAll(`{${name}}`, String(value ?? '')),
    template,
  );

function isPermissionGranted(result: { location?: string; coarseLocation?: string }): boolean {
  return result.location === 'granted' || result.coarseLocation === 'granted';
}

function validateCheckinInfo(checkinInfo: CheckinInfo): void {
  const {
    logicalId, latitude, longitude, radius, airport,
  } = checkinInfo;
  if (!logicalId) {
    throw new Error('check-in identifier is invalid');
  }
  if (typeof latitude !== 'number') {
    throw new Error('latitude coordinate is invalid');
  }
  if (typeof longitude !== 'number') {
    throw new Error('longitude coordinate is invalid');
  }
  if (typeof radius !== 'number') {
    throw new Error('radius (in meters) is invalid');
  }
  if (typeof airport !== 'string') {
    throw new Error('airport is invalid');
  }
}

function calcDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => deg * (Math.PI / 180);
  const fi1 = toRad(lat1);
  const fi2 = toRad(lat2);
  const deltaFi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);
  const a = Math.sin(deltaFi / 2) ** 2
    + Math.cos(fi1) * Math.cos(fi2) * Math.sin(deltaLambda / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function createGeofenceService(initialOptions?: GeofenceOptions) {
  let logger: Logger = resolveLogger(initialOptions);
  let status: GeofenceStatus = Status.NONE;
  let geofencingEnabled = false;
  let callbacksBound = false;
  let idCounter = 0;
  let pendingBannerClick: CheckinInfo | undefined;
  let lastEnteredCheckinZone: CheckinInfo | null = null;
  let lastTimeCheckinZone = 0;
  const geofencedCheckins: GeofencedMeta[] = [];

  let options: Required<Pick<GeofenceOptions, 'pathPrefix'>> & Omit<GeofenceOptions, 'pathPrefix'> = {
    pathPrefix: '#/checkin/',
    notificationConfig: {
      title: NOTIFICATION_TITLE,
      text: NOTIFICATION_TEXT,
      vibration: NOTIFICATION_VIBRATION,
      icons: NOTIFICATION_ICONS_MAP[Capacitor.getPlatform()] ?? {},
    },
    geolocation: DEFAULT_GEOLOCATION,
    ...initialOptions,
  };

  let cachedPositionPromise: Promise<Position> | null = null;
  let lastPosition: Position | null = null;
  let lastPositionCallTime = 0;

  const setStatus = (nextStatus: GeofenceStatus, error?: unknown): void => {
    const previous = status;
    status = nextStatus;
    if (error) {
      logger.error(`[${MODULE}] Status change: ${previous} => ${nextStatus}`, error);
    } else {
      logger.info(`[${MODULE}] Status change: ${previous} => ${nextStatus}`);
    }
    if (previous !== nextStatus && options.onStatusChange) {
      options.onStatusChange(nextStatus, previous, error);
    }
  };

  const getPosition = async (): Promise<Position> => {
    const now = Date.now();
    if (now - lastPositionCallTime < CACHE_LOCATION_MILLISECONDS) {
      if (cachedPositionPromise) {
        return cachedPositionPromise;
      }
      if (lastPosition) {
        return lastPosition;
      }
    }
    lastPositionCallTime = now;
    cachedPositionPromise = Geolocation.getCurrentPosition({
      ...DEFAULT_GEOLOCATION,
      ...(options.geolocation ?? {}),
    });
    try {
      lastPosition = await cachedPositionPromise;
      return lastPosition;
    } finally {
      cachedPositionPromise = null;
    }
  };

  const getGeofenceId = (checkinInfo: CheckinInfo): string => `g-${checkinInfo.logicalId}-${checkinInfo.name ?? ''}`;

  const clearAll = async (): Promise<void> => {
    geofencedCheckins.length = 0;
    if (!geofencingEnabled) {
      return;
    }
    try {
      await GeofencePlugin.removeAll();
      logger.info(`[${MODULE}] All stored geofenced positions are cleared.`);
    } catch (error) {
      logger.warn(`[${MODULE}] Stored geofence positions could not be cleared.`, error);
    }
  };

  const startCheckLocation = (checkinInfo: CheckinInfo): void => {
    const geofenceId = getGeofenceId(checkinInfo);
    const existing = geofencedCheckins.find((item) => item.geofenceId === geofenceId);
    if (existing) {
      return;
    }
    if (geofencedCheckins.length > 0 && geofencedCheckins[0].checkinInfo.logicalId !== checkinInfo.logicalId) {
      void clearAll();
    }
    geofencedCheckins.push({
      geofenceId,
      checkinInfo,
      geofenceStarted: false,
    });
  };

  const setIfNotGeofenced = (checkinInfo: CheckinInfo): boolean => {
    const geofenceId = getGeofenceId(checkinInfo);
    const existing = geofencedCheckins.find((item) => item.geofenceId === geofenceId);
    if (!existing) {
      return false;
    }
    if (existing.geofenceStarted) {
      logger.info(`[${MODULE}] This location (${geofenceId}) is already added to geofence.`);
      return false;
    }
    existing.geofenceStarted = true;
    return true;
  };

  const triggerEnter = (checkinInfo: CheckinInfo, source: 'position' | 'transition' | 'notification'): void => {
    const now = Date.now();
    if (lastEnteredCheckinZone?.logicalId === checkinInfo.logicalId
      && now - lastTimeCheckinZone <= CACHE_LOCATION_MILLISECONDS) {
      return;
    }
    lastTimeCheckinZone = now;
    lastEnteredCheckinZone = checkinInfo;
    logger.info(`[${MODULE}] check-in zone reached via ${source}: ${checkinInfo.logicalId}`);
    options.onEnterCheckinZone?.(checkinInfo);
  };

  const checkPosition = (checkinInfo: CheckinInfo, position: Position): boolean => {
    const distance = calcDistance(
      checkinInfo.latitude,
      checkinInfo.longitude,
      position.coords.latitude,
      position.coords.longitude,
    );
    const inside = distance <= checkinInfo.radius + GEOLOCATION_THRESHOLD;
    if (inside) {
      logger.info(
        `[${MODULE}] Actual location is inside geofence (distance=${Math.round(distance)}m, radius=${checkinInfo.radius}+${GEOLOCATION_THRESHOLD}m).`,
      );
    }
    return inside;
  };

  const parseCheckinPayload = (payload: unknown): CheckinInfo | null => {
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    const maybeCheckin = payload as Partial<CheckinInfo>;
    if (
      typeof maybeCheckin.logicalId !== 'string'
      || typeof maybeCheckin.latitude !== 'number'
      || typeof maybeCheckin.longitude !== 'number'
      || typeof maybeCheckin.radius !== 'number'
      || typeof maybeCheckin.airport !== 'string'
    ) {
      return null;
    }
    return maybeCheckin as CheckinInfo;
  };

  const handleBannerClickAfterInitialize = (): void => {
    if (!pendingBannerClick || status !== Status.OK) {
      return;
    }
    const checkInPath = `${options.pathPrefix}${encodeURIComponent(pendingBannerClick.logicalId)}`;
    window.location.hash = checkInPath;
    setTimeout(() => {
      pendingBannerClick = undefined;
    }, 500);
  };

  const bindCallbacks = (): void => {
    if (callbacksBound) {
      return;
    }
    GeofencePlugin.onTransitionReceived = (geofences) => {
      geofences.forEach((item) => {
        if (item.transitionType !== TransitionType.ENTER) {
          return;
        }
        const checkin = parseCheckinPayload(item.notification?.data);
        if (!checkin) {
          return;
        }
        triggerEnter(checkin, 'transition');
      });
    };
    GeofencePlugin.onNotificationClicked = (payload: unknown) => {
      const candidate = parseCheckinPayload(payload)
        ?? parseCheckinPayload((payload as { notification?: { data?: unknown } })?.notification?.data);
      if (!candidate) {
        return;
      }
      pendingBannerClick = candidate;
      triggerEnter(candidate, 'notification');
      handleBannerClickAfterInitialize();
    };
    callbacksBound = true;
  };

  const ensureDeviceSettings = async (): Promise<boolean> => {
    try {
      let permission = await Geolocation.checkPermissions();
      if (!isPermissionGranted(permission)) {
        permission = await Geolocation.requestPermissions();
      }
      if (!isPermissionGranted(permission)) {
        geofencingEnabled = false;
        setStatus(Status.PERMISSION_DENIED, permission);
        return false;
      }
      await GeofencePlugin.initialize();
      geofencingEnabled = true;
      bindCallbacks();
      setStatus(Status.OK);
      return true;
    } catch (error) {
      geofencingEnabled = false;
      setStatus(Status.ERROR, error);
      return false;
    }
  };

  const reconfigure = (nextOptions?: GeofenceOptions): void => {
    if (!nextOptions) {
      return;
    }
    if (nextOptions.logger) {
      logger = nextOptions.logger;
    }
    options = {
      ...options,
      ...nextOptions,
      notificationConfig: {
        ...(options.notificationConfig ?? {}),
        ...(nextOptions.notificationConfig ?? {}),
      },
      geolocation: {
        ...(options.geolocation ?? {}),
        ...(nextOptions.geolocation ?? {}),
      },
    };
  };

  const initialize = async (nextOptions?: GeofenceOptions): Promise<void> => {
    reconfigure(nextOptions);
    if (status !== Status.OK) {
      await clearAll();
      await ensureDeviceSettings();
      logger.info(`[${MODULE}] Geofence initialized, state is ${status}.`);
    } else {
      logger.info(`[${MODULE}] Geofence already initialized.`);
    }
    handleBannerClickAfterInitialize();
  };

  const addGeofencedCheckin = async (checkinInfo: CheckinInfo): Promise<void> => {
    if (!geofencingEnabled) {
      return;
    }
    if (!setIfNotGeofenced(checkinInfo)) {
      return;
    }
    idCounter += 1;
    await GeofencePlugin.addOrUpdate({
      id: getGeofenceId(checkinInfo),
      latitude: checkinInfo.latitude,
      longitude: checkinInfo.longitude,
      radius: checkinInfo.radius,
      transitionType: TransitionType.ENTER,
      notification: {
        id: idCounter,
        openAppOnClick: true,
        data: checkinInfo,
        title: replaceVars(options.notificationConfig?.title ?? NOTIFICATION_TITLE, checkinInfo),
        text: replaceVars(options.notificationConfig?.text ?? NOTIFICATION_TEXT, checkinInfo),
        vibrate: options.notificationConfig?.vibration ?? NOTIFICATION_VIBRATION,
        ...(options.notificationConfig?.icons ?? {}),
      },
    });
    logger.info(`[${MODULE}] Check-in info added to geofence monitor`, checkinInfo);
  };

  const checkLocation = async (checkinInfo: CheckinInfo): Promise<boolean> => {
    if (status !== Status.OK) {
      throw new Error(`[${MODULE}] Location check can be called only after successful initialize.`);
    }
    try {
      validateCheckinInfo(checkinInfo);
    } catch (error) {
      logger.error(`[${MODULE}] Unable to check geofence`, error);
      return false;
    }
    if (checkinInfo.checkInPermission === CheckInPermission.CHECK_IN_NOT_ALLOWED) {
      logger.warn(`[${MODULE}] Check-in is not allowed for ${checkinInfo.logicalId}.`);
      return false;
    }
    startCheckLocation(checkinInfo);
    logger.info(`[${MODULE}] Checking actual position...`);
    try {
      const position = await getPosition();
      if (checkPosition(checkinInfo, position)) {
        logger.info(
          `[${MODULE}] checkLocation(${checkinInfo.logicalId}) -> inside geofence, immediate enter callback (no addOrUpdate).`,
        );
        triggerEnter(checkinInfo, 'position');
        return true;
      }
      logger.info(
        `[${MODULE}] checkLocation(${checkinInfo.logicalId}) -> outside geofence, adding native monitor via addOrUpdate.`,
      );
      await addGeofencedCheckin(checkinInfo);
      return true;
    } catch (error) {
      logger.error(`[${MODULE}] Getting current location for geofence failed`, error);
      return false;
    }
  };

  const getDebugInfos = async (): Promise<{
    position: Position['coords'] | null;
    checkinInfos: Array<{
      key: string;
      latitude: number;
      longitude: number;
      radius: number;
      distance: string;
    }>;
  }> => {
    const checkinInfos = geofencedCheckins.map((item) => item.checkinInfo);
    let position: Position | null = null;
    try {
      position = await getPosition();
    } catch (error) {
      logger.warn(`[${MODULE}] getDebugInfos: unable to resolve current position`, error);
    }

    if (!position) {
      return {
        position: null,
        checkinInfos: checkinInfos.map((checkin) => ({
          key: `${checkin.logicalId}-${checkin.name ?? ''}`,
          latitude: checkin.latitude,
          longitude: checkin.longitude,
          radius: checkin.radius,
          distance: 'n/a',
        })),
      };
    }

    return {
      position: position.coords,
      checkinInfos: checkinInfos.map((checkin) => {
        const distance = calcDistance(
          checkin.latitude,
          checkin.longitude,
          position.coords.latitude,
          position.coords.longitude,
        );
        return {
          key: `${checkin.logicalId}-${checkin.name ?? ''}`,
          latitude: checkin.latitude,
          longitude: checkin.longitude,
          radius: checkin.radius,
          distance: `${Math.round(distance)} mtrs`,
        };
      }),
    };
  };

  const geofenceArrivedToApp = (logicalId: string): void => {
    logger.info(`[${MODULE}] Geofence found and processed with id ${logicalId}.`);
    void clearAll();
  };

  return {
    initialize,
    reconfigure,
    checkLocation,
    getDebugInfos,
    geofenceArrivedToApp,
    isPlatformAndroid,
    Status,
    CheckInPermission,
    getStatus: () => status,
    hasGeofencedCheckin: () => geofencedCheckins.length > 0,
  };
}

export type GeofenceApi = ReturnType<typeof createGeofenceService>;
