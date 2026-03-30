import type { Person } from "@/types/models";

// Calculate Levenshtein distance for fuzzy matching
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

// Calculate similarity score (0-1, higher is more similar)
export function calculateSimilarity(str1: string, str2: string): number {
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 1;
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  return 1 - distance / maxLength;
}

// Find similar names
export function findSimilarNames(persons: Person[], threshold: number = 0.7): Array<{ person1: Person; person2: Person; similarity: number }> {
  const similar: Array<{ person1: Person; person2: Person; similarity: number }> = [];

  for (let i = 0; i < persons.length; i++) {
    for (let j = i + 1; j < persons.length; j++) {
      const similarity = calculateSimilarity(persons[i].name, persons[j].name);
      if (similarity >= threshold && similarity < 1) {
        similar.push({
          person1: persons[i],
          person2: persons[j],
          similarity,
        });
      }
    }
  }

  return similar;
}

// Find duplicate addresses/kitchens
export function findDuplicateAddresses(persons: Person[]): Array<{ address: string; persons: Person[] }> {
  const addressMap = new Map<string, Person[]>();

  for (const person of persons) {
    const normalizedAddress = person.kitchenAddress.trim().toLowerCase();
    if (!addressMap.has(normalizedAddress)) {
      addressMap.set(normalizedAddress, []);
    }
    addressMap.get(normalizedAddress)!.push(person);
  }

  return Array.from(addressMap.entries())
    .filter(([_, persons]) => persons.length > 1)
    .map(([address, persons]) => ({ address, persons }));
}

const VALID_PREF = ["vegan", "vegetarisch", "egal"] as const;
const VALID_KITCHEN = [
  "kann_gekocht_werden",
  "partner_kocht",
  "kann_nicht_gekocht_werden",
] as const;
const VALID_COURSE = ["keine", "Vorspeise", "Hauptgang", "Nachspeise"] as const;

/** Gericht-Präferenz nur, wenn die Spalte in Schritt 1 zugeordnet wurde. */
export function isCourseColumnMapped(columnMapping: Record<string, string>): boolean {
  return Object.values(columnMapping).includes("coursePreference");
}

// Validate preference consistency (Schritt 2)
export function validatePreferences(
  persons: Person[],
  columnMapping: Record<string, string> = {}
): Array<{ person: Person; issue: string }> {
  const issues: Array<{ person: Person; issue: string }> = [];
  const validateCourse = isCourseColumnMapped(columnMapping);

  for (const person of persons) {
    const rawPref = person._rawValues?.preference;
    if (!person.preference || !VALID_PREF.includes(person.preference as (typeof VALID_PREF)[number])) {
      issues.push({
        person,
        issue: `Ernährungsform: Kein gültiger Wert (Mapping oder manuell). Aus CSV: "${rawPref ?? ""}"`,
      });
    }

    const rawKit = person._rawValues?.kitchen;
    if (!person.kitchen || !VALID_KITCHEN.includes(person.kitchen as (typeof VALID_KITCHEN)[number])) {
      issues.push({
        person,
        issue: `Küche: Kein gültiger Wert (Mapping oder manuell). Aus CSV: "${rawKit ?? ""}"`,
      });
    }

    if (validateCourse) {
      const rawCourse = person._rawValues?.coursePreference;
      if (
        !person.coursePreference ||
        !VALID_COURSE.includes(person.coursePreference as (typeof VALID_COURSE)[number])
      ) {
        issues.push({
          person,
          issue: `Gericht-Präferenz: Kein gültiger Wert (Mapping oder manuell). Aus CSV: "${rawCourse ?? ""}"`,
        });
      }
    }
  }

  return issues;
}

export function isStep2Valid(persons: Person[], columnMapping: Record<string, string> = {}): boolean {
  if (persons.length === 0) return false;
  return validatePreferences(persons, columnMapping).length === 0;
}

