import {
  initialize,
  getToken,
  getNotHandledMessage,
  clearAllNotifications,
  setBadgeNumber,
  setScreenName,
  logEvent,
  deleteInstanceId,
} from '../services/firebase-service';

/**
 * IIFE entry -> emits firebase.js. Registers window.CsiFirebase (replacing
 * Cordova firebase.js). Only built/injected when Firebase is enabled
 * (see scripts/build-bridge.js).
 */
window.CsiFirebase = {
  initialize,
  getToken,
  getNotHandledMessage,
  clearAllNotifications,
  setBadgeNumber,
  setScreenName,
  logEvent,
  deleteInstanceId,
};
