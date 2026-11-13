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
  pendingBusinessEmail: string | null;
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
    /** LOCAL STAND-IN for clicking the business-email link (until batch 14). */
    markBusinessEmailConfirmed: () => call<Profile>('/local/business-email/confirm', 'POST'),
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
  | { scope: 'LESSON' | 'DAY'; picks: Array<{ date: string; startTime: string; after: 'RELEASE' | 'HOLD' }> }
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
}

/** Totals per currency, never across. */
export interface PaymentsDto {
  rows: PaymentRowDto[];
  totals: { unpaid: Record<string, number>; unpaidCount: number; paid: Record<string, number>; paidCount: number; noShows: number;
    noShowsUnpaid: Record<string, number>; notRecorded: number };
  /** The Mark paid dialog's choices: the coach's payment types, then Other. */
  choices: PaidVia[];
  currency: string;
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
