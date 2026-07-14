import { App } from '@capacitor/app';
import { resolveLogger, type Logger } from '../utils/logger';

/**
 * Replaces the Cordova `background.js` module (window.CsiBackground).
 * Cordova used the document 'pause'/'resume' events; Capacitor exposes the same
 * information via @capacitor/app 'appStateChange' ({ isActive }).
 */
export interface AppStateApi {
  isInBackground: () => boolean;
  initialize: () => Promise<void>;
  backgroundListener: (cb: (inBackground: boolean) => void) => void;
}

export function createAppStateService(options?: { logger?: Logger }): AppStateApi {
  const logger = resolveLogger(options);
  let inBackground = false;
  let callback: ((inBackground: boolean) => void) | undefined;

  const notify = () => {
    if (callback) callback(inBackground);
  };

  return {
    isInBackground: () => inBackground,

    async initialize() {
      inBackground = false;
      await App.addListener('appStateChange', ({ isActive }) => {
        inBackground = !isActive;
        logger.debug('[CsiBackground] appStateChange, inBackground =', inBackground);
        notify();
      });
    },

    backgroundListener(cb) {
      callback = cb;
    },
  };
}
