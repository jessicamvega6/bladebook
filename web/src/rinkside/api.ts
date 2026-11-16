/** The rinkside page's calls to api-coach (Batch 7). Its routes keep a 4-hour session (ADR-023 d6). */
import { apiFetch } from '../shared/api/client';

export type Shown = 'BOOKED' | 'CHECKED_IN' | 'NO_SHOW' | 'NOT_RECORDED';

export interface RinkSkater { studentId: string; shortName: string; fullName: string; familyName: string | null; status: Shown; outcomeAt: string | null }

export interface RinkLesson { date: string; startTime: string; durationMinutes: number; startsAtUtc: string; lessonStatus: 'BOOKED' | 'HELD'; skaters: RinkSkater[] }

export interface RinkDay { coachFirstName: string; coachTimezone: string; today: string; now: string; lessons: RinkLesson[] }

export interface Contact { studentName: string; isMinor: boolean; relationship: 'SELF' | 'GUARDIAN'; clientName: string; phone: string; email: string }

/** The Week tab (Batch 23): a skater in a lesson; {@code familyId} counts the families who'll be emailed. */
export interface WeekSkater { studentId: string; shortName: string; familyName: string | null; familyId: string }
export interface WeekLesson { date: string; startTime: string; durationMinutes: number; skaters: WeekSkater[] }
export interface OpenTime { date: string; startTime: string; durationMinutes: number }
/** {@code lessons}: booked and not started; {@code started}: booked lessons that can't be cancelled any more. */
export interface WeekDay { date: string; lessons: WeekLesson[]; started: number; open: OpenTime[] }
/** Today to Saturday; {@code weekStart} is the Sunday that Cancel rest of week sends. */
export interface RinkWeek { coachTimezone: string; today: string; now: string; weekStart: string; days: WeekDay[] }

export interface CancelResult { cancelled: number; held: number; openHeld: number; families: number; skipped: number }

export function rinkApi(token: string) {
  return {
    today: () => apiFetch<RinkDay>('/api/coach/rinkside/today', { token }),
    /** {@code outcomeAt}: the tap time on this phone. A repeat answers with what was recorded first. */
    record: (l: RinkLesson, studentId: string, outcome: 'CHECKED_IN' | 'NO_SHOW', outcomeAt: string) =>
      apiFetch<RinkSkater>('/api/coach/rinkside/attendance', {
        method: 'POST', token, idempotent: true, body: { date: l.date, startTime: l.startTime, studentId, outcome, outcomeAt },
      }),
    /** Fetched for one tap; never stored on the phone. */
    contact: (studentId: string) => apiFetch<Contact>(`/api/coach/rinkside/contact/${encodeURIComponent(studentId)}`, { token }),
    cancel: (l: RinkLesson, after: 'RELEASE' | 'HOLD') =>
      apiFetch<{ cancelled: number }>('/api/coach/rinkside/cancel', {
        method: 'POST', token, body: { scope: 'LESSON', picks: [{ date: l.date, startTime: l.startTime, after }] },
      }),
    /** Read with signal only: the phone keeps today's lessons and nothing else (R5). */
    week: () => apiFetch<RinkWeek>('/api/coach/rinkside/week', { token }),
    /** The Week tab's cancels (owner, 2026-11-16: only a lesson, a whole day or the week). One lesson, released or held. */
    cancelLesson: (l: { date: string; startTime: string }, hold: boolean) =>
      apiFetch<CancelResult>('/api/coach/rinkside/cancel', {
        method: 'POST', token, body: { scope: 'LESSON', picks: [{ date: l.date, startTime: l.startTime, after: hold ? 'HOLD' : 'RELEASE' }] },
      }),
    /** A whole day: every lesson left that day, each released or held (S9), as one DAY batch. */
    cancelDay: (lessons: Array<{ date: string; startTime: string; hold: boolean }>) =>
      apiFetch<CancelResult>('/api/coach/rinkside/cancel', {
        method: 'POST', token,
        body: { scope: 'DAY', picks: lessons.map((p) => ({ date: p.date, startTime: p.startTime, after: p.hold ? 'HOLD' : 'RELEASE' })) },
      }),
    /** Cancel rest of week: sends only its Sunday; the server holds every booked lesson and open time left (S8). */
    cancelWeek: (weekStart: string) =>
      apiFetch<CancelResult>('/api/coach/rinkside/cancel', { method: 'POST', token, body: { scope: 'WEEK', weekStart } }),
  };
}

export type RinkApi = ReturnType<typeof rinkApi>;
