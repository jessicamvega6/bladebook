/**
 * The time zones the coach can choose (design/harbor/coach, Profile → Details), with the label the
 * coach sees and the IANA name that is stored (ADR-016 d6). Must match ProfileRules.TIMEZONES in Java.
 */
export const TIMEZONES: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'America/New_York', label: 'Eastern — New York' },
  { id: 'America/Chicago', label: 'Central — Chicago' },
  { id: 'America/Denver', label: 'Mountain — Denver' },
  { id: 'America/Los_Angeles', label: 'Pacific — Los Angeles' },
  { id: 'America/Toronto', label: 'Eastern — Toronto' },
  { id: 'America/Edmonton', label: 'Mountain — Edmonton' },
  { id: 'America/Vancouver', label: 'Pacific — Vancouver' },
];

export function timezoneLabel(id: string): string {
  return TIMEZONES.find((z) => z.id === id)?.label ?? id;
}
