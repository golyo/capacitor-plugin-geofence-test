import { createAppStateService } from '../services/app-state-service';
import { populateDeviceGlobal } from '../services/device-service';

/**
 * IIFE entry -> emits background.js. Registers window.CsiBackground (replacing
 * Cordova background.js) and populates window.device (replacing
 * cordova-plugin-device). This file is always injected, so it is responsible for
 * the device global that other modules and the web app rely on.
 */
const service = createAppStateService();
window.CsiBackground = service;

void service.initialize();
void populateDeviceGlobal().catch((err) => console.warn('[CsiBackground] device init failed', err));
