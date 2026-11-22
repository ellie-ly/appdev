export type Role = 'teacher' | 'student';
export type AttendanceCode = 'P' | 'L' | 'A';

export interface TimeSlot {
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
  start: string; // "HH:mm" e.g. "09:00"
  end: string;   // "HH:mm" e.g. "10:30"
}

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  email: string;
  school_id: string;
  department_or_course: string;
  year_level?: number | null;
  section?: string | null;
  qr_bg_color: string;
  qr_fg_color: string;
}

export interface ScheduleItem {
  id: string;
  owner_id: string;
  code: string;
  title: string;
  section: string;
  room: string;
  slots: TimeSlot[];
}

export interface RosterStudent {
  id: string;
  schedule_id: string;
  student_number: string;
  last_name: string;
  first_name: string;
  middle_initial?: string | null;
  course?: string | null;
  year_level?: number | null;
  section?: string | null;
}

export interface AttendanceRecord {
  id: string;
  schedule_id: string;
  student_number: string;
  session_date: string; // YYYY-MM-DD
  status: AttendanceCode;
}