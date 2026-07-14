import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';
import { Capacitor } from '@capacitor/core';
import { resolveLogger, type Logger } from '../utils/logger';

/**
 * Replaces the file download/open portion of Cordova fileDownload.js:
 *   - cordova-plugin-file (write)          -> @capacitor/filesystem
 *   - cordova-plugin-file-opener2 (open)   -> @capacitor-community/file-opener
 *
 * The Cordova version wrote a raw string; Capacitor's Filesystem writes base64
 * or utf8. The web app passes textual data (e.g. PDF base64 or ICS text), so we
 * default to writing the provided data as-is (utf8) unless it is base64.
 */
function getPlatformDirectory(): Directory {
  const platform = Capacitor.getPlatform();
  if (platform === 'android') return Directory.External;
  // iOS: Documents (matches Cordova documentsDirectory / iosPersistentFileLocation=Library intent)
  return Directory.Documents;
}

export interface DownloadAndOpenOptions {
  /** When true, `data` is treated as base64 (e.g. binary PDFs). */
  base64?: boolean;
  logger?: Logger;
}

export async function downloadAndOpenFile(
  filename: string,
  data: string,
  mimeType: string,
  options?: DownloadAndOpenOptions,
): Promise<string> {
  const logger = resolveLogger(options);
  const directory = getPlatformDirectory();

  try {
    const writeResult = await Filesystem.writeFile({
      path: filename,
      data,
      directory,
      // No encoding => data is treated as base64 (binary, e.g. PDFs).
      ...(options?.base64 ? {} : { encoding: Encoding.UTF8 }),
    });

    await FileOpener.open({
      filePath: writeResult.uri,
      contentType: mimeType,
    });

    return 'File opened successfully';
  } catch (err) {
    logger.error(`Error during file operation: ${err}`);
    throw new Error(`Error during file operation: ${err}`);
  }
}
