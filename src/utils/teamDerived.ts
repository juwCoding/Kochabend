import type { Course, CoursePreference, FoodPreference, Person, Team } from "@/types/models";

/** Ob die eigene Küchen-Adresse als Koch-Ort für das Team zählt („bei mir“). Nicht bei „beim Partner“. */
export function hostsAtOwnKitchen(kitchen?: string): boolean {
  return kitchen === "kann_gekocht_werden";
}

function nonEmptyAddress(addr: string | undefined): addr is string {
  return typeof addr === "string" && addr.trim().length > 0;
}

export function preferenceRank(preference?: FoodPreference): number {
  if (preference === "vegan") return 3;
  if (preference === "vegetarisch") return 2;
  return 1; // egal oder fehlend
}

export function combinePreference(
  person1Preference?: FoodPreference,
  person2Preference?: FoodPreference
): FoodPreference {
  const p1 = person1Preference ?? "egal";
  const p2 = person2Preference ?? "egal";
  return preferenceRank(p1) >= preferenceRank(p2) ? p1 : p2;
}

/** Alle Person-IDs aus Team-Zuordnungen (jeweils zwei pro Team). */
export function teamPersonReferences(teams: Team[]): string[] {
  return teams.flatMap((t) => [t.person1Id, t.person2Id]);
}

/**
 * Anzahl „verschwendeter“ Plätze: gleiche ID kommt in mehreren Teams (oder doppelt im selben Team) vor.
 * Dann ist `personen − eindeutigInTeams` größer als `2 × teams − personen`.
 */
export function countWastedTeamSlots(teams: Team[]): number {
  const refs = teamPersonReferences(teams);
  return refs.length - new Set(refs).size;
}

/** Person-IDs, die in den Teams mehr als einmal vorkommen. */
export function getPersonIdsWithDuplicateTeamAssignments(teams: Team[]): string[] {
  const counts = new Map<string, number>();
  for (const id of teamPersonReferences(teams)) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, c]) => c > 1).map(([id]) => id);
}

/** In Teams referenzierte IDs, die nicht mehr in `persons` existieren (z. B. nach CSV-Neuimport). */
export function orphanTeamPersonIds(teams: Team[], persons: Person[]): string[] {
  const valid = new Set(persons.map((p) => p.id));
  return [...new Set(teamPersonReferences(teams).filter((id) => !valid.has(id)))];
}

export function getTeamPersons(team: Team, persons: Person[]): { person1?: Person; person2?: Person } {
  return {
    person1: persons.find((p) => p.id === team.person1Id),
    person2: persons.find((p) => p.id === team.person2Id),
  };
}

export function getTeamKitchenOptions(team: Team, persons: Person[]): string[] {
  const { person1, person2 } = getTeamPersons(team, persons);
  const options: string[] = [];
  if (person1 && hostsAtOwnKitchen(person1.kitchen) && nonEmptyAddress(person1.kitchenAddress)) {
    options.push(person1.kitchenAddress.trim());
  }
  if (person2 && hostsAtOwnKitchen(person2.kitchen) && nonEmptyAddress(person2.kitchenAddress)) {
    options.push(person2.kitchenAddress.trim());
  }
  return Array.from(new Set(options));
}

/** Schritt 3 → 4: mindestens ein Team, und jedes Team hat eine erkannte Koch-Küche (wie in der Team-Tabelle). */
export function isStep3Valid(teams: Team[], persons: Person[]): boolean {
  if (teams.length === 0) return false;
  return teams.every((team) => getTeamKitchenOptions(team, persons).length > 0);
}

export function getTeamPreference(team: Team, persons: Person[]): FoodPreference {
  const { person1, person2 } = getTeamPersons(team, persons);
  return combinePreference(person1?.preference, person2?.preference);
}

function asCoursePreference(value: CoursePreference | undefined): Course | null {
  if (value === "Vorspeise" || value === "Hauptgang" || value === "Nachspeise") {
    return value;
  }
  return null;
}

/**
 * Aggregiert die Speisen-/Gangpräferenzen aus den zwei Team-Personen.
 * - Spalte nicht in Schritt 1 gewählt: []
 * - Spalte gewählt: bis zu zwei Einträge (ohne "keine")
 */
export function getTeamCoursePreferences(
  team: Team,
  persons: Person[],
  includeCoursePreference: boolean
): Course[] {
  if (!includeCoursePreference) return [];
  const { person1, person2 } = getTeamPersons(team, persons);
  const preferences: Array<Course | null> = [
    asCoursePreference(person1?.coursePreference),
    asCoursePreference(person2?.coursePreference),
  ];
  return Array.from(new Set(preferences.filter((pref): pref is Course => pref !== null)));
}

