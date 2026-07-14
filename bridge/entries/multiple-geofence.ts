import { createGeofenceService } from '../services/geofence-service';

/**
 * IIFE entry -> emits multiple-geofence.js. Registers window.Geofence
 * (replacing Cordova multiple-geofence.js). Native monitoring and
 * enter/exit notifications are handled by capacitor-plugin-geofence.
 */
window.Geofence = createGeofenceService();
