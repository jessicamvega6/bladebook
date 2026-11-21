/**
 * Cognito's answers, in BladeBook's words (ADR-023 d11; the log-in, sign-up and forgot-password feature files). A wrong
 * password and an email with no account get the same message ("Prevent user existence errors" is on), and nothing here
 * says which one it was.
 */
export class AuthFailure extends Error {
  constructor(readonly code: AuthFailureCode, message: string) {
    super(message);
    this.name = 'AuthFailure';
  }
}

export type AuthFailureCode =
  | 'WRONG_PASSWORD'
  | 'TOO_MANY'
  | 'EMAIL_TAKEN'
  | 'WEAK_PASSWORD'
  | 'WRONG_CODE'
  | 'CODE_EXPIRED'
  | 'NOT_CONFIRMED'
  | 'MFA'
  | 'RESET_REQUIRED'
  | 'NETWORK'
  | 'OTHER';

const MESSAGES: Record<AuthFailureCode, string> = {
  WRONG_PASSWORD: 'That email and password don’t match. Check them and try again.',
  TOO_MANY: 'Too many tries. Wait a few minutes, then try again.',
  EMAIL_TAKEN: 'There’s already an account with this email. Log in instead, or use Forgot your password.',
  WEAK_PASSWORD: 'Use a password that meets every rule below.',
  WRONG_CODE: 'That code isn’t right. Check the email and try again.',
  CODE_EXPIRED: 'That code has expired. Send a new one.',
  NOT_CONFIRMED: 'Your email isn’t verified yet.',
  // I32: a coach's MFA is Batch 28. Until then the forms don't ask for a code.
  MFA: 'This account asks for a code from an authenticator app, which BladeBook can’t take yet. Contact BladeBook support.',
  RESET_REQUIRED: 'This account needs a new password. Use Forgot your password to set one.',
  NETWORK: 'Can’t reach BladeBook. Check your connection and try again.',
  OTHER: 'Something went wrong. Try again.',
};

export function failure(code: AuthFailureCode, message = MESSAGES[code]): AuthFailure {
  return new AuthFailure(code, message);
}

/** Cognito's exception names (they arrive as the error's `name`), mapped to BladeBook's. */
const BY_NAME: Record<string, AuthFailureCode> = {
  NotAuthorizedException: 'WRONG_PASSWORD',
  UserNotFoundException: 'WRONG_PASSWORD',
  LimitExceededException: 'TOO_MANY',
  TooManyRequestsException: 'TOO_MANY',
  TooManyFailedAttemptsException: 'TOO_MANY',
  UsernameExistsException: 'EMAIL_TAKEN',
  AliasExistsException: 'EMAIL_TAKEN',
  InvalidPasswordException: 'WEAK_PASSWORD',
  CodeMismatchException: 'WRONG_CODE',
  ExpiredCodeException: 'CODE_EXPIRED',
  UserNotConfirmedException: 'NOT_CONFIRMED',
  PasswordResetRequiredException: 'RESET_REQUIRED',
  NetworkError: 'NETWORK',
};

export function toFailure(e: unknown): AuthFailure {
  if (e instanceof AuthFailure) return e;
  const name = (e as { name?: string } | null)?.name ?? '';
  const message = (e as { message?: string } | null)?.message ?? '';
  // Cognito says "Password attempts exceeded" as a NotAuthorizedException.
  if (name === 'NotAuthorizedException' && /attempts exceeded/i.test(message)) return failure('TOO_MANY');
  if (e instanceof TypeError) return failure('NETWORK');
  return failure(BY_NAME[name] ?? 'OTHER');
}
