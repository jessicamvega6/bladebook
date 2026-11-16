/**
 * The family website's calls to api-client. The only IDs it gets are the family's own: its skaters', and each
 * approving coach's. It sends them back to book, and api-client checks each against the family's links.
 */
import { apiFetch } from '../shared/api/client';
import type { FoundCoach } from '../shared/logic/coachCodes';
import type { SkatingOrg } from '../shared/logic/registrationNumber';

export type Status = 'PENDING' | 'ACTIVE';
export type PaymentType = 'CASH' | 'CASHAPP' | 'VENMO' | 'PAYPAL';

export interface Family {
  contact: { firstName: string; lastName: string; email: string; phone: string; relationship: 'SELF' | 'GUARDIAN' };
  /** No coach has approved any skater yet: the family sees only Home and Profile. */
  waiting: boolean;
  skaters: Array<{
    studentId: string; name: string; isMinor: boolean; skatingOrg: SkatingOrg; registrationNumber: string;
    /** {@code coachId} only once that coach has approved one of the family's skaters. */
    coaches: Array<{ coachId: string | null; firstName: string; lastName: string; status: Status }>;
    /** For inviting this skater to share a lesson (G-17); null until it's issued, a moment after the skater is created. */
    shareCode?: string | null;
  }>;
  coaches: Array<{
    coachId: string | null; firstName: string; lastName: string; status: Status; skaterNames: string[]; waitingNames: string[];
    /** Only once the coach has approved one of the family's skaters. */
    details: { phone: string | null; email: string | null; payments: Array<{ type: PaymentType; handle: string | null }> } | null;
  }>;
}

export interface RegistrationBody {
  firstName: string;
  lastName: string;
  phone: string;
  relationship: 'SELF' | 'GUARDIAN';
  coachCodes: string[];
  skaters: Array<{ name: string; skatingOrg: SkatingOrg; registrationNumber: string; coachCodes: string[] }>;
}

/**
 * One lesson time. Dates and times are the coach's own; {@code free}: nobody holds it (who does is never shown).
 * {@code shareable}: its block takes 2 or more skaters, so the confirm pop-up offers the share box (never how many).
 */
export interface TimeDto {
  date: string; startTime: string; endTime: string; durationMinutes: number; priceMinor: number; currency: string;
  blockSeq: number; blockName: string | null; free: boolean; started: boolean; shareable?: boolean;
}

/**
 * Who a lesson is shared with, from the family's own seat (Batch 11). {@code partnerStatus}: INVITED, BOOKED, CHECKED_IN,
 * NO_SHOW, LEFT (left in time; this family answers by {@code answerBy}), or how an invitation ended: DECLINED, WITHDRAWN,
 * EXPIRED. {@code inviteId}: the family's own invitation, to withdraw. {@code joined}: the skater joined another family's
 * lesson. {@code freedPlace}: kept at the full price, so it can take a one-lesson invitation.
 */
export interface LessonShare {
  partnerName: string | null; partnerStatus: string | null; inviteId: string | null; answerBy: string | null;
  fullPriceMinor: number | null; shareable: boolean; freedPlace: boolean; joined: boolean;
}

/** An invitation to one of the family's skaters (design: invite). {@code status} OPEN, or EXPIRED once every date started. */
export interface Invitation {
  inviteId: string; coachId: string; coachFirstName: string; coachLastName: string; studentId: string; studentName: string;
  hostName: string | null; invitedByName: string | null; series: boolean;
  dates: Array<{ date: string; startTime: string; durationMinutes: number; startsAtUtc: string; open: boolean }>;
  priceMinor: number | null; shareMinor: number | null; skaters: number; currency: string | null; status: 'OPEN' | 'EXPIRED';
  clashes: Array<{ date: string; startTime: string; otherCoachFirstName: string; otherStartTime: string; otherDurationMinutes: number }>;
}

/** An answer on several dates: those carried out, and those that had gone or been answered. */
export interface Answered { studentName: string | null; coachFirstName: string | null; hostName: string | null; done: string[]; skipped: string[] }

