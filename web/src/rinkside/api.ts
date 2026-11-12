/** The rinkside page's calls to api-coach (Batch 7). Its routes keep a 4-hour session (ADR-023 d6). */
import { apiFetch } from '../shared/api/client';

export type Shown = 'BOOKED' | 'CHECKED_IN' | 'NO_SHOW' | 'NOT_RECORDED';

export interface RinkSkater { studentId: string; shortName: string; fullName: string; familyName: string | null; status: Shown; outcomeAt: string | null }

export interface RinkLesson { date: string; startTime: string; durationMinutes: number; startsAtUtc: string; lessonStatus: 'BOOKED' | 'HELD'; skaters: RinkSkater[] }

export interface RinkDay { coachFirstName: string; coachTimezone: string; today: string; now: string; lessons: RinkLesson[] }

export interface Contact { studentName: string; isMinor: boolean; relationship: 'SELF' | 'GUARDIAN'; clientName: string; phone: string; email: string }

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
  };
}

export type RinkApi = ReturnType<typeof rinkApi>;
