import type { FoodPreference, Person, Team } from "@/types/models";

export function hasUsableKitchen(personKitchen?: string): boolean {
  return personKitchen === "kann_gekocht_werden" || personKitchen === "partner_kocht";
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

export function getTeamPersons(team: Team, persons: Person[]): { person1?: Person; person2?: Person } {
  return {
    person1: persons.find((p) => p.id === team.person1Id),
    person2: persons.find((p) => p.id === team.person2Id),
  };
}

export function getTeamKitchenOptions(team: Team, persons: Person[]): string[] {
  const { person1, person2 } = getTeamPersons(team, persons);
  const options: string[] = [];
  if (person1 && hasUsableKitchen(person1.kitchen) && person1.kitchenAddress) options.push(person1.kitchenAddress);
  if (person2 && hasUsableKitchen(person2.kitchen) && person2.kitchenAddress) options.push(person2.kitchenAddress);
  if (options.length > 0) return Array.from(new Set(options));

  // Fallback, wenn beide keine nutzbare Küche haben.
  if (person1?.kitchenAddress) return [person1.kitchenAddress];
  if (person2?.kitchenAddress) return [person2.kitchenAddress];
  return [];
}

export function getTeamPreference(team: Team, persons: Person[]): FoodPreference {
  const { person1, person2 } = getTeamPersons(team, persons);
  return combinePreference(person1?.preference, person2?.preference);
}

