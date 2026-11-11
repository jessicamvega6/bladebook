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
  skaters: Array<{ studentId: string; shortName: string; fullName: string; familyName: string | null }>;
}

export interface CalendarDto {
  coachTimezone: string;
  /** The coach's today and now, in the coach's time zone. */
  today: string;
  now: string;
  hasSchedule: boolean;
  days: Array<{ date: string; override: boolean; lessons: LessonDto[] }>;
}

export function scheduleApi(token: string) {
  const call = <T>(path: string, method: 'GET' | 'PUT' = 'GET', body?: unknown) =>
    apiFetch<T>(`/api/coach${path}`, { method, body, token });
  return {
    schedule: () => call<ScheduleDto>('/schedule'),
    /** Needs a sign-in from the last 15 minutes, or fails with SIGN_IN_TO_SAVE. */
    saveSchedule: (scheduleVersion: number, templates: TemplateDto[]) =>
      call<ScheduleDto>('/schedule', 'PUT', { scheduleVersion, templates }),
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
