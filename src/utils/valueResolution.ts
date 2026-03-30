import type {
  CoursePreference,
  FoodPreference,
  KitchenStatus,
  Person,
  ValueMapping,
} from "@/types/models";

/** Zeile aus State: Preset vs. nachträglich (isDefault). */
export type MappingSource = "user" | "default" | null;

export interface ResolvedField<T extends string> {
  value: T | null;
  source: MappingSource;
}

function isFoodPreference(s: string): s is FoodPreference {
  return s === "vegan" || s === "vegetarisch" || s === "egal";
}

function isKitchenStatus(s: string): s is KitchenStatus {
  return (
    s === "kann_gekocht_werden" ||
    s === "partner_kocht" ||
    s === "kann_nicht_gekocht_werden"
  );
}

function isCoursePreference(s: string): s is CoursePreference {
  return s === "keine" || s === "Vorspeise" || s === "Hauptgang" || s === "Nachspeise";
}

/** Letzte passende Zeile gewinnt (überschreibt frühere Einträge). */
function findMapping(
  mappings: ValueMapping[],
  field: ValueMapping["field"],
  raw: string
): ValueMapping | undefined {
  const lower = raw.trim().toLowerCase();
  let found: ValueMapping | undefined;
  for (const m of mappings) {
    if (m.field === field && m.rawValue.trim().toLowerCase() === lower) {
      found = m;
    }
  }
  return found;
}

function sourceFromMatch(m: ValueMapping): MappingSource {
  return m.isDefault === true ? "default" : "user";
}

export function resolvePreferenceRaw(
  raw: string,
  mappings: ValueMapping[]
): ResolvedField<FoodPreference> {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null, source: null };

  const match = findMapping(mappings, "preference", trimmed);
  if (match && isFoodPreference(match.mappedValue)) {
    return { value: match.mappedValue, source: sourceFromMatch(match) };
  }
  return { value: null, source: null };
}

export function resolveKitchenRaw(
  raw: string,
  mappings: ValueMapping[]
): ResolvedField<KitchenStatus> {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null, source: null };

  const match = findMapping(mappings, "kitchen", trimmed);
  if (match && isKitchenStatus(match.mappedValue)) {
    return { value: match.mappedValue, source: sourceFromMatch(match) };
  }
  return { value: null, source: null };
}

export function resolveCourseRaw(
  raw: string,
  mappings: ValueMapping[]
): ResolvedField<CoursePreference> {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null, source: null };

  const match = findMapping(mappings, "coursePreference", trimmed);
  if (match && isCoursePreference(match.mappedValue)) {
    return { value: match.mappedValue, source: sourceFromMatch(match) };
  }
  return { value: null, source: null };
}

export function formatFoodPreferenceLabel(p: string): string {
  return p;
}

export function formatKitchenLabel(k: string): string {
  switch (k as KitchenStatus) {
    case "kann_gekocht_werden":
      return "bei mir";
    case "partner_kocht":
      return "bei Partner";
    case "kann_nicht_gekocht_werden":
      return "nicht";
    default:
      return k;
  }
}

export function formatCourseLabel(c: string): string {
  return c;
}

export function mappingSourceLabel(source: MappingSource): string {
  if (source === "user") return "Benutzer-Mapping";
  if (source === "default") return "Standard-Mapping";
  return "";
}

/** Effektive Werte = manuell (falls gesetzt), sonst Mapping-Ergebnis. */
export function recomputeEffectiveFields(
  person: Person,
  userMappings: ValueMapping[]
): Person {
  const rawPref = person._rawValues?.preference;
  const rawKit = person._rawValues?.kitchen;
  const rawCourse = person._rawValues?.coursePreference;

  const mappedPref =
    rawPref !== undefined
      ? resolvePreferenceRaw(String(rawPref), userMappings)
      : { value: null as FoodPreference | null, source: null as MappingSource };
  const mappedKit =
    rawKit !== undefined
      ? resolveKitchenRaw(String(rawKit), userMappings)
      : { value: null as KitchenStatus | null, source: null as MappingSource };
  const mappedCourse =
    rawCourse !== undefined
      ? resolveCourseRaw(String(rawCourse), userMappings)
      : { value: null as CoursePreference | null, source: null as MappingSource };

  const legacyPref =
    rawPref === undefined && person.preference && isFoodPreference(person.preference)
      ? person.preference
      : undefined;
  const legacyKit =
    rawKit === undefined && person.kitchen && isKitchenStatus(person.kitchen)
      ? person.kitchen
      : undefined;
  const legacyCourse =
    rawCourse === undefined &&
    person.coursePreference &&
    isCoursePreference(person.coursePreference)
      ? person.coursePreference
      : undefined;

  return {
    ...person,
    preference:
      person.preferenceManual !== undefined
        ? person.preferenceManual
        : mappedPref.value ?? legacyPref ?? undefined,
    kitchen:
      person.kitchenManual !== undefined
        ? person.kitchenManual
        : mappedKit.value ?? legacyKit ?? undefined,
    coursePreference:
      person.coursePreferenceManual !== undefined
        ? person.coursePreferenceManual
        : mappedCourse.value ?? legacyCourse ?? undefined,
  };
}

export function getMappedOnlyPreference(
  person: Person,
  userMappings: ValueMapping[]
): ResolvedField<FoodPreference> {
  const raw = person._rawValues?.preference;
  if (raw === undefined) return { value: null, source: null };
  return resolvePreferenceRaw(String(raw), userMappings);
}

export function getMappedOnlyKitchen(
  person: Person,
  userMappings: ValueMapping[]
): ResolvedField<KitchenStatus> {
  const raw = person._rawValues?.kitchen;
  if (raw === undefined) return { value: null, source: null };
  return resolveKitchenRaw(String(raw), userMappings);
}

export function getMappedOnlyCourse(
  person: Person,
  userMappings: ValueMapping[]
): ResolvedField<CoursePreference> {
  const raw = person._rawValues?.coursePreference;
  if (raw === undefined) return { value: null, source: null };
  return resolveCourseRaw(String(raw), userMappings);
}
