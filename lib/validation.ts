/* Validation des entrées côté serveur (et réutilisable côté client). */

/** Téléphone tunisien : 8 chiffres, préfixe +216 / 216 optionnel.
   Retourne le numéro normalisé "216XXXXXXXX" ou null si invalide. */
export function normalizeTunisianPhone(raw: string): string | null {
  if (!raw) return null;
  // Enlève espaces, tirets, points, parenthèses
  let s = raw.replace(/[\s.\-()]/g, "");
  if (s.startsWith("+216")) s = s.slice(4);
  else if (s.startsWith("216") && s.length === 11) s = s.slice(3);
  else if (s.startsWith("00216")) s = s.slice(5);
  if (!/^\d{8}$/.test(s)) return null;
  // Les numéros TN commencent par 2,3,4,5,7,9 (mobiles/fixes). On reste souple.
  if (!/^[234579]/.test(s)) return null;
  return `216${s}`;
}

export function isValidName(name: string): boolean {
  const n = name.trim();
  return n.length >= 2 && n.length <= 60;
}

export function sanitizeNote(note: string | undefined | null): string {
  if (!note) return "";
  return note.trim().slice(0, 300);
}
