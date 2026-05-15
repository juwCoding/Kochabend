import { type AppState, type ValueMapping, initialAppState } from "@/types/models";

/**
 * Standard-Zuordnungen (CSV-Rohwert → kanonischer Wert).
 * Identisch zu manuellen Einträgen; stehen initial in `AppState.valueMappings`.
 */
export const DEFAULT_VALUE_MAPPINGS: ValueMapping[] = [
  // Ernährungsform — kanonische Literale
  { field: "preference", rawValue: "vegan", mappedValue: "vegan", isDefault: true },
  { field: "preference", rawValue: "vegetarisch", mappedValue: "vegetarisch", isDefault: true },
  { field: "preference", rawValue: "egal", mappedValue: "egal", isDefault: true },

  // Küche — kanonische Literale
  { field: "kitchen", rawValue: "kann_gekocht_werden", mappedValue: "kann_gekocht_werden", isDefault: true },
  { field: "kitchen", rawValue: "partner_kocht", mappedValue: "partner_kocht", isDefault: true },
  { field: "kitchen", rawValue: "kann_nicht_gekocht_werden", mappedValue: "kann_nicht_gekocht_werden", isDefault: true },
  { field: "kitchen", rawValue: "bei_mir", mappedValue: "kann_gekocht_werden", isDefault: true },
  { field: "kitchen", rawValue: "bei mir", mappedValue: "kann_gekocht_werden", isDefault: true },
  { field: "kitchen", rawValue: "ja", mappedValue: "kann_gekocht_werden", isDefault: true },
  { field: "kitchen", rawValue: "kochen", mappedValue: "kann_gekocht_werden", isDefault: true },
  { field: "kitchen", rawValue: "partner", mappedValue: "partner_kocht", isDefault: true },
  { field: "kitchen", rawValue: "bei partner", mappedValue: "partner_kocht", isDefault: true },
  { field: "kitchen", rawValue: "beim_partner", mappedValue: "partner_kocht", isDefault: true },
  { field: "kitchen", rawValue: "bei_partner", mappedValue: "partner_kocht", isDefault: true },
  { field: "kitchen", rawValue: "nein", mappedValue: "kann_nicht_gekocht_werden", isDefault: true },
  { field: "kitchen", rawValue: "nicht", mappedValue: "kann_nicht_gekocht_werden", isDefault: true },

  // Gericht-Präferenz — kanonische Literale
  { field: "coursePreference", rawValue: "keine", mappedValue: "keine", isDefault: true },
  { field: "coursePreference", rawValue: "Vorspeise", mappedValue: "Vorspeise", isDefault: true },
  { field: "coursePreference", rawValue: "Hauptspeise", mappedValue: "Hauptspeise", isDefault: true },
  { field: "coursePreference", rawValue: "Hauptgang", mappedValue: "Hauptspeise", isDefault: true },
  { field: "coursePreference", rawValue: "Nachspeise", mappedValue: "Nachspeise", isDefault: true },
  { field: "coursePreference", rawValue: "keine_präferenz", mappedValue: "keine", isDefault: true },
  { field: "coursePreference", rawValue: "keine präferenz", mappedValue: "keine", isDefault: true },
  { field: "coursePreference", rawValue: "vorspeise", mappedValue: "Vorspeise", isDefault: true },
  { field: "coursePreference", rawValue: "starter", mappedValue: "Vorspeise", isDefault: true },
  { field: "coursePreference", rawValue: "hauptspeise", mappedValue: "Hauptspeise", isDefault: true },
  { field: "coursePreference", rawValue: "hauptgang", mappedValue: "Hauptspeise", isDefault: true },
  { field: "coursePreference", rawValue: "main", mappedValue: "Hauptspeise", isDefault: true },
  { field: "coursePreference", rawValue: "nachspeise", mappedValue: "Nachspeise", isDefault: true },
  { field: "coursePreference", rawValue: "dessert", mappedValue: "Nachspeise", isDefault: true },
];

/** Default favorite placeholder ids (v2). */
export const DEFAULT_FAVORITE_PLACEHOLDERS: readonly string[] = [
  "Person.Name",
  "Person.Telefonnummer",
  "Team.Unverträglichkeiten",
  "Team.Adresse",
  "Team.Gang",
  "Team.Ernährungsform",
  "Team.Gäste",
  "Partner.Name",
  "Partner.Telefonnummer",
  "Gastgeber1.Gang",
  "Gastgeber1.PersonMitKüche.Adresse",
  "Gastgeber1.PersonMitKüche.Name",
  "Gastgeber1.PersonMitKüche.Telefonnummer",
  "Gastgeber2.Gang",
  "Gastgeber2.PersonMitKüche.Adresse",
  "Gastgeber2.PersonMitKüche.Name",
  "Gastgeber2.PersonMitKüche.Telefonnummer",
];

/** Vollständiger App-Startzustand inkl. Standard-Mappings. */
export function getDefaultAppState(): AppState {
  return {
    ...initialAppState,
    valueMappings: [...DEFAULT_VALUE_MAPPINGS],
    favoritePlaceholders: [...DEFAULT_FAVORITE_PLACEHOLDERS],
  };
}

/** Alte gespeicherte States ohne Mappings mit Standardliste füllen. */
export function hydrateValueMappingsIfEmpty(stored: ValueMapping[] | undefined): ValueMapping[] {
  if (stored && stored.length > 0) return stored;
  return [...DEFAULT_VALUE_MAPPINGS];
}