/** One of the family's own lessons, with any of its skaters. */
export interface FamilyLesson {
  coachId: string; coachFirstName: string; studentId: string; studentName: string; date: string; startTime: string;
  durationMinutes: number; startsAtUtc: string; coachTz: string;
}

/** A lesson on Home and My bookings: the family's share of the price (null if it can't be read) and its notice period. */
export interface MyLesson extends FamilyLesson {
  priceMinor: number | null; currency: string | null; requiredNoticeHours: number;
  /** What the coach recorded, once they have (Batch 7). */
  attendance?: 'CHECKED_IN' | 'NO_SHOW' | null;
  /** Its series and how often that repeats now, or null and 0 (Batch 9). */
  recurrenceId?: string | null; intervalWeeks?: number;
  /** Who it's shared with (Batch 11). */
  share?: LessonShare | null;
}

/** My bookings: every lesson not started yet, soonest first, and the last four that have, newest first. */
export interface MyBookings { upcoming: MyLesson[]; recent: MyLesson[]; series?: MySeries[] }

/** {@code late}: inside the notice period, so the coach is told. {@code leave}: what it did to a shared lesson. */
export interface CancelResult {
  outcome: 'CANCELLED' | 'ALREADY_CANCELLED'; late: boolean; coachFirstName: string; studentName: string; date: string; startTime: string;
  leave?: 'RELEASE' | 'WITHDRAW' | 'IN_TIME' | 'LATE';
}

/** One coach's booking page for one skater: every time in the booking window. */
export interface BookingPage {
  coachFirstName: string; coachLastName: string; coachTimezone: string; requiredNoticeHours: number;
  today: string; now: string; windowFirst: string; windowLast: string; hasSchedule: boolean;
  times: TimeDto[]; familyLessons: FamilyLesson[];
  /** The coach's time off and special schedules in the window (G-24). Optional: older answers have none. */
  specials?: Array<{ kind: 'TIME_OFF' | 'SPECIAL'; name: string; startDate: string; endDate: string }>;
}

export type Outcome = 'BOOKED' | 'ALREADY_BOOKED' | 'UNAVAILABLE';

/** {@code repeat}: each pick repeats every {@code everyWeeks} weeks up to {@code until} (Batch 9). */
export interface BookBody {
  coachId: string; studentId: string; idempotencyKey: string; picks: Array<{ date: string; startTime: string }>;
  repeat?: boolean; everyWeeks?: number; until?: string;
  /** Share every pick that can be shared with that skater (Batch 11). */
  shareCode?: string;
}

export type Weekday = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

export interface BookResult {
  coachFirstName: string; studentName: string;
  picks: Array<{
    date: string; startTime: string; outcome: Outcome; message: string | null;
    durationMinutes: number | null; priceMinor: number | null; currency: string | null; recurrenceId?: string | null;
  }>;
  /** One per repeating pick. */
  series?: Array<{ recurrenceId: string; weekday: Weekday; startTime: string; intervalWeeks: number; first: string; until: string }>;
  /** What the share code did: an invitation to another family's skater, or a sibling added directly. */
  shared?: { displayName: string; sibling: boolean; lessons: number } | null;
}

/** A series still running, on My bookings. */
export interface MySeries {
  coachId: string; recurrenceId: string; studentId: string; studentName: string; coachFirstName: string; weekday: Weekday;
  startTime: string; intervalWeeks: number; endDate: string; lessonsLeft: number; lastLesson: string;
}

export interface SeriesChanged { cancelled: number; late: boolean; coachFirstName: string; studentName: string; endDate: string; intervalWeeks: number; status: 'ACTIVE' | 'ENDED' }

/** Step 1, before any account exists: no token. */
export const lookupCoach = (code: string) =>
  apiFetch<FoundCoach>(`/api/client/coach-codes/${encodeURIComponent(code)}`);

