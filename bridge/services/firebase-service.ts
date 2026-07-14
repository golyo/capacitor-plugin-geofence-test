import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { FirebaseAnalytics } from '@capacitor-firebase/analytics';
import { FirebaseCrashlytics } from '@capacitor-firebase/crashlytics';
import { populateDeviceGlobal, type DeviceDescriptor } from './device-service';
import { resolveLogger, type Logger } from '../utils/logger';

/**
 * Replaces Cordova firebase.js (cordova-plugin-firebasex -> @capacitor-firebase/*).
 * Preserves the public window.CsiFirebase API:
 *   initialize, getToken, getNotHandledMessage, clearAllNotifications,
 *   setBadgeNumber, setScreenName, logEvent, deleteInstanceId.
 */
const MODULE = 'CsiFirebase';
const LOCAL_STORAGE_KEY = 'CsiFirebaseToken';
const FIREBASE_MSG_RECEIVED = 'firebase_msg_received';
const FIREBASE_TOKEN_REFRESH = 'firebase_token_refresh';
const GET_TOKEN_MAX_TRY = 8;
const GET_TOKEN_TIMEOUT = 1000;

let logger: Logger = console;
let notHandledMessage: { detail: unknown } | null = null;

export interface FirebaseInitOptions {
  logger?: Logger;
  useCrashlytics?: boolean;
  useAnalytics?: boolean;
}

export function getNotHandledMessage(): { detail: unknown } | null {
  const message = notHandledMessage;
  notHandledMessage = null;
  return message;
}

async function requestToken(): Promise<string | null> {
  try {
    const { token } = await FirebaseMessaging.getToken();
    window.localStorage.setItem(LOCAL_STORAGE_KEY, token);
    logger.info(`[${MODULE}] Firebase token`, token);
    return token;
  } catch (error) {
    logger.warn(`[${MODULE}] getToken failed`, error);
    return window.localStorage.getItem(LOCAL_STORAGE_KEY);
  }
}

export async function getToken(): Promise<string | null> {
  let tryCount = 0;
  do {
    // eslint-disable-next-line no-await-in-loop
    const token = await requestToken();
    if (token) return token;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => window.setTimeout(r, GET_TOKEN_TIMEOUT));
    tryCount += 1;
  } while (tryCount !== GET_TOKEN_MAX_TRY);
  return null;
}

function triggerMsgReceivedEvent(message: Record<string, unknown>) {
  if ('geofence.notification.data' in message) {
    // geofence messages are handled by the geofence module
    return;
  }
  notHandledMessage = { detail: message };
  window.dispatchEvent(new window.CustomEvent(FIREBASE_MSG_RECEIVED, notHandledMessage));
}

async function checkNotificationPermission(requested = false): Promise<void> {
  const { receive } = await FirebaseMessaging.checkPermissions();
  const hasPermission = receive === 'granted';
  logger.info(`[${MODULE}] Permission was ${hasPermission ? 'granted' : 'denied'}`);
  if (hasPermission) {
    await getToken();
  } else if (!requested) {
    const { receive: afterRequest } = await FirebaseMessaging.requestPermissions();
    if (afterRequest === 'granted') {
      await getToken();
    }
  }
}

export async function initialize(options?: FirebaseInitOptions): Promise<DeviceDescriptor> {
  logger = resolveLogger(options);

  if (options?.useCrashlytics) {
    await FirebaseCrashlytics.setEnabled({ enabled: true });
    logger.info(`[${MODULE}] Crashlytics collection enabled`);
  }
  if (options?.useAnalytics) {
    await FirebaseAnalytics.setEnabled({ enabled: true });
    logger.info(`[${MODULE}] Analytics collection enabled`);
  }

  await checkNotificationPermission(false);

  await FirebaseMessaging.addListener('notificationReceived', (event) => {
    logger.info(`[${MODULE}] push notification arrived`, event);
    triggerMsgReceivedEvent((event.notification ?? {}) as Record<string, unknown>);
  });

  await FirebaseMessaging.addListener('tokenReceived', (event) => {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, event.token);
    window.dispatchEvent(new window.CustomEvent(FIREBASE_TOKEN_REFRESH, { detail: event.token }));
  });

  // Global JS error handler -> Crashlytics (mirrors Cordova firebase.js).
  window.onerror = function (errorMsg, url, line, col) {
    const appRootURL = window.location.href.replace('index.html', '');
    const message = `${String(errorMsg)}: url=${String(url).replace(appRootURL, '')}; line=${line}; col=${col}`;
    FirebaseCrashlytics.recordException({ message }).catch(() => undefined);
    return false;
  };

  return populateDeviceGlobal();
}

export async function clearAllNotifications(): Promise<void> {
  await FirebaseMessaging.removeAllDeliveredNotifications();
}

export async function setBadgeNumber(count: number): Promise<void> {
  try {
    // Badge support varies by plugin version; call it only when available.
    const messaging = FirebaseMessaging as unknown as {
      setBadgeCount?: (options: { count: number }) => Promise<void>;
    };
    if (messaging.setBadgeCount) {
      await messaging.setBadgeCount({ count });
      logger.debug(`[${MODULE}] setBadgeNumber success to ${count}`);
    } else {
      logger.debug(`[${MODULE}] setBadgeNumber unsupported by messaging plugin`);
    }
  } catch (error) {
    logger.warn(`[${MODULE}] setBadgeNumber failed`, error);
  }
}

export async function setScreenName(screenName: string): Promise<void> {
  try {
    await FirebaseAnalytics.setCurrentScreen({ screenName });
    logger.debug(`[${MODULE}] setScreenName success to ${screenName}`);
  } catch (error) {
    logger.warn(`[${MODULE}] setScreenName failed`, error);
  }
}

export async function logEvent(name: string, params?: Record<string, unknown>): Promise<void> {
  try {
    await FirebaseAnalytics.logEvent({ name, params });
    logger.debug(`[${MODULE}] logEvent success to ${name}`);
  } catch (error) {
    logger.warn(`[${MODULE}] logEvent failed`, error);
  }
}

export async function deleteInstanceId(): Promise<void> {
  logger.info(`[${MODULE}] deleteToken() called`);
  await FirebaseMessaging.deleteToken();
}
