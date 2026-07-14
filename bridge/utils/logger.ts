export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/**
 * Default logger. The Cordova modules accepted an injected logger via
 * `initialize({ logger })`; the bridge keeps that contract and falls back to
 * the console.
 */
export const defaultLogger: Logger = console;

export function resolveLogger(options?: { logger?: Logger }): Logger {
  return options?.logger ?? defaultLogger;
}
