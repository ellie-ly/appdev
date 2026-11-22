import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  LayoutDashboard,
  Calendar,
  QrCode,
  FileSpreadsheet,
  Settings,
  LogOut,
  Plus,
  Eye,
  Download,
  Moon,
  Sun,
  ArrowLeft,
  Save,
  X,
  Camera,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import type {
  Role,
  Profile,
  ScheduleItem,
  RosterStudent,
  AttendanceRecord,
  TimeSlot,
} from './types';
import {
  DAYS_ORDER,
  DAY_ABBR,
  QR_BG_PRESETS,
  QR_FG_PRESETS,
  sortRosterAZ,
  getSessionColumnsForMonth,
  evaluateScanStatus,
} from './utils/attendance';

const COURSES = ['BSIT', 'BSCS', 'BSIS', 'BSED', 'BSBA'];
const YEARS = [1, 2, 3, 4];
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

function getSectionsForYear(year: number): string[] {
  return LETTERS.map((ltr) => `${year}-${ltr}`);
}

export default function App() {
  // Auth & Theme
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  // Auth Form Fields
  const [roleInput, setRoleInput] = useState<Role>('student');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [fullNameInput, setFullNameInput] = useState('');
  const [schoolIdInput, setSchoolIdInput] = useState('');
  const [courseInput, setCourseInput] = useState('BSIT');
  const [yearInput, setYearInput] = useState<number>(2);
  const [sectionInput, setSectionInput] = useState('2-A');
  const [authError, setAuthError] = useState<string | null>(null);

  // Portal Navigation
  const [activeTab, setActiveTab] = useState<'dashboard' | 'schedules' | 'qr' | 'reports' | 'settings'>('dashboard');
  const [selectedRosterId, setSelectedRosterId] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // Data
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [rosterMap, setRosterMap] = useState<Record<string, RosterStudent[]>>({});
  const [records, setRecords] = useState<AttendanceRecord[]>([]);

  // Schedule Modal State
  const [showSchedModal, setShowSchedModal] = useState(false);
  const [schedCode, setSchedCode] = useState('');
  const [schedTitle, setSchedTitle] = useState('');
  const [schedSection, setSchedSection] = useState('2-A');
  const [schedRoom, setSchedRoom] = useState('');
  const [schedSlots, setSchedSlots] = useState<TimeSlot[]>([
    { day: 'Monday', start: '09:00', end: '10:30' },
  ]);

  // Add & Edit Student State (Teacher Roster)
  const [newStuNum, setNewStuNum] = useState('');
  const [newStuLast, setNewStuLast] = useState('');
  const [newStuFirst, setNewStuFirst] = useState('');
  const [newStuMi, setNewStuMi] = useState('');
  const [editingStudent, setEditingStudent] = useState<RosterStudent | null>(null);

  // QR Scanner State (Teacher)
  const [scanScheduleId, setScanScheduleId] = useState<string>('');
  const [manualQrInput, setManualQrInput] = useState('');
  const [scanStatusMsg, setScanStatusMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const qrContainerRef = useRef<HTMLDivElement | null>(null);

  // Report Filters
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const [reportMonth, setReportMonth] = useState(currentMonthStr);
  const [reportWeek, setReportWeek] = useState('ALL');
  const [reportDate, setReportDate] = useState('');

  // Settings Form State
  const [editName, setEditName] = useState('');
  const [editDeptOrCourse, setEditDeptOrCourse] = useState('');
  const [editYear, setEditYear] = useState<number>(1);
  const [editSection, setEditSection] = useState('1-A');
  const [editQrBg, setEditQrBg] = useState('#FFFFFF');
  const [editQrFg, setEditQrFg] = useState('#0F172A');
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Sync dark mode class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // Check initial session
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id ?? null;
      setSessionUserId(uid);
      if (uid) loadUserData(uid);
      else setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      setSessionUserId(uid);
      if (uid) loadUserData(uid);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadUserData(uid: string) {
    setLoading(true);
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', uid).single();
    if (prof) {
      setProfile(prof as Profile);
      setEditName(prof.full_name);
      setEditDeptOrCourse(prof.department_or_course || '');
      setEditYear(prof.year_level || 1);
      setEditSection(prof.section || '1-A');
      setEditQrBg(prof.qr_bg_color || '#FFFFFF');
      setEditQrFg(prof.qr_fg_color || '#0F172A');
    }

    const { data: schedRows } = await supabase
      .from('schedules')
      .select('*')
      .order('created_at', { ascending: false });

    const loadedSchedules = (schedRows || []) as ScheduleItem[];
    setSchedules(loadedSchedules);
    if (loadedSchedules.length > 0 && !scanScheduleId) {
      setScanScheduleId(loadedSchedules[0].id);
    }

    const { data: rosterRows } = await supabase.from('roster_students').select('*');
    const grouped: Record<string, RosterStudent[]> = {};
    for (const r of (rosterRows || []) as RosterStudent[]) {
      if (!grouped[r.schedule_id]) grouped[r.schedule_id] = [];
      grouped[r.schedule_id].push(r);
    }
    Object.keys(grouped).forEach((k) => {
      grouped[k] = sortRosterAZ(grouped[k]);
    });
    setRosterMap(grouped);

    const { data: attRows } = await supabase.from('attendance_records').select('*');
    setRecords((attRows || []) as AttendanceRecord[]);
    setLoading(false);
  }

  // Camera viewfinder toggle
  useEffect(() => {
    let stream: MediaStream | null = null;
    if (cameraOn && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: 'environment' } })
        .then((s) => {
          stream = s;
          if (videoRef.current) videoRef.current.srcObject = s;
        })
        .catch(() => {
          setCameraOn(false);
          setScanStatusMsg({ text: 'Unable to access camera. Enter Student ID below to test.', error: true });
        });
    }
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [cameraOn]);

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);

    if (authMode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email: emailInput.trim(),
        password: passwordInput,
      });
      if (error || !data.user) {
        setAuthError(error?.message || 'Sign up failed.');
        return;
      }

      const { error: profErr } = await supabase.from('profiles').insert({
        id: data.user.id,
        role: roleInput,
        full_name: fullNameInput.trim(),
        email: emailInput.trim(),
        school_id: schoolIdInput.trim(),
        department_or_course: courseInput,
        year_level: roleInput === 'student' ? yearInput : null,
        section: roleInput === 'student' ? sectionInput : null,
        qr_bg_color: '#FFFFFF',
        qr_fg_color: '#0F172A',
      });

      if (profErr) {
        setAuthError(profErr.message);
        return;
      }
      await loadUserData(data.user.id);
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailInput.trim(),
        password: passwordInput,
      });
      if (error || !data.user) {
        setAuthError(error?.message || 'Invalid credentials.');
        return;
      }
      await loadUserData(data.user.id);
    }
  }

  async function handleLogout() {
    setCameraOn(false);
    await supabase.auth.signOut();
    setProfile(null);
    setSessionUserId(null);
    setSelectedRosterId(null);
    setSelectedReportId(null);
    setActiveTab('dashboard');
  }

  async function handleCreateSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionUserId || !schedCode.trim() || !schedTitle.trim()) return;

    const { data, error } = await supabase
      .from('schedules')
      .insert({
        owner_id: sessionUserId,
        code: schedCode.trim(),
        title: schedTitle.trim(),
        section: schedSection.trim(),
        room: schedRoom.trim(),
        slots: schedSlots,
      })
      .select()
      .single();

    if (!error && data) {
      setSchedules((prev) => [data as ScheduleItem, ...prev]);
      setShowSchedModal(false);
      setSchedCode('');
      setSchedTitle('');
      setSchedRoom('');
      setSchedSlots([{ day: 'Monday', start: '09:00', end: '10:30' }]);
    }
  }

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRosterId || !newStuNum.trim() || !newStuLast.trim() || !newStuFirst.trim()) return;

    const { data, error } = await supabase
      .from('roster_students')
      .insert({
        schedule_id: selectedRosterId,
        student_number: newStuNum.trim(),
        last_name: newStuLast.trim(),
        first_name: newStuFirst.trim(),
        middle_initial: newStuMi.trim().toUpperCase() || null,
      })
      .select()
      .single();

    if (!error && data) {
      setRosterMap((prev) => ({
        ...prev,
        [selectedRosterId]: sortRosterAZ([...(prev[selectedRosterId] || []), data as RosterStudent]),
      }));
      setNewStuNum('');
      setNewStuLast('');
      setNewStuFirst('');
      setNewStuMi('');
    }
  }

  async function handleSaveStudentEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingStudent) return;

    const { data, error } = await supabase
      .from('roster_students')
      .update({
        student_number: editingStudent.student_number.trim(),
        last_name: editingStudent.last_name.trim(),
        first_name: editingStudent.first_name.trim(),
        middle_initial: editingStudent.middle_initial?.trim().toUpperCase() || null,
      })
      .eq('id', editingStudent.id)
      .select()
      .single();

    if (!error && data) {
      const updated = data as RosterStudent;
      setRosterMap((prev) => ({
        ...prev,
        [updated.schedule_id]: sortRosterAZ(
          (prev[updated.schedule_id] || []).map((s) => (s.id === updated.id ? updated : s))
        ),
      }));
      setEditingStudent(null);
    }
  }

  async function handleQrScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = manualQrInput.trim();
    const targetSched = schedules.find((s) => s.id === scanScheduleId);
    if (!code || !targetSched) return;

    const now = new Date();
    const todayIso = now.toISOString().split('T')[0];
    const startSlot = targetSched.slots[0]?.start || '08:00';
    const evalRes = evaluateScanStatus(startSlot, now);

    if (evalRes.locked) {
      await supabase.from('attendance_records').upsert(
        {
          schedule_id: targetSched.id,
          student_number: code,
          session_date: todayIso,
          status: 'A',
        },
        { onConflict: 'schedule_id,student_number,session_date' }
      );
      setScanStatusMsg({
        text: `Scanning locked (>30 mins past ${startSlot}). Student ${code} marked Absent (A).`,
        error: true,
      });
    } else {
      const { data } = await supabase
        .from('attendance_records')
        .upsert(
          {
            schedule_id: targetSched.id,
            student_number: code,
            session_date: todayIso,
            status: evalRes.status,
          },
          { onConflict: 'schedule_id,student_number,session_date' }
        )
        .select()
        .single();

      if (data) {
        setRecords((prev) => {
          const filtered = prev.filter(
            (r) =>
              !(
                r.schedule_id === targetSched.id &&
                r.student_number === code &&
                r.session_date === todayIso
              )
          );
          return [...filtered, data as AttendanceRecord];
        });
      }

      setScanStatusMsg({
        text: `Student ${code} recorded as ${evalRes.status === 'P' ? 'Present (P)' : 'Late (L)'} for ${todayIso}.`,
      });
    }

    setManualQrInput('');
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    const updates: Partial<Profile> = {
      full_name: editName.trim(),
      department_or_course: editDeptOrCourse.trim(),
      ...(profile.role === 'student'
        ? {
            year_level: editYear,
            section: editSection,
            qr_bg_color: editQrBg,
            qr_fg_color: editQrFg,
          }
        : {}),
    };

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', profile.id)
      .select()
      .single();

    if (!error && data) {
      setProfile(data as Profile);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    }
  }

  function downloadStudentQrPng() {
    if (!qrContainerRef.current || !profile) return;
    const svg = qrContainerRef.current.querySelector('svg');
    if (!svg) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = editQrBg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 30, 30, 340, 340);
      const a = document.createElement('a');
      a.download = `${profile.school_id}-QR.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));
  }

  const studentStats = useMemo(() => {
    if (!profile || profile.role !== 'student') return { p: 0, l: 0, a: 0 };
    const mine = records.filter((r) => r.student_number === profile.school_id);
    return {
      p: mine.filter((r) => r.status === 'P').length,
      l: mine.filter((r) => r.status === 'L').length,
      a: mine.filter((r) => r.status === 'A').length,
    };
  }, [profile, records]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-[#0F172A] dark:text-white font-semibold">
        Loading AttendQR...
      </div>
    );
  }

  if (!sessionUserId || !profile) {
    const availableSections = getSectionsForYear(yearInput);
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="bg-[#0F172A] text-white p-6">
            <div className="text-xs uppercase tracking-wider text-blue-300 font-semibold">
              AttendQR System
            </div>
            <h1 className="text-2xl font-bold mt-1">
              {authMode === 'login' ? 'Sign In' : 'Create Account'}
            </h1>
            <p className="text-xs text-slate-300 mt-1">
              Teacher & Student Attendance Portal
            </p>
          </div>

          <form onSubmit={handleAuthSubmit} className="p-6 space-y-3.5">
            {authMode === 'signup' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Role
                  </label>
                  <select
                    value={roleInput}
                    onChange={(e) => setRoleInput(e.target.value as Role)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  >
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={fullNameInput}
                    onChange={(e) => setFullNameInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    {roleInput === 'student' ? 'Student ID Number' : 'Faculty ID'}
                  </label>
                  <input
                    type="text"
                    required
                    value={schoolIdInput}
                    onChange={(e) => setSchoolIdInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    {roleInput === 'student' ? 'Course' : 'Department'}
                  </label>
                  <select
                    value={courseInput}
                    onChange={(e) => setCourseInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  >
                    {COURSES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {roleInput === 'student' && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Year Level (1–4)
                      </label>
                      <select
                        value={yearInput}
                        onChange={(e) => {
                          const yr = Number(e.target.value);
                          setYearInput(yr);
                          setSectionInput(`${yr}-A`);
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                      >
                        {YEARS.map((yr) => (
                          <option key={yr} value={yr}>
                            Year {yr}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Section
                      </label>
                      <select
                        value={sectionInput}
                        onChange={(e) => setSectionInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                      >
                        {availableSections.map((sec) => (
                          <option key={sec} value={sec}>
                            {sec}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            {authError && (
              <div className="p-2.5 rounded-lg bg-rose-50 text-rose-700 text-xs font-medium">
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white font-semibold text-sm transition cursor-pointer"
            >
              {authMode === 'login' ? 'Login' : 'Sign Up'}
            </button>

            <div className="text-center text-xs text-slate-500 pt-2">
              {authMode === 'login' ? (
                <>
                  Need an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('signup');
                      setAuthError(null);
                    }}
                    className="text-[#2563EB] font-semibold underline cursor-pointer"
                  >
                    Sign Up
                  </button>
                </>
              ) : (
                <>
                  Already registered?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setAuthError(null);
                    }}
                    className="text-[#2563EB] font-semibold underline cursor-pointer"
                  >
                    Login
                  </button>
                </>
              )}
            </div>
          </form>
        </div>
      </div>
    );
  }

  const isTeacher = profile.role === 'teacher';
  const navItems = isTeacher
    ? [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'schedules', label: 'Schedules & Roster', icon: Calendar },
        { id: 'qr', label: 'QR Scanner', icon: QrCode },
        { id: 'reports', label: 'Attendance Reports', icon: FileSpreadsheet },
        { id: 'settings', label: 'Settings', icon: Settings },
      ]
    : [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'qr', label: 'My QR Code', icon: QrCode },
        { id: 'schedules', label: 'Schedule', icon: Calendar },
        { id: 'reports', label: 'Attendance Reports', icon: FileSpreadsheet },
        { id: 'settings', label: 'Settings', icon: Settings },
      ];

  const activeRosterSchedule = schedules.find((s) => s.id === selectedRosterId) || null;
  const activeReportSchedule = schedules.find((s) => s.id === selectedReportId) || null;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 dark:bg-slate-950 text-[#0F172A] dark:text-slate-100">
      <aside className="w-full md:w-64 bg-[#0F172A] text-white flex flex-col justify-between shrink-0">
        <div>
          <div className="p-5 border-b border-slate-800">
            <div className="font-bold text-lg">AttendQR</div>
            <div className="text-xs text-slate-300 mt-0.5 truncate">{profile.full_name}</div>
            <div className="text-[11px] text-blue-300 font-medium mt-0.5">
              {isTeacher ? 'Teacher Portal' : `${profile.department_or_course} • ${profile.section}`}
            </div>
          </div>

          <nav className="p-3 flex md:flex-col gap-1 overflow-x-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isAct = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id as typeof activeTab);
                    setSelectedRosterId(null);
                    setSelectedReportId(null);
                  }}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition cursor-pointer ${
                    isAct
                      ? 'bg-[#2563EB] text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white cursor-pointer"
          >
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8 max-w-6xl mx-auto w-full space-y-6">
        {activeTab === 'dashboard' && !isTeacher && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold">Student Dashboard</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Attendance summary for {profile.full_name} ({profile.school_id})
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="text-xs font-bold uppercase text-emerald-600">Present [P]</div>
                <div className="text-3xl font-bold mt-2">{studentStats.p}</div>
              </div>
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="text-xs font-bold uppercase text-amber-600">Late [L]</div>
                <div className="text-3xl font-bold mt-2">{studentStats.l}</div>
              </div>
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="text-xs font-bold uppercase text-rose-600">Absent [A]</div>
                <div className="text-3xl font-bold mt-2">{studentStats.a}</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && isTeacher && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold">Teacher Dashboard</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manage class rosters and review attendance reports
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {schedules.map((sch) => (
                <div
                  key={sch.id}
                  className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded bg-[#0F172A] text-white text-xs font-bold">
                      {sch.code}
                    </span>
                    <span className="text-xs font-semibold text-[#2563EB]">
                      {sch.section} • {sch.room}
                    </span>
                  </div>
                  <div className="font-bold text-base">{sch.title}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {sch.slots.map((sl) => `${DAY_ABBR[sl.day]} (${sl.start}–${sl.end})`).join(' • ')}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => {
                        setSelectedRosterId(sch.id);
                        setActiveTab('schedules');
                      }}
                      className="flex-1 py-2 px-3 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      Open Roster
                    </button>
                    <button
                      onClick={() => {
                        setSelectedReportId(sch.id);
                        setActiveTab('reports');
                      }}
                      className="flex-1 py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
                    >
                      View Reports
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'schedules' && !activeRosterSchedule && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold">
                  {isTeacher ? 'Schedules & Roster' : 'My Schedule'}
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isTeacher
                    ? 'Select a schedule card to view or edit its A–Z student roster'
                    : 'View or add multi-day class schedules'}
                </p>
              </div>
              <button
                onClick={() => setShowSchedModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Create Schedule
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {schedules.map((sch) => (
                <div
                  key={sch.id}
                  onClick={() => {
                    if (isTeacher) setSelectedRosterId(sch.id);
                  }}
                  className={`bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm ${
                    isTeacher ? 'hover:border-[#2563EB] cursor-pointer' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded bg-[#0F172A] text-white text-xs font-bold">
                      {sch.code}
                    </span>
                    <span className="text-xs font-semibold text-[#2563EB]">
                      {sch.section} • {sch.room}
                    </span>
                  </div>
                  <div className="font-bold text-base mt-2">{sch.title}</div>
                  <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    {sch.slots.map((sl, idx) => (
                      <div key={idx}>
                        • <strong>{sl.day}</strong>: {sl.start} – {sl.end}
                      </div>
                    ))}
                  </div>
                  {isTeacher && (
                    <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs font-semibold text-[#2563EB]">
                      Open A–Z Roster →
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'schedules' && isTeacher && activeRosterSchedule && (
          <div className="space-y-4">
            <button
              onClick={() => setSelectedRosterId(null)}
              className="flex items-center gap-1.5 text-sm font-semibold text-[#2563EB] hover:underline cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Schedules
            </button>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-700 overflow-hidden shadow-sm">
              <div className="bg-[#0F172A] text-white p-4">
                <div className="text-xs text-blue-300 font-semibold">
                  {activeRosterSchedule.code} • {activeRosterSchedule.section}
                </div>
                <div className="font-bold text-lg">{activeRosterSchedule.title} — Class Roster (A–Z)</div>
              </div>

              <form
                onSubmit={handleAddStudent}
                className="p-3 bg-slate-100 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-5 gap-2"
              >
                <input
                  type="text"
                  required
                  placeholder="Student ID"
                  value={newStuNum}
                  onChange={(e) => setNewStuNum(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs"
                />
                <input
                  type="text"
                  required
                  placeholder="Last Name"
                  value={newStuLast}
                  onChange={(e) => setNewStuLast(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs"
                />
                <input
                  type="text"
                  required
                  placeholder="First Name"
                  value={newStuFirst}
                  onChange={(e) => setNewStuFirst(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs"
                />
                <input
                  type="text"
                  maxLength={2}
                  placeholder="M.I."
                  value={newStuMi}
                  onChange={(e) => setNewStuMi(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  + Add Student
                </button>
              </form>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-200 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700">
                      <th className="p-2.5 border-r border-slate-300 dark:border-slate-700 w-10 text-center">#</th>
                      <th className="p-2.5 border-r border-slate-300 dark:border-slate-700 text-left">Student ID</th>
                      <th className="p-2.5 border-r border-slate-300 dark:border-slate-700 text-left">Last Name</th>
                      <th className="p-2.5 border-r border-slate-300 dark:border-slate-700 text-left">First Name</th>
                      <th className="p-2.5 border-r border-slate-300 dark:border-slate-700 text-center">M.I.</th>
                      <th className="p-2.5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rosterMap[activeRosterSchedule.id] || []).map((st, idx) => (
                      <tr
                        key={st.id}
                        className="odd:bg-white even:bg-slate-50 dark:odd:bg-slate-900 dark:even:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800"
                      >
                        <td className="p-2 border-r border-slate-200 dark:border-slate-800 text-center font-mono bg-slate-100 dark:bg-slate-800">
                          {idx + 1}
                        </td>
                        <td className="p-2 border-r border-slate-200 dark:border-slate-800 font-mono">
                          {st.student_number}
                        </td>
                        <td className="p-2 border-r border-slate-200 dark:border-slate-800 font-semibold">
                          {st.last_name}
                        </td>
                        <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                          {st.first_name}
                        </td>
                        <td className="p-2 border-r border-slate-200 dark:border-slate-800 text-center">
                          {st.middle_initial || '-'}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            onClick={() => setEditingStudent(st)}
                            className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-slate-800 text-[#2563EB] cursor-pointer"
                            title="Edit Student"
                          >
                            <Eye className="w-4 h-4 mx-auto" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'qr' && isTeacher && (
          <div className="max-w-xl mx-auto bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div>
              <h1 className="text-xl font-bold">QR Scanner</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ≤15 mins: <strong>Present [P]</strong> • 16–30 mins: <strong>Late [L]</strong> • &gt;30 mins: <strong>Absent [A] (Locked)</strong>
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Active Schedule</label>
              <select
                value={scanScheduleId}
                onChange={(e) => setScanScheduleId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                {schedules.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.title} ({s.section})
                  </option>
                ))}
              </select>
            </div>

            <div className="aspect-square max-h-64 mx-auto w-full bg-[#0F172A] rounded-2xl overflow-hidden flex items-center justify-center relative">
              {cameraOn ? (
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
              ) : (
                <div className="w-40 h-40 border-2 border-[#3B82F6] rounded-xl flex items-center justify-center text-center p-3 text-xs text-blue-200">
                  Camera Standby
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setCameraOn((p) => !p)}
              className="w-full py-2 rounded-xl bg-[#0F172A] text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <Camera className="w-4 h-4" /> {cameraOn ? 'Stop Camera' : 'Start Camera'}
            </button>

            <form onSubmit={handleQrScanSubmit} className="flex gap-2">
              <input
                type="text"
                placeholder="Scanned / Enter Student ID"
                value={manualQrInput}
                onChange={(e) => setManualQrInput(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                Record Scan
              </button>
            </form>

            {scanStatusMsg && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold ${
                  scanStatusMsg.error
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-blue-50 text-[#0F172A] border border-blue-200'
                }`}
              >
                {scanStatusMsg.text}
              </div>
            )}
          </div>
        )}

        {activeTab === 'qr' && !isTeacher && (
          <div className="max-w-sm mx-auto bg-[#0F172A] text-white rounded-3xl p-6 text-center shadow-lg space-y-4">
            <div className="text-xs uppercase tracking-widest text-blue-300 font-semibold">
              My QR Code
            </div>
            <div>
              <div className="text-lg font-bold">{profile.full_name}</div>
              <div className="text-xs text-slate-300">
                {profile.school_id} • {profile.department_or_course} {profile.section}
              </div>
            </div>

            <div
              ref={qrContainerRef}
              style={{ backgroundColor: editQrBg }}
              className="p-5 rounded-2xl inline-block mx-auto"
            >
              <QRCodeSVG
                value={profile.school_id}
                size={190}
                bgColor={editQrBg}
                fgColor={editQrFg}
                level="H"
              />
            </div>

            <button
              type="button"
              onClick={downloadStudentQrPng}
              className="w-full py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" /> Download QR PNG
            </button>
          </div>
        )}

        {activeTab === 'reports' && !activeReportSchedule && (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-bold">Attendance Reports</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select a schedule to open its weekly attendance sheet
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {schedules.map((sch) => (
                <button
                  key={sch.id}
                  onClick={() => setSelectedReportId(sch.id)}
                  className="text-left bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-[#2563EB] shadow-sm cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded bg-[#0F172A] text-white text-xs font-bold">
                      {sch.code}
                    </span>
                    <span className="text-xs font-semibold text-[#2563EB]">{sch.section}</span>
                  </div>
                  <div className="font-bold text-base mt-2">{sch.title}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {sch.slots.length} day(s)/week: {sch.slots.map((sl) => DAY_ABBR[sl.day]).join(', ')}
                  </div>
                  <div className="mt-3 text-xs font-semibold text-[#2563EB]">
                    Open Attendance Sheet →
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'reports' && activeReportSchedule && (() => {
          let cols = getSessionColumnsForMonth(reportMonth, activeReportSchedule.slots, reportWeek);
          if (reportDate) {
            cols = cols.filter((c) => c.isoDate === reportDate);
          }

          const weekHeaders: { week: number; span: number }[] = [];
          cols.forEach((c) => {
            const last = weekHeaders[weekHeaders.length - 1];
            if (!last || last.week !== c.week) {
              weekHeaders.push({ week: c.week, span: 1 });
            } else {
              last.span += 1;
            }
          });

          const rowsToDisplay: { studentNumber: string; label: string }[] = isTeacher
            ? sortRosterAZ(rosterMap[activeReportSchedule.id] || []).map((st) => ({
                studentNumber: st.student_number,
                label: `${st.last_name}, ${st.first_name} ${st.middle_initial ? st.middle_initial + '.' : ''}`,
              }))
            : [
                {
                  studentNumber: profile.school_id,
                  label: `${profile.full_name} (${profile.school_id})`,
                },
              ];

          return (
            <div className="space-y-4">
              <button
                onClick={() => {
                  setSelectedReportId(null);
                  setReportDate('');
                }}
                className="flex items-center gap-1.5 text-sm font-semibold text-[#2563EB] hover:underline cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Schedules
              </button>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-bold">
                    {activeReportSchedule.code} — {activeReportSchedule.title}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    P = Present • L = Late • A = Absent ({activeReportSchedule.slots.length} day(s)/week)
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <input
                    type="month"
                    value={reportMonth}
                    onChange={(e) => {
                      setReportMonth(e.target.value);
                      setReportDate('');
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                  <select
                    value={reportWeek}
                    onChange={(e) => setReportWeek(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  >
                    <option value="ALL">All Weeks</option>
                    <option value="1">Week 1</option>
                    <option value="2">Week 2</option>
                    <option value="3">Week 3</option>
                    <option value="4">Week 4</option>
                    <option value="5">Week 5</option>
                  </select>
                  <input
                    type="date"
                    value={reportDate}
                    onChange={(e) => setReportDate(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-700 overflow-x-auto shadow-sm">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#0F172A] text-white">
                      <th rowSpan={2} className="p-2.5 border-r border-slate-700 text-left min-w-[190px]">
                        Student Name
                      </th>
                      {weekHeaders.map((wh) => (
                        <th
                          key={wh.week}
                          colSpan={wh.span}
                          className="p-1.5 border-r border-slate-700 text-center font-bold"
                        >
                          Week {wh.week}
                        </th>
                      ))}
                    </tr>
                    <tr className="bg-slate-200 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700">
                      {cols.map((col) => (
                        <th
                          key={col.isoDate}
                          className="p-1.5 border-r border-slate-300 dark:border-slate-700 text-center min-w-[66px]"
                        >
                          <div className="font-bold">{col.dayAbbr}</div>
                          <div className="text-[10px] font-normal text-slate-600 dark:text-slate-300">
                            {col.shortLabel}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rowsToDisplay.map((row) => (
                      <tr
                        key={row.studentNumber}
                        className="odd:bg-white even:bg-slate-50 dark:odd:bg-slate-900 dark:even:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800"
                      >
                        <td className="p-2 border-r border-slate-200 dark:border-slate-800 font-semibold">
                          {row.label}
                        </td>
                        {cols.map((col) => {
                          const found = records.find(
                            (r) =>
                              r.schedule_id === activeReportSchedule.id &&
                              r.student_number === row.studentNumber &&
                              r.session_date === col.isoDate
                          );
                          const mark = found?.status || '-';
                          const cls =
                            mark === 'P'
                              ? 'bg-emerald-100 text-emerald-700 font-bold'
                              : mark === 'L'
                              ? 'bg-amber-100 text-amber-700 font-bold'
                              : mark === 'A'
                              ? 'bg-rose-100 text-rose-700 font-bold'
                              : 'text-slate-400';
                          return (
                            <td
                              key={col.isoDate}
                              className={`p-2 border-r border-slate-200 dark:border-slate-800 text-center ${cls}`}
                            >
                              {mark}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {activeTab === 'settings' && (
          <form onSubmit={handleSaveSettings} className="max-w-2xl space-y-5">
            <h1 className="text-2xl font-bold">Settings</h1>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <div className="font-bold text-sm">Account Details</div>
              <div>
                <label className="block text-xs font-semibold mb-1">Full Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  {isTeacher ? 'Department' : 'Course'}
                </label>
                <input
                  type="text"
                  value={editDeptOrCourse}
                  onChange={(e) => setEditDeptOrCourse(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
              </div>

              {!isTeacher && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Year (1–4)</label>
                    <select
                      value={editYear}
                      onChange={(e) => {
                        const yr = Number(e.target.value);
                        setEditYear(yr);
                        setEditSection(`${yr}-A`);
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    >
                      {YEARS.map((yr) => (
                        <option key={yr} value={yr}>
                          Year {yr}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Section</label>
                    <select
                      value={editSection}
                      onChange={(e) => setEditSection(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    >
                      {getSectionsForYear(editYear).map((sec) => (
                        <option key={sec} value={sec}>
                          {sec}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <div className="font-bold text-sm">Dark Mode</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Switch between light and dark theme
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDarkMode((d) => !d)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0F172A] text-white text-xs font-semibold cursor-pointer"
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                {darkMode ? 'Light Mode' : 'Dark Mode'}
              </button>
            </div>

            {!isTeacher && (
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-base">Customized QR Appearance</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Choose QR background color and pattern color presets
                    </div>
                  </div>
                  <div
                    style={{ backgroundColor: editQrBg }}
                    className="p-2 rounded-xl border border-slate-200 shrink-0"
                  >
                    <QRCodeSVG
                      value={profile.school_id}
                      size={56}
                      bgColor={editQrBg}
                      fgColor={editQrFg}
                    />
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold mb-2">QR Background Color</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {QR_BG_PRESETS.map((bg) => {
                      const active = editQrBg === bg.value;
                      return (
                        <button
                          key={bg.name}
                          type="button"
                          onClick={() => setEditQrBg(bg.value)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                            active
                              ? 'border-[#2563EB] bg-blue-50 text-[#2563EB]'
                              : 'border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <span
                            style={{ backgroundColor: bg.value }}
                            className="w-4 h-4 rounded-full border border-slate-300 shrink-0"
                          />
                          <span className="truncate">{bg.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold mb-2">QR Pattern Color</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {QR_FG_PRESETS.map((fg) => {
                      const active = editQrFg === fg.value;
                      return (
                        <button
                          key={fg.name}
                          type="button"
                          onClick={() => setEditQrFg(fg.value)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                            active
                              ? 'border-[#2563EB] bg-blue-50 text-[#2563EB]'
                              : 'border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <span
                            style={{ backgroundColor: fg.value }}
                            className="w-4 h-4 rounded-full shrink-0"
                          />
                          <span className="truncate">{fg.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="submit"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Save className="w-4 h-4" /> Save Settings
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
              >
                <LogOut className="w-4 h-4" /> Logout
              </button>
            </div>

            {settingsSaved && (
              <div className="text-xs font-semibold text-emerald-600">Settings saved to Supabase.</div>
            )}
          </form>
        )}
      </main>

      {showSchedModal && (
        <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xl">
            <div className="bg-[#0F172A] text-white p-4 flex items-center justify-between">
              <span className="font-bold text-sm">Create Schedule</span>
              <button onClick={() => setShowSchedModal(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSchedule} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <input
                  type="text"
                  required
                  placeholder="Subject Code (e.g. IT 204)"
                  value={schedCode}
                  onChange={(e) => setSchedCode(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
                <input
                  type="text"
                  required
                  placeholder="Section (e.g. 2-A)"
                  value={schedSection}
                  onChange={(e) => setSchedSection(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  required
                  placeholder="Subject Title"
                  value={schedTitle}
                  onChange={(e) => setSchedTitle(e.target.value)}
                  className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
                <input
                  type="text"
                  required
                  placeholder="Room"
                  value={schedRoom}
                  onChange={(e) => setSchedRoom(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
              </div>

              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">Meeting Days & Times</span>
                  <button
                    type="button"
                    onClick={() =>
                      setSchedSlots((prev) => [...prev, { day: 'Wednesday', start: '09:00', end: '10:30' }])
                    }
                    className="text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer"
                  >
                    + Add Another Day
                  </button>
                </div>

                {schedSlots.map((sl, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700"
                  >
                    <select
                      value={sl.day}
                      onChange={(e) => {
                        const next = [...schedSlots];
                        next[idx] = { ...next[idx], day: e.target.value as TimeSlot['day'] };
                        setSchedSlots(next);
                      }}
                      className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs"
                    >
                      {DAYS_ORDER.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <input
                      type="time"
                      value={sl.start}
                      onChange={(e) => {
                        const next = [...schedSlots];
                        next[idx] = { ...next[idx], start: e.target.value };
                        setSchedSlots(next);
                      }}
                      className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs"
                    />
                    <input
                      type="time"
                      value={sl.end}
                      onChange={(e) => {
                        const next = [...schedSlots];
                        next[idx] = { ...next[idx], end: e.target.value };
                        setSchedSlots(next);
                      }}
                      className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs"
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowSchedModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#2563EB] text-white text-xs font-semibold cursor-pointer"
                >
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingStudent && (
        <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xl">
            <div className="bg-[#0F172A] text-white p-4 flex items-center justify-between">
              <span className="font-bold text-sm">Edit Student Details</span>
              <button onClick={() => setEditingStudent(null)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveStudentEdit} className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Student ID</label>
                <input
                  type="text"
                  required
                  value={editingStudent.student_number}
                  onChange={(e) =>
                    setEditingStudent({ ...editingStudent, student_number: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Last Name</label>
                <input
                  type="text"
                  required
                  value={editingStudent.last_name}
                  onChange={(e) =>
                    setEditingStudent({ ...editingStudent, last_name: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold mb-1">First Name</label>
                  <input
                    type="text"
                    required
                    value={editingStudent.first_name}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, first_name: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">M.I.</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={editingStudent.middle_initial || ''}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, middle_initial: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#2563EB] text-white text-xs font-semibold cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}