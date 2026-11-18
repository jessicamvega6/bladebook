/** Typed calls to api-coach for the profile and sign-up (Batch 1). */
import { apiFetch } from '../shared/api/client';

export type PaymentTypeName = 'CASH' | 'CASHAPP' | 'VENMO' | 'PAYPAL';

export interface PaymentType {
  type: PaymentTypeName;
  on: boolean;
  handle: string | null;
}

export interface Profile {
  firstName: string;
  lastName: string;
  initials: string;
  loginEmail: string;
  /** The confirmed business email, or null while one waits for its link. */
  businessEmail: string | null;
  /** The waiting address whose link went out last, or null: what the "not working yet" banner names. */
  pendingBusinessEmail: string | null;
  /** Profile → Business email's list: the login email, the other confirmed addresses, then those waiting for a link. */
  emails: EmailRow[];
  phone: string | null;
  coachTimezone: string;
  currency: 'USD' | 'CAD';
  requiredNoticeHours: number;
  /** Shown form, 7K2Q-M9XT. */
  coachCode: string;
  /** False until there's a confirmed business email: families can't use the code yet. */
  codeWorks: boolean;
  paymentInstructions: string | null;
  paymentTypes: PaymentType[];
  /** Profile → Visibility & texts: shown to approved families only. Both start off. */
  showPhone: boolean;
  showEmail: boolean;
}

/** One address on Profile → Business email's list (ADR-016, amended 2026-11-12). */
export interface EmailRow {
  address: string;
  /** Families' replies go here now. */
  current: boolean;
  login: boolean;
  /** Waiting for its confirmation link. */
  waiting: boolean;
  /** When a waiting address's link stops working (an instant); null otherwise. */
  linkExpiresAt: string | null;
}

export interface SignupBody {
  firstName: string;
  lastName: string;
  useLoginEmail: boolean;
  businessEmail: string | null;
  phone: string;
  coachTimezone: string;
  currency: 'USD' | 'CAD';
  paymentInstructions: string;
  paymentTypes: PaymentType[];
}

export interface DetailsBody {
  firstName: string;
  lastName: string;
  phone: string;
  coachTimezone: string;
}

export interface PaymentsBody {
  paymentInstructions: string;
  paymentTypes: PaymentType[];
}

export function coachApi(token: string) {
  const call = <T>(path: string, method: 'GET' | 'POST' | 'PUT' = 'GET', body?: unknown) =>
    apiFetch<T>(`/api/coach${path}`, { method, body, token });
  return {
    profile: () => call<Profile>('/profile'),
    signup: (body: SignupBody) => call<Profile>('/signup', 'POST', body),
    saveDetails: (body: DetailsBody) => call<Profile>('/profile/details', 'PUT', body),
    savePayments: (body: PaymentsBody) => call<Profile>('/profile/payments', 'PUT', body),
    saveVisibility: (body: { showPhone: boolean; showEmail: boolean }) => call<Profile>('/profile/visibility', 'PUT', body),
    rotateCode: () => call<Profile>('/profile/code/rotate', 'POST'),
    useLoginEmail: () => call<Profile>('/profile/business-email/use-login', 'POST'),
    /** "Use a new address"; with `replaces`, sign-up step 4's "Change address". Emails the confirmation link. */
    addBusinessEmail: (address: string, replaces?: string) =>
      call<Profile>('/profile/business-email', 'POST', { address, replaces: replaces ?? null }),
    /** Profile → Business email's Save: a confirmed address becomes the business email. */
    chooseBusinessEmail: (address: string) => call<Profile>('/profile/business-email', 'PUT', { address }),
    /** A new link; the one sent before stops working. */
    resendLink: (address: string) => call<Profile>('/profile/business-email/resend', 'POST', { address }),
    removeBusinessEmail: (address: string) => call<Profile>('/profile/business-email/remove', 'POST', { address }),
    /** Which address a confirmation link is for. Changes nothing. */
    checkLink: (token: string) => call<{ address: string }>('/profile/business-email/check', 'POST', { token }),
    /** The coach chose Confirm: the link's address becomes the business email. */
    confirmLink: (token: string) => call<{ address: string; profile: Profile }>('/profile/business-email/confirm', 'POST', { token }),
  };
}

export type CoachApi = ReturnType<typeof coachApi>;

// ------------------------------------------------------------- Batch 2

/** One block template as api-coach sends and takes it (see shared/logic/schedule.ts). */
export interface TemplateDto {
  seq: number;
  name: string;
  startTime: string | null;
  endTime: string | null;
  lessonMinutes: number | null;
  priceMinor: number | null;
  maxSkaters: number | null;
  iceType: string | null;
  days: number[];
  off: Record<string, string[]>;
}

export interface ScheduleDto {
  /** 0 until the first save. */
  scheduleVersion: number;
  exists: boolean;
  templates: TemplateDto[];
}

export interface LessonDto {
  startTime: string;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
  lessonStatus: 'OPEN' | 'BOOKED' | 'HELD';
  maxSkaters: number;
  seatsTaken: number;
  /** Who is booked: the seat's "Ava P." for the week view, the full name and family for the day view. */
  skaters: Array<{ studentId: string; shortName: string; fullName: string; familyName: string | null; familyId?: string | null; repeatsEveryWeeks?: number }>;
}

/** Cancelling from the calendar (Batch 5). A lesson or a day asks each lesson; the week names only its Sunday. */
export type CancelBody =
  | { scope: 'LESSON'; picks: Array<{ date: string; startTime: string; after: 'RELEASE' | 'HOLD' }> }
  // A day is time off: no release-or-hold (owner, 2026-11-18, I24).
  | { scope: 'DAY'; picks: Array<{ date: string; startTime: string }> }
  | { scope: 'WEEK'; weekStart: string };

/** What was done. {@code skipped}: lessons that started or were cancelled since the preview, left alone. */
export interface CancelResult { cancelled: number; held: number; openHeld: number; families: number; skipped: number }

export interface CalendarDto {
  coachTimezone: string;
  /** The coach's today and now, in the coach's time zone. */
  today: string;
  now: string;
  hasSchedule: boolean;
  /** {@code special}: the time off or special schedule on that date, if any (Batch 6). */
  days: Array<{ date: string; override: boolean; lessons: LessonDto[]; special?: { kind: 'TIME_OFF' | 'SPECIAL'; name: string; startDate: string; endDate: string } | null }>;
}

/** Time off or a special schedule. A special schedule's templates ignore {@code days}; {@code off} is keyed by date. */
export interface TempDto {
  tempId: string | null; kind: 'TIME_OFF' | 'SPECIAL'; name: string; displayName?: string; startDate: string; endDate: string;
  templates: TemplateDto[];
}

/** One booked lesson a change affects, by the seats' display names ("Ava P."). */
export interface ImpactDto {
  date: string; startTime: string; durationMinutes: number; priceMinor: number; newPriceMinor: number | null;
  skaters: Array<{ studentId: string; name: string; familyId: string }>;
}

/** The review page: what saving would cancel and re-price, what an increase won't reach, and big price changes. */
export interface PreviewDto {
  cancel: ImpactDto[]; reprice: ImpactDto[]; kept: ImpactDto[]; families: number;
  big: Array<{ seq: number; label: string; fromMinor: number; toMinor: number; percent: number; cut: boolean }>;
}

/** The newest schedule change's batch, for the save status. */
export interface ChangeStatusDto {
  exists: boolean; createdAt: string | null; executionStatus: 'PLANNED' | 'EXECUTED' | 'SKIPPED' | null;
  lessonCount: number; clientCount: number; stuck: boolean; passed: ImpactDto[];
}

export function scheduleApi(token: string) {
  const call = <T>(path: string, method: 'GET' | 'PUT' | 'POST' | 'DELETE' = 'GET', body?: unknown) =>
    apiFetch<T>(`/api/coach${path}`, { method, body, token });
  return {
    /** Never retried: a second cancel after a lost reply finds nothing left and says so. */
    cancel: (body: CancelBody) => call<CancelResult>('/calendar/cancel', 'POST', body),
    schedule: () => call<ScheduleDto>('/schedule'),
    /** Needs a sign-in from the last 15 minutes, or fails with SIGN_IN_TO_SAVE. */
    saveSchedule: (scheduleVersion: number, templates: TemplateDto[]) =>
      call<ScheduleDto>('/schedule', 'PUT', { scheduleVersion, templates }),
    /** What saving this week would do to booked lessons. Writes nothing; no recent sign-in needed. */
    previewWeekly: (templates: TemplateDto[]) => call<PreviewDto>('/schedule/preview', 'POST', { scheduleVersion: 0, templates }),
    temps: () => call<TempDto[]>('/schedule/temps'),
    temp: (tempId: string) => call<TempDto>(`/schedule/temps/${encodeURIComponent(tempId)}`),
    previewTemp: (t: TempDto) => call<PreviewDto>('/schedule/temps/preview', 'POST', t),
    /** Needs a sign-in from the last 15 minutes, or fails with SIGN_IN_TO_SAVE. */
    saveTemp: (t: TempDto) => (t.tempId
      ? call<TempDto>(`/schedule/temps/${encodeURIComponent(t.tempId)}`, 'PUT', t)
      : call<TempDto>('/schedule/temps', 'POST', t)),
    status: () => call<ChangeStatusDto>('/schedule/status'),
    previewDelete: (tempId: string) => call<PreviewDto>(`/schedule/temps/${encodeURIComponent(tempId)}/delete-preview`),
    /** Needs a sign-in from the last 15 minutes, or fails with SIGN_IN_TO_SAVE. */
    deleteTemp: (tempId: string) => call<TempDto>(`/schedule/temps/${encodeURIComponent(tempId)}`, 'DELETE'),
    calendar: (from: string, to: string) =>
      call<CalendarDto>(`/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  };
}

export type ScheduleApi = ReturnType<typeof scheduleApi>;

/** One skater with this coach (design: coach/screens-students.js). Contact details are the family's, read-only (A4). */
export interface StudentDto {
  studentId: string;
  /** Groups a family's skaters on Waiting for approval. */
  familyId: string;
  status: 'PENDING' | 'ACTIVE';
  studentName: string;
  isMinor: boolean;
  relationship: 'SELF' | 'GUARDIAN';
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  skatingOrg: 'USFS' | 'USA_HOCKEY' | 'LEARN_TO_SKATE_USA';
  registrationNumber: string;
  signedUpAt: string;
}

export interface StudentsDto {
  active: StudentDto[];
  pending: StudentDto[];
}

export function studentApi(token: string) {
  return {
    list: () => apiFetch<StudentsDto>('/api/coach/students', { token }),
    approve: (studentIds: string[]) => apiFetch<StudentsDto>('/api/coach/students/approve', { method: 'POST', body: { studentIds }, token }),
    decline: (studentId: string) => apiFetch<StudentsDto>(`/api/coach/students/${encodeURIComponent(studentId)}`, { method: 'DELETE', token }),
  };
}

export type StudentApi = ReturnType<typeof studentApi>;

// ------------------------------------------------------------- Batch 7

/** One skater's lesson that has happened, for the Lessons page. {@code status} NOT_RECORDED: nothing recorded yet. */
export interface PastLessonDto {
  date: string; startTime: string; durationMinutes: number; sharedWith: string[];
  skater: { studentId: string; shortName: string; fullName: string; familyName: string | null; status: 'BOOKED' | 'CHECKED_IN' | 'NO_SHOW' | 'NOT_RECORDED'; outcomeAt: string | null };
}

export function lessonsApi(token: string) {
  return {
    list: (from: string, to: string) => apiFetch<PastLessonDto[]>(`/api/coach/lessons?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { token }),
    /** A correction overwrites whatever was recorded at the rink (R1). */
    correct: (l: PastLessonDto, outcome: 'CHECKED_IN' | 'NO_SHOW') =>
      apiFetch<PastLessonDto['skater']>('/api/coach/lessons/attendance', {
        method: 'PUT', token, idempotent: true, body: { date: l.date, startTime: l.startTime, studentId: l.skater.studentId, outcome },
      }),
  };
}

export type LessonsApi = ReturnType<typeof lessonsApi>;

// ------------------------------------------------------------- Batch 8

export type PayStatus = 'UNPAID' | 'PAID' | 'WAIVED';
export type PaidVia = 'CASH' | 'CASHAPP' | 'VENMO' | 'PAYPAL' | 'OTHER';

/** One skater's lesson that happened, at their share of the price. */
export interface PaymentRowDto {
  date: string; startTime: string; durationMinutes: number; studentId: string; fullName: string; familyName: string | null;
  relationship: 'SELF' | 'GUARDIAN' | null; attendance: 'BOOKED' | 'CHECKED_IN' | 'NO_SHOW' | 'NOT_RECORDED';
  amountMinor: number; currency: string; status: PayStatus; paidVia: PaidVia | null; sharedWith: string[];
  /** On a paid lesson whose payment counted in a year that has closed, that year (worked out by the server); else null. */
  closedYear: number | null;
  /** Dated before January 1 of last year: only Waive is offered, on an unpaid one (G-39, Batch 27). */
  viewOnly: boolean;
}

