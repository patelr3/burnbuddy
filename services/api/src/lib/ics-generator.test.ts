import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateIcs, formatDateTimeLocal } from './ics-generator';

describe('ics-generator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('generateIcs without timezone (UTC fallback)', () => {
    it('produces DTSTART/DTEND with Z suffix for timed events', () => {
      const ics = generateIcs({
        days: ['Mon', 'Wed', 'Fri'],
        time: '07:00',
        title: 'Morning Workout',
      });

      expect(ics).toContain('DTSTART:');
      expect(ics).toContain('T070000Z');
      expect(ics).toContain('T080000Z');
      expect(ics).not.toContain('VTIMEZONE');
      expect(ics).not.toContain('TZID');
    });

    it('produces VALUE=DATE for all-day events', () => {
      const ics = generateIcs({
        days: ['Sat'],
        title: 'Weekend Run',
      });

      expect(ics).toContain('DTSTART;VALUE=DATE:');
      expect(ics).not.toContain('VTIMEZONE');
    });
  });

  describe('generateIcs with timezone', () => {
    it('includes VTIMEZONE block with correct TZID and X-LIC-LOCATION', () => {
      const ics = generateIcs({
        days: ['Mon', 'Wed'],
        time: '07:00',
        title: 'Morning Workout',
        timezone: 'America/New_York',
      });

      expect(ics).toContain('BEGIN:VTIMEZONE');
      expect(ics).toContain('TZID:America/New_York');
      expect(ics).toContain('X-LIC-LOCATION:America/New_York');
      expect(ics).toContain('END:VTIMEZONE');
    });

    it('uses TZID parameter on DTSTART and DTEND instead of Z suffix', () => {
      const ics = generateIcs({
        days: ['Mon'],
        time: '07:00',
        title: 'Morning Workout',
        timezone: 'America/New_York',
      });

      expect(ics).toContain('DTSTART;TZID=America/New_York:');
      expect(ics).toContain('DTEND;TZID=America/New_York:');
      // Should NOT have Z suffix on timezone-aware times
      expect(ics).not.toMatch(/DTSTART.*Z\r?\n/);
      expect(ics).not.toMatch(/DTEND.*Z\r?\n/);
    });

    it('schedule time 07:00 with timezone results in T070000 local time', () => {
      const ics = generateIcs({
        days: ['Mon'],
        time: '07:00',
        title: 'Morning Workout',
        timezone: 'America/New_York',
      });

      expect(ics).toMatch(/DTSTART;TZID=America\/New_York:\d{8}T070000/);
      expect(ics).toMatch(/DTEND;TZID=America\/New_York:\d{8}T080000/);
    });

    it('works with different timezone values', () => {
      const timezones = ['Europe/London', 'Asia/Tokyo', 'Pacific/Auckland'];

      for (const tz of timezones) {
        const ics = generateIcs({
          days: ['Tue', 'Thu'],
          time: '18:30',
          title: 'Evening Session',
          timezone: tz,
        });

        expect(ics).toContain(`TZID:${tz}`);
        expect(ics).toContain(`X-LIC-LOCATION:${tz}`);
        expect(ics).toContain(`DTSTART;TZID=${tz}:`);
        expect(ics).toContain(`DTEND;TZID=${tz}:`);
        expect(ics).toContain('BEGIN:VTIMEZONE');
        expect(ics).toContain('END:VTIMEZONE');
      }
    });

    it('does not affect all-day events even when timezone is provided', () => {
      const ics = generateIcs({
        days: ['Sat'],
        title: 'Weekend Run',
        timezone: 'America/Chicago',
      });

      // All-day events use VALUE=DATE, no TZID on the date
      expect(ics).toContain('DTSTART;VALUE=DATE:');
      // VTIMEZONE is still included (part of the calendar)
      expect(ics).toContain('BEGIN:VTIMEZONE');
    });
  });

  describe('formatDateTimeLocal', () => {
    it('produces YYYYMMDDTHHmmss without Z suffix', () => {
      const date = new Date('2026-03-09T07:00:00Z');
      const result = formatDateTimeLocal(date);

      expect(result).toBe('20260309T070000');
      expect(result).not.toContain('Z');
    });

    it('pads single-digit months and hours', () => {
      const date = new Date('2026-01-05T03:05:09Z');
      const result = formatDateTimeLocal(date);

      expect(result).toBe('20260105T030509');
    });
  });

  describe('ICS structure validity', () => {
    it('starts with BEGIN:VCALENDAR and ends with END:VCALENDAR', () => {
      const ics = generateIcs({
        days: ['Mon'],
        time: '09:00',
        title: 'Test',
        timezone: 'America/New_York',
      });

      expect(ics).toMatch(/^BEGIN:VCALENDAR/);
      expect(ics).toMatch(/END:VCALENDAR$/);
    });

    it('VTIMEZONE appears before VEVENT', () => {
      const ics = generateIcs({
        days: ['Mon'],
        time: '09:00',
        title: 'Test',
        timezone: 'US/Eastern',
      });

      const vtimezoneIndex = ics.indexOf('BEGIN:VTIMEZONE');
      const veventIndex = ics.indexOf('BEGIN:VEVENT');
      expect(vtimezoneIndex).toBeLessThan(veventIndex);
    });
  });
});
