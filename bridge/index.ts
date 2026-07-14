/**
 * Public bridge API — the import contract the iadp-webui app will consume when
 * it migrates off the injected window.* globals.
 *
 * Until then, the IIFE entries in bridge/entries/* register the same behaviour
 * on window.* so the existing web app keeps working unchanged.
 */
export * as fileService from './services/file-service';
export * as calendarService from './services/calendar-service';
export * as firebaseService from './services/firebase-service';
export { createGeofenceService } from './services/geofence-service';
export type { GeofenceApi, CheckinInfo, GeofenceOptions } from './services/geofence-service';
export { createAppStateService } from './services/app-state-service';
export { populateDeviceGlobal, getPlatform, isNativePlatform } from './services/device-service';
export * from './utils/ical-parser';
export type { Logger } from './utils/logger';
