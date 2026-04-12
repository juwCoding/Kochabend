import type { Person } from "@/types/models";
import { hostsAtOwnKitchen } from "@/utils/teamDerived";

export interface AutoTeamUnmatched {
  person: Person;
  reason: string;
}

export interface AutoTeamAssignmentResult {
  pairs: [Person, Person][];
  unmatched: AutoTeamUnmatched[];
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const REASON_NO_HOST_LEFT =
  "Es war keine Person mit eigener Küche mehr frei — automatische Paarung nicht möglich.";

const REASON_ODD_HOST =
  "Ungerade Anzahl an Personen mit eigener Küche — automatisch kein weiterer Partner verfügbar.";

/**
 * Verteilt nur übergebene, noch nicht verplante Personen:
 * Zuerst „ohne eigene Küche“ (beim Partner / nicht kochbar) zufällig auf „mit eigener Küche“,
 * danach verbleibende „mit Küche“ paarweise untereinander.
 */
export function computeAutoTeamAssignment(available: Person[]): AutoTeamAssignmentResult {
  const pairs: [Person, Person][] = [];
  const unmatched: AutoTeamUnmatched[] = [];

  if (available.length === 0) {
    return { pairs: [], unmatched: [] };
  }

  const withKitchen = shuffle(available.filter((p) => hostsAtOwnKitchen(p.kitchen)));
  const withoutKitchen = shuffle(available.filter((p) => !hostsAtOwnKitchen(p.kitchen)));

  let hi = 0;
  let wi = 0;
  while (hi < withKitchen.length && wi < withoutKitchen.length) {
    pairs.push([withKitchen[hi], withoutKitchen[wi]]);
    hi++;
    wi++;
  }

  const remainingHosts = withKitchen.slice(hi);
  const remainingNonHosts = withoutKitchen.slice(wi);

  const shHosts = shuffle(remainingHosts);
  for (let i = 0; i + 1 < shHosts.length; i += 2) {
    pairs.push([shHosts[i], shHosts[i + 1]]);
  }
  if (shHosts.length % 2 === 1) {
    const lone = shHosts[shHosts.length - 1];
    unmatched.push({ person: lone, reason: REASON_ODD_HOST });
  }

  for (const p of remainingNonHosts) {
    unmatched.push({ person: p, reason: REASON_NO_HOST_LEFT });
  }

  return { pairs, unmatched };
}