export function familyApi(token: string) {
  return {
    me: () => apiFetch<Family>('/api/client/me', { token }),
    register: (body: RegistrationBody) => apiFetch<Family>('/api/client/registration', { method: 'POST', body, token }),
    /** Profile → Add a skater: {@code coachIds} are approved coaches' IDs (a waiting coach's is never given out). */
    addSkater: (body: { name: string; skatingOrg: SkatingOrg; registrationNumber: string; coachIds: string[]; noCoach: boolean }) =>
      apiFetch<Family>('/api/client/me/skaters', { method: 'POST', body, token }),
    /** Profile → Add a coach: the code is resolved on the server. */
    addCoach: (body: { coachCode: string; studentIds: string[] }) => apiFetch<Family>('/api/client/me/coaches', { method: 'POST', body, token }),
    updateContact: (body: { firstName: string; lastName: string; phone: string }) =>
      apiFetch<Family>('/api/client/me/contact', { method: 'PUT', body, token }),
    bookingPage: (coachId: string, studentId: string) =>
      apiFetch<BookingPage>(`/api/client/booking?coachId=${encodeURIComponent(coachId)}&studentId=${encodeURIComponent(studentId)}`, { token }),
    /** One request per coach. A server error is retried once with the same key, so nothing is booked twice. */
    book: (body: BookBody) => apiFetch<BookResult>('/api/client/bookings', { method: 'POST', body, token, idempotent: true }),
    lessons: () => apiFetch<MyLesson[]>('/api/client/lessons', { token }),
    myBookings: () => apiFetch<MyBookings>('/api/client/bookings', { token }),
    /** End a series earlier, make it less frequent, or stop it. */
    changeSeries: (body: { coachId: string; recurrenceId: string; change: 'END_EARLIER' | 'LESS_OFTEN' | 'STOP'; endDate?: string; intervalWeeks?: number }) =>
      apiFetch<SeriesChanged>('/api/client/series/change', { method: 'POST', body, token }),
    /** Safe to retry: asking again for a lesson already gone answers ALREADY_CANCELLED. */
    cancel: (l: { coachId: string; studentId: string; date: string; startTime: string }) =>
      apiFetch<CancelResult>('/api/client/bookings/cancel', {
        method: 'POST', body: { coachId: l.coachId, studentId: l.studentId, date: l.date, startTime: l.startTime }, token, idempotent: true,
      }),
    /** ADR-033 d2a: a share code's display name, and whether the coach has accepted that skater. 404: no such code. */
    shareCheck: (shareCode: string, coachId: string) =>
      apiFetch<{ displayName: string; onCoachRoster: boolean }>('/api/client/share-check', { method: 'POST', body: { shareCode, coachId }, token }),
    invitations: () => apiFetch<Invitation[]>('/api/client/invitations', { token }),
    acceptInvite: (inviteId: string) => apiFetch<Answered>('/api/client/invitations/accept', { method: 'POST', body: { inviteId }, token }),
    declineInvite: (inviteId: string) => apiFetch<Answered>('/api/client/invitations/decline', { method: 'POST', body: { inviteId }, token }),
    withdrawInvite: (inviteId: string) => apiFetch<Answered>('/api/client/invitations/withdraw', { method: 'POST', body: { inviteId }, token }),
    /** The staying family's answer for one or several dates of one skater's lesson at one time. */
    keep: (b: { coachId: string; studentId: string; startTime: string; dates: string[] }) =>
      apiFetch<Answered>('/api/client/bookings/keep', { method: 'POST', body: b, token }),
    cancelWaiting: (b: { coachId: string; studentId: string; startTime: string; dates: string[] }) =>
      apiFetch<Answered>('/api/client/bookings/cancel-waiting', { method: 'POST', body: b, token }),
    /** A freed place takes a skater for that one lesson. */
    inviteToFreed: (b: { coachId: string; studentId: string; date: string; startTime: string; shareCode: string }) =>
      apiFetch<{ displayName: string; sibling: boolean }>('/api/client/bookings/invite', { method: 'POST', body: b, token }),
  };
}

export type FamilyApi = ReturnType<typeof familyApi>;
