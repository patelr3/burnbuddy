import type { WorkoutSchedule } from '@burnbuddy/shared';

const DAY_MAP: Record<WorkoutSchedule['days'][number], string> = {
  Mon: 'MO',
  Tue: 'TU',
  Wed: 'WE',
  Thu: 'TH',
  Fri: 'FR',
  Sat: 'SA',
  Sun: 'SU',
};

/**
 * Generates a valid RFC 5545 .ics calendar string from a workout schedule.
 */
export function generateIcs(options: {
  days: WorkoutSchedule['days'];
  time?: string;
  title: string;
}): string {
  const { days, time, title } = options;
  const byDay = days.map((d) => DAY_MAP[d]).join(',');
  const uid = `burnbuddy-${Date.now()}@burnbuddy.app`;
  const now = formatDateTimeUTC(new Date());

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BurnBuddy//Workout Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  lines.push('BEGIN:VEVENT');
  lines.push(`UID:${uid}`);
  lines.push(`DTSTAMP:${now}`);
  lines.push(`SUMMARY:${title}`);

  if (time) {
    // Timed event: DTSTART with time, DTEND 1 hour later
    const [hours, minutes] = time.split(':').map(Number);
    const start = new Date();
    start.setUTCHours(hours!, minutes, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    lines.push(`DTSTART:${formatDateTimeUTC(start)}`);
    lines.push(`DTEND:${formatDateTimeUTC(end)}`);
  } else {
    // All-day event
    const today = new Date();
    lines.push(`DTSTART;VALUE=DATE:${formatDateOnly(today)}`);
    lines.push(`DTEND;VALUE=DATE:${formatDateOnly(today)}`);
  }

  lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${byDay}`);

  // 30-minute reminder
  lines.push('BEGIN:VALARM');
  lines.push('TRIGGER:-PT30M');
  lines.push('ACTION:DISPLAY');
  lines.push('DESCRIPTION:Workout reminder');
  lines.push('END:VALARM');

  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

function formatDateTimeUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const s = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${d}T${h}${min}${s}Z`;
}

function formatDateOnly(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}
