/**
 * IIFE entry -> emits inappbrowser.js. Replaces Cordova handleInAppBrowser.js +
 * cordova-plugin-inappbrowser with @capgo/inappbrowser.
 *
 * NOTE: OIDC handling is now managed by the appframe runtime bundle.
 * The bridge OIDC services have been removed as they were unused.
 */
window.HandleInAppBrowser = {
  closeBrowser: () => {
    // InAppBrowser is managed by appframe and @capgo/inappbrowser plugin
    console.log('[HandleInAppBrowser] closeBrowser called');
  },
};
