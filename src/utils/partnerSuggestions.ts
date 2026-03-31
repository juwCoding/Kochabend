import type { Person } from "@/types/models";
import { calculateSimilarity } from "@/utils/matching";

const SIMILARITY_THRESHOLD = 0.72;

function normalizeName(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Ordnet einen freien Partner-Text einer Person zu (exakter Name oder Fuzzy).
 * Schließt `excludeId` aus (nicht mit sich selbst matchen).
 */
export function resolvePartnerHintToPerson(
  hint: string,
  persons: Person[],
  excludeId?: string
): Person | null {
  const h = normalizeName(hint);
  if (!h) return null;

  let exact: Person | undefined;
  for (const p of persons) {
    if (excludeId && p.id === excludeId) continue;
    if (normalizeName(p.name) === h) {
      exact = p;
      break;
    }
  }
  if (exact) return exact;

  let best: Person | null = null;
  let bestScore = 0;
  for (const p of persons) {
    if (excludeId && p.id === excludeId) continue;
    const score = calculateSimilarity(h, normalizeName(p.name));
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  if (best && bestScore >= SIMILARITY_THRESHOLD) return best;
  return null;
}

export interface MutualPartnerPair {
  person1: Person;
  person2: Person;
}

export interface OneWayPartnerPair {
  /** Person, die im Partner-Feld die andere genannt hat */
  seeker: Person;
  /** Person, auf die verwiesen wurde */
  target: Person;
}

export interface UnmatchedPartnerRow {
  person: Person;
  partnerText: string;
}

function pairKey(aId: string, bId: string): string {
  return aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
}

export interface PartnerSuggestionBuckets {
  /** Wechselseitig: beide Partner-Felder passen zueinander */
  mutualPairs: MutualPartnerPair[];
  /** Einseitig: A nennt B, aber nicht umgekehrt */
  oneWayPairs: OneWayPartnerPair[];
  /** Partner-Text gesetzt, aber keine passende Person gefunden */
  unmatchedPartnerText: UnmatchedPartnerRow[];
  /** Partner-Feld leer (nur Leerzeichen) */
  personsWithEmptyPartner: Person[];
}

/**
 * Kategorisiert Personen nach Partner-Feld für Schritt 3 (Vorschläge).
 * Keine Berücksichtigung von bereits erstellten Teams — das macht die UI.
 */
export function categorizePartnerFields(persons: Person[]): PartnerSuggestionBuckets {
  const mutualKeys = new Set<string>();
  const mutualPairs: MutualPartnerPair[] = [];

  for (let i = 0; i < persons.length; i++) {
    for (let j = i + 1; j < persons.length; j++) {
      const a = persons[i];
      const b = persons[j];
      const aToB = resolvePartnerHintToPerson(a.partner ?? "", persons, a.id);
      const bToA = resolvePartnerHintToPerson(b.partner ?? "", persons, b.id);
      if (aToB?.id === b.id && bToA?.id === a.id) {
        const key = pairKey(a.id, b.id);
        if (!mutualKeys.has(key)) {
          mutualKeys.add(key);
          mutualPairs.push({ person1: a, person2: b });
        }
      }
    }
  }

  const inMutual = new Set<string>();
  for (const m of mutualPairs) {
    inMutual.add(m.person1.id);
    inMutual.add(m.person2.id);
  }

  const oneWayKeys = new Set<string>();
  const oneWayPairs: OneWayPartnerPair[] = [];

  for (const seeker of persons) {
    const hint = seeker.partner?.trim();
    if (!hint) continue;

    const target = resolvePartnerHintToPerson(hint, persons, seeker.id);
    if (!target) continue;

    const key = pairKey(seeker.id, target.id);
    if (mutualKeys.has(key)) continue;

    const targetBack = resolvePartnerHintToPerson(target.partner ?? "", persons, target.id);
    const isMutual = targetBack?.id === seeker.id;
    if (isMutual) continue;

    const owKey = `${seeker.id}->${target.id}`;
    if (oneWayKeys.has(owKey)) continue;
    oneWayKeys.add(owKey);
    oneWayPairs.push({ seeker, target });
  }

  const unmatchedPartnerText: UnmatchedPartnerRow[] = [];
  const seenUnmatched = new Set<string>();

  for (const p of persons) {
    const hint = p.partner?.trim();
    if (!hint) continue;
    if (inMutual.has(p.id)) continue;

    const target = resolvePartnerHintToPerson(hint, persons, p.id);
    if (target) continue;

    if (!seenUnmatched.has(p.id)) {
      seenUnmatched.add(p.id);
      unmatchedPartnerText.push({ person: p, partnerText: hint });
    }
  }

  const personsWithEmptyPartner: Person[] = [];
  for (const p of persons) {
    if (!p.partner?.trim()) {
      personsWithEmptyPartner.push(p);
    }
  }

  return {
    mutualPairs,
    oneWayPairs,
    unmatchedPartnerText,
    personsWithEmptyPartner,
  };
}
