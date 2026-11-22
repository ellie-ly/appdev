import type { RosterStudent, TimeSlot, AttendanceCode } from '../types';

export const DAYS_ORDER: TimeSlot['day'][] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const DAY_ABBR: Record<TimeSlot['day'], string> = {
  Monday: 'M',
  Tuesday: 'T',
  Wednesday: 'W',
  Thursday: 'TH',
  Friday: 'F',
  Saturday: 'S',
};

export const QR_BG_PRESETS = [
  { name: 'Crisp White', value: '#FFFFFF' },
  { name: 'Ice Blue', value: '#EFF6FF' },
  { name: 'Soft Slate', value: '#F1F5F9' },
  { name: 'Warm Cream', value: '#FEFCE8' },
];

export const QR_FG_PRESETS = [
  { name: 'Deep Navy', value: '#0F172A' },
  { name: 'Royal Blue', value: '#2563EB' },
  { name: 'Indigo', value: '#3730A3' },
  { name: 'Emerald Dark', value: '#065F46' },
];

export function sortRosterAZ(students: RosterStudent[]): RosterStudent[] {
  return [...students].sort((a, b) => {
    const lastCmp = a.last_name.localeCompare(b.last_name, undefined, { sensitivity: 'base' });
    if (lastCmp !== 0) return lastCmp;
    return a.first_name.localeCompare(b.first_name, undefined, { sensitivity: 'base' });
  });
}

export interface SessionColumn {
  isoDate: string;
  shortLabel: string;
  dayAbbr: string;
  week: number;
}

export function getSessionColumnsForMonth(
  yearMonth: string, // "YYYY-MM"
  slots: TimeSlot[],
  weekFilter: string // "ALL" | "1" | "2" | "3" | "4" | "5"
): SessionColumn[] {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month) return [];

  const daysInMonth = new Date(year, month, 0).getDate();
  const activeDays = new Set(slots.map((s) => s.day));
  const cols: SessionColumn[] = [];

  for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
    const dt = new Date(year, month - 1, dayNum);
    const jsDay = dt.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
    const dayName: TimeSlot['day'] | null =
      jsDay === 1
        ? 'Monday'
        : jsDay === 2
        ? 'Tuesday'
        : jsDay === 3
        ? 'Wednesday'
        : jsDay === 4
        ? 'Thursday'
        : jsDay === 5
        ? 'Friday'
        : jsDay === 6
        ? 'Saturday'
        : null;

    if (dayName && activeDays.has(dayName)) {
      const week = Math.ceil(dayNum / 7);
      if (weekFilter === 'ALL' || String(week) === weekFilter) {
        const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
        const shortLabel = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        cols.push({
          isoDate,
          shortLabel,
          dayAbbr: DAY_ABBR[dayName],
          week,
        });
      }
    }
  }

  return cols;
}

/**
 * Computes attendance status based on minutes elapsed since class start time:
 * - <= 15 mins: 'P' (Present)
 * - 16 to 30 mins: 'L' (Late)
 * - > 30 mins: 'A' (Absent / Locked)
 */
export function evaluateScanStatus(
  startTimeHHmm: string,
  scanDate: Date = new Date()
): { status: AttendanceCode; minutesElapsed: number; locked: boolean } {
  const [hStr, mStr] = startTimeHHmm.split(':');
  const startDt = new Date(scanDate);
  startDt.setHours(Number(hStr || 0), Number(mStr || 0), 0, 0);

  const diffMins = Math.floor((scanDate.getTime() - startDt.getTime()) / 60000);

  if (diffMins <= 15) {
    return { status: 'P', minutesElapsed: diffMins, locked: false };
  }
  if (diffMins <= 30) {
    return { status: 'L', minutesElapsed: diffMins, locked: false };
  }
  return { status: 'A', minutesElapsed: diffMins, locked: true };
}