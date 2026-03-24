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

// Validate preference consistency
export function validatePreferences(persons: Person[]): Array<{ person: Person; issue: string }> {
  const issues: Array<{ person: Person; issue: string }> = [];

  for (const person of persons) {
    // Check if preference values are valid
    if (!["vegan", "vegetarisch", "egal"].includes(person.preference)) {
      issues.push({
        person,
        issue: `Ungültige Ernährungsform: ${person.preference}`,
      });
    }

    // Check if kitchen status is valid
    if (!["kann_gekocht_werden", "partner_kocht", "kann_nicht_gekocht_werden"].includes(person.kitchen)) {
      issues.push({
        person,
        issue: `Ungültiger Küche-Status: ${person.kitchen}`,
      });
    }

    // Check if course preference is valid (optional)
    if (person.coursePreference && !["keine", "Vorspeise", "Hauptgang", "Nachspeise"].includes(person.coursePreference)) {
      issues.push({
        person,
        issue: `Ungültige Gericht-Präferenz: ${person.coursePreference}`,
      });
    }
  }

  return issues;
}

