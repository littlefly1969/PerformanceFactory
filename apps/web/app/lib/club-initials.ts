/**
 * Iniziali del circolo al posto del logo, come nella demo V11: prima e ultima
 * parola significativa del nome («Padel Club Milano Nord» → «PN»). Le parole
 * brevi («di», «La») non contano, se ne resta almeno una.
 */
export function clubInitials(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  const long = words.filter((word) => word.length > 2);
  const pick = long.length ? long : words;
  if (!pick.length) return "";
  const first = pick[0]!.charAt(0);
  const last = pick.length > 1 ? pick[pick.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase();
}
