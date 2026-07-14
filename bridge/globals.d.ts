// Ambient declarations for the native bridge build.

// Injected by Vite `define` at build time (scripts/build-bridge.js).
declare const __ENABLE_FIREBASE__: boolean;

export {};

declare global {
  interface Window {
    // Capacitor runtime
    Capacitor?: {
      getPlatform: () => string;
      isNativePlatform: () => boolean;
      [key: string]: unknown;
    };

    // Legacy bridge globals (kept for iadp-webui compatibility)
    FileDownload?: unknown;
    CsiFirebase?: unknown;
    Geofence?: unknown;
    CsiBackground?: unknown;
    HandleInAppBrowser?: unknown;
    device?: {
      platform?: string;
      uuid?: string;
      model?: string;
      manufacturer?: string;
      version?: string;
    };
  }
}
