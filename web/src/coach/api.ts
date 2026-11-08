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
