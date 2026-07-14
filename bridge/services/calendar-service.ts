import { CapacitorCalendar } from '@ebarooni/capacitor-calendar';
import { parseICS, validateEvents, type CalendarEvent } from '../utils/ical-parser';
import { resolveLogger, type Logger } from '../utils/logger';

/**
 * Replaces the calendar portion of Cordova fileDownload.js:
 *   cordova-plugin-calendar -> @ebarooni/capacitor-calendar
 *
 * Preserves the public flow used by the web app: checkAndRequestCalendarPermission()
 * and processICS(startDate, endDate, icsData).
 */
const CALENDAR_NAME = 'IADP';

export interface CalendarServiceOptions {
  logger?: Logger;
}

export async function checkAndRequestCalendarPermission(options?: CalendarServiceOptions): Promise<boolean> {
  const logger = resolveLogger(options);
  try {
    const { result } = await CapacitorCalendar.requestAllPermissions();
    // The plugin returns an object of permission states; treat all-granted as true.
    const granted = Object.values(result ?? {}).every((v) => v === 'granted');
    logger.info(`[FileDownload] Calendar permission ${granted ? 'granted' : 'denied'}`);
    return granted;
  } catch (error) {
    logger.error('[FileDownload] Error requesting calendar permission:', error);
    throw new Error('Error requesting calendar permission');
  }
}

async function getOrCreateCalendarId(logger: Logger): Promise<string> {
  const { result: calendars } = await CapacitorCalendar.listCalendars();
  const existing = calendars.find((c) => (c as { title?: string }).title === CALENDAR_NAME);
  if (existing) {
    return existing.id;
  }
  logger.info(`[FileDownload] Creating calendar "${CALENDAR_NAME}"`);
  const { id } = await CapacitorCalendar.createCalendar({ title: CALENDAR_NAME });
  return id;
}

async function getAllEventsFromCalendar(
  calendarId: string,
  startDate: string,
  endDate: string,
): Promise<Array<{ id: string }>> {
  const from = new Date(...String(startDate).split('-').map((v, i) => +v - (i === 1 ? 1 : 0)) as [number, number, number], 0, 0);
  const to = new Date(...String(endDate).split('-').map((v, i) => +v - (i === 1 ? 1 : 0)) as [number, number, number], 23, 59);

  const { result } = await CapacitorCalendar.listEventsInRange({
    from: from.getTime(),
    to: to.getTime(),
  });
  // The plugin lists across calendars; keep only events in the IADP calendar.
  return (result ?? []).filter((e) => e.calendarId === calendarId);
}

async function deleteEvents(events: Array<{ id: string }>, logger: Logger): Promise<void> {
  for (const event of events) {
    try {
      await CapacitorCalendar.deleteEvent({ id: event.id });
    } catch (err) {
      logger.error('[FileDownload] Error deleting event', event.id, err);
    }
  }
}

async function addEvents(events: CalendarEvent[], calendarId: string, logger: Logger): Promise<void> {
  for (const event of events) {
    try {
      await CapacitorCalendar.createEvent({
        title: event.title,
        calendarId,
        location: event.location,
        description: event.notes,
        startDate: event.startDate ? event.startDate.getTime() : undefined,
        endDate: event.endDate ? event.endDate.getTime() : undefined,
      });
    } catch (err) {
      logger.error('[FileDownload] Error adding event', event.title, err);
    }
  }
}

/**
 * Full roster-sync flow, mirroring fileDownload.js processICS().
 */
export async function processICS(
  startDate: string,
  endDate: string,
  icsData: string,
  options?: CalendarServiceOptions,
): Promise<string> {
  const logger = resolveLogger(options);

  const events = parseICS(icsData);
  if (!events) {
    logger.error("The chosen period doesn't have any duties");
    throw new Error("The chosen period doesn't have any duties");
  }
  logger.info('[FileDownload] Parsing ICS was successful');

  const validationResults = validateEvents(events);
  const invalidEvents = validationResults.filter((r) => !r.isValid);
  if (invalidEvents.length > 0) {
    logger.error(
      `Validation errors:\n${invalidEvents
        .map((e) => `Event: ${e.event.title}\n- ${e.errors.join('\n- ')}`)
        .join('\n\n')}`,
    );
    throw new Error('Problem encountered during Calendar update.');
  }
  logger.info('[FileDownload] Validating ICS was successful');

  const calendarId = await getOrCreateCalendarId(logger);

  const existingEvents = await getAllEventsFromCalendar(calendarId, startDate, endDate);
  logger.info('[FileDownload] Existing events', existingEvents);
  if (existingEvents.length > 0) {
    await deleteEvents(existingEvents, logger);
    logger.info('[FileDownload] Deletion was successful');
  }

  await addEvents(events, calendarId, logger);
  logger.info('[FileDownload] Your Calendar is updated.');
  return 'Your Calendar is updated.';
}