/** Totals per currency, never across. */
export interface PaymentsDto {
  rows: PaymentRowDto[];
  totals: { unpaid: Record<string, number>; unpaidCount: number; paid: Record<string, number>; paidCount: number; noShows: number;
    noShowsUnpaid: Record<string, number>; notRecorded: number };
  /** The Mark paid dialog's choices: the coach's payment types, then Other. */
  choices: PaidVia[];
  currency: string;
  /** The year it is now in the coach's time zone: an undo of a closed year's payment counts in it. */
  thisYear: number;
}

export function paymentsApi(token: string) {
  const seat = (r: PaymentRowDto, paidVia?: PaidVia | null) => ({ date: r.date, startTime: r.startTime, studentId: r.studentId, paidVia: paidVia ?? null });
  const post = (path: string, body: unknown) => apiFetch<PaymentRowDto>(`/api/coach/payments/${path}`, { method: 'POST', body, token, idempotent: true });
  return {
    list: (from: string, to: string) => apiFetch<PaymentsDto>(`/api/coach/payments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { token }),
    /** Marks paid, or changes how a paid lesson was paid ({@code null} for none). */
    markPaid: (r: PaymentRowDto, paidVia: PaidVia | null) => post('paid', seat(r, paidVia)),
    /** Final (R7). */
    waive: (r: PaymentRowDto) => post('waive', seat(r)),
    undo: (r: PaymentRowDto) => post('undo', seat(r)),
  };
}

export type PaymentsApi = ReturnType<typeof paymentsApi>;

/**
 * One month of the financial page. Amounts per currency, never across. {@code month}: yyyy-MM. {@code earlierGross}:
 * the part of {@code gross} paid this month for lessons in an earlier year (owner, 2026-11-13).
 */
export interface FinanceMonthDto {
  month: string; hasLessons: boolean; paidLessons: number; gross: Record<string, number>; unpaid: Record<string, number>;
  earlierLessons: number; earlierGross: Record<string, number>;
  /** Earlier years' payments undone this month, already taken off {@code gross} (Batch 26). */
  undoneLessons: number; undoneGross: Record<string, number>;
}

/** A year's figures (Batch 12): gross only; rink fees are Phase 2. {@code today}: the coach's date. */
export interface FinanceYearDto {
  year: number; closed: boolean; today: string; months: FinanceMonthDto[]; paidLessons: number;
  gross: Record<string, number>; unpaid: Record<string, number>; earlierLessons: number; earlierGross: Record<string, number>;
  undoneLessons: number; undoneGross: Record<string, number>; currency: string;
}

export function financesApi(token: string) {
  return {
    year: (year: number) => apiFetch<FinanceYearDto>(`/api/coach/finances?year=${year}`, { token }),
    /** The summary CSV for this year or last: no skater names. */
    download: (year: number) => apiFetch<{ fileName: string; csv: string }>(`/api/coach/finances/download?year=${year}`, { token }),
  };
}

export type FinancesApi = ReturnType<typeof financesApi>;

// ------------------------------------------------------------- Batch 22

/** One skater in one of today's lessons, at their share of the price. */
export interface TodaySkaterDto {
  studentId: string; name: string; amountMinor: number; currency: string;
  attendance: 'BOOKED' | 'CHECKED_IN' | 'NO_SHOW' | 'NOT_RECORDED';
}

/** A booked lesson time (skaters in the order they joined) or a held one (no skaters). {@code next}: the next to start. */
export interface TodayLessonDto { startTime: string; durationMinutes: number; held: boolean; next: boolean; skaters: TodaySkaterDto[] }

/** A count of skaters' lessons and their amounts per currency, never added across. */
export interface FiguresDto { count: number; amounts: Record<string, number> }

/**
 * The Today page (G-6): dates and times are the coach's own. {@code nextLessonDate}: only when today has no lessons.
 * {@code week}: every lesson booked Sunday to Saturday; {@code unpaid}: every lesson that has started and is still unpaid.
 */
export interface TodayDto {
  coachTimezone: string; currency: string; today: string; now: string; weekStart: string; weekEnd: string;
  lessons: TodayLessonDto[]; nextLessonDate: string | null; week: FiguresDto; unpaid: FiguresDto;
}

export function todayApi(token: string) {
  return { today: () => apiFetch<TodayDto>('/api/coach/today', { token }) };
}

export type TodayApi = ReturnType<typeof todayApi>;
