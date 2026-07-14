export interface CalendarEvent {
  title: string;
  location: string;
  notes: string;
  startDate: Date | null;
  endDate: Date | null;
}

export interface ValidationResult {
  event: CalendarEvent;
  isValid: boolean;
  errors: string[];
  index: number;
}

/**
 * Parse an ICS datetime string (e.g. "20201227T004400") into a JS Date.
 * Mirrors the Cordova fileDownload.js parseICSTime().
 */
export function parseICSTime(dt: string | undefined | null): Date | null {
  if (!dt) return null;
  const iso =
    `${dt.substring(0, 4)}-${dt.substring(4, 6)}-${dt.substring(6, 8)}` +
    `T${dt.substring(9, 11)}:${dt.substring(11, 13)}:${dt.substring(13, 15)}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Parse raw ICS text into CalendarEvent objects. Mirrors fileDownload.js parseICS().
 */
export function parseICS(icsData: string): CalendarEvent[] | null {
  if (!icsData) return null;

  const events: CalendarEvent[] = [];
  const blocks = icsData.split('BEGIN:VEVENT').slice(1);

  for (const block of blocks) {
    const title = block.match(/SUMMARY:(.*?)(?=\r?\n)/)?.[1]?.trim() ?? '';

    const rawNotes = block.match(/DESCRIPTION:([\s\S]*?)SEQUENCE:/)?.[1] ?? '';
    const notes = rawNotes
      .replace(/\\n/g, '\n')
      .replace(/\n /g, '') // iCal line folding
      .replace(/↵/g, '')
      .replace(/\r/g, '')
      .replace(/\\,/g, ',')
      .trim();

    const startDate = parseICSTime(block.match(/DTSTART:(\d{8}T\d{6})/)?.[1]);
    const endDate = parseICSTime(block.match(/DTEND:(\d{8}T\d{6})/)?.[1]);

    events.push({ title, location: '', notes, startDate, endDate });
  }

  return events.length > 0 ? events : null;
}

/**
 * Validate parsed events. Mirrors fileDownload.js validate().
 */
export function validateEvents(events: CalendarEvent[]): ValidationResult[] {
  return events.map((event, index) => {
    const errors: string[] = [];
    if (!event.title) errors.push('Title is missing.');
    if (!event.startDate || Number.isNaN(event.startDate.getTime())) errors.push('Invalid start date.');
    if (!event.endDate || Number.isNaN(event.endDate.getTime())) errors.push('Invalid end date.');
    return { event, isValid: errors.length === 0, errors, index };
  });
}
