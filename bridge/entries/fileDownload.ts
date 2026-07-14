import { downloadAndOpenFile, type DownloadAndOpenOptions } from '../services/file-service';
import {
  processICS,
  checkAndRequestCalendarPermission,
  type CalendarServiceOptions,
} from '../services/calendar-service';
import { defaultLogger, type Logger } from '../utils/logger';

/**
 * IIFE entry -> emits fileDownload.js. Registers window.FileDownload (replacing
 * Cordova fileDownload.js): file download/open + calendar roster sync.
 */
let logger: Logger = defaultLogger;

const withLogger = <T extends { logger?: Logger }>(opts?: T): T =>
  ({ logger, ...(opts ?? {}) }) as T;

window.FileDownload = {
  initialize(options?: { logger?: Logger }) {
    logger = options?.logger ?? logger;
    logger.info('[FileDownload] initialized');
  },
  downloadAndOpenFile: (filename: string, data: string, mimeType: string, options?: DownloadAndOpenOptions) =>
    downloadAndOpenFile(filename, data, mimeType, withLogger(options)),
  processICS: (startDate: string, endDate: string, icsData: string, options?: CalendarServiceOptions) =>
    processICS(startDate, endDate, icsData, withLogger(options)),
  checkAndRequestCalendarPermission: (options?: CalendarServiceOptions) =>
    checkAndRequestCalendarPermission(withLogger(options)),
};
