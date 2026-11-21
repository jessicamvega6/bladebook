import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { fakes } from './fakeAuth';

// Every test signs in through the fake sign-in (./fakeAuth.ts), never Amplify: shared/auth's one Amplify file is replaced.
vi.mock('../shared/auth/cognito', () => ({
  cognitoAuth: (site: 'coach' | 'family') => fakes[site],
}));

afterEach(() => {
  fakes.coach.reset();
  fakes.family.reset();
});
