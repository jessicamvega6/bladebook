/** "Sarah Park" → "SP"; one name gives one letter. Avatars show initials: photos are Phase 2 (A1). */
export function initials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
}

/** The first word of a full name: "Ava Park" → "Ava". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

/** "Coach Dana", "Coach Dana and Coach Ben", "Coach Dana, Coach Ben and Coach Lauren". */
export function joinNames(names: string[], word = 'and'): string {
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} ${word} ${names[names.length - 1]}`;
}
