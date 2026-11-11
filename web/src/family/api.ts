/** The family website's calls to api-client. No coach or student IDs are sent or received. */
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
    name: string; isMinor: boolean; skatingOrg: SkatingOrg; registrationNumber: string;
    coaches: Array<{ firstName: string; lastName: string; status: Status }>;
  }>;
  coaches: Array<{
    firstName: string; lastName: string; status: Status; skaterNames: string[]; waitingNames: string[];
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

/** Step 1, before any account exists: no token. */
export const lookupCoach = (code: string) =>
  apiFetch<FoundCoach>(`/api/client/coach-codes/${encodeURIComponent(code)}`);

export function familyApi(token: string) {
  return {
    me: () => apiFetch<Family>('/api/client/me', { token }),
    register: (body: RegistrationBody) => apiFetch<Family>('/api/client/registration', { method: 'POST', body, token }),
    updateContact: (body: { firstName: string; lastName: string; phone: string }) =>
      apiFetch<Family>('/api/client/me/contact', { method: 'PUT', body, token }),
  };
}

export type FamilyApi = ReturnType<typeof familyApi>;
