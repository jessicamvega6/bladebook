/** When a business-email link stops working, as the email says it: "Thu, Nov 19 at 2:15 PM", in the coach's time zone. */
export function linkTime(iso: string, timeZone: string): string {
  const at = new Date(iso);
  const date = at.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone });
  const time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone });
  return `${date} at ${time}`;
}

/** True once the link has stopped working. */
export function linkExpired(iso: string | null, now: Date = new Date()): boolean {
  return iso !== null && new Date(iso).getTime() <= now.getTime();
}
