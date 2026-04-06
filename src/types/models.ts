// Essenpräferenz
export type FoodPreference = "vegan" | "vegetarisch" | "egal";

// Küche-Status
export type KitchenStatus = 
  | "kann_gekocht_werden"  // in meiner kann gekocht werden
  | "partner_kocht"         // in der meines Partners wird gekocht (nur wenn Partner schon vergeben)
  | "kann_nicht_gekocht_werden"; // in meiner kann nicht gekocht werden

// Gericht-Präferenz
export type CoursePreference = "keine" | "Vorspeise" | "Hauptgang" | "Nachspeise";

// Gang-Typ
export type Course = "Vorspeise" | "Hauptgang" | "Nachspeise";

// Person
export interface Person {
  id: string;
  name: string;
  /** Effektiver Wert: manuell gesetzt oder aus Mapping (Standard/Benutzer). */
  preference?: FoodPreference;
  intolerances: string;
  partner?: string; // Name des Partners (früher "group")
  kitchen?: KitchenStatus;
  kitchenAddress: string; // Adresse der Küche
  coursePreference?: CoursePreference;
  /** Explizite Auswahl in Schritt 2 (schlägt Mapping). */
  preferenceManual?: FoodPreference;
  kitchenManual?: KitchenStatus;
  coursePreferenceManual?: CoursePreference;
  // Ursprüngliche CSV-Werte (vor Mapping)
  _rawValues?: {
    preference?: string;
    kitchen?: string;
    coursePreference?: string;
  };
  /** Freifelder aus Schritt 1 (fieldId z. B. custom_… → Zellwert). */
  customFieldValues?: Record<string, string>;
  /**
   * Textfelder aus CSV (Snapshot), unverändert bei manueller Bearbeitung in Schritt 2.
   * Nicht für Ernährungsform / Küche / Gericht (dort _rawValues + Mapping).
   */
  textSnapshot?: {
    name?: string;
    intolerances?: string;
    partner?: string;
    kitchenAddress?: string;
    custom?: Record<string, string>;
  };
}

// Kitchen (identifiziert über Adresse)
export interface Kitchen {
  id: string; // Adresse als Identifier (kitchenAddress)
  address: string; // Adresse der Küche
  capacity: number; // 1 pro Zeitslot
  availableSlots: Course[]; // Verfügbare Zeitslots
}

// Team
export interface Team {
  id: string;
  person1Id: string;
  person2Id: string;
  kitchenId: string; // Primäre Team-Küche (Adresse)
  secondaryKitchenId?: string; // Optionale zweite Team-Küche (Adresse)
  preference: FoodPreference; // Kombinierte Präferenz (vegan wenn einer vegan, vegetarisch wenn einer vegetarisch, sonst egal)
}

// Gastgeber-Verhältnis: Welches Team isst bei welchem Team
export interface GuestRelation {
  guestTeamId: string; // Team, das zu Gast ist
  hostTeamId: string;  // Team, bei dem gegessen wird
  course: Course;      // Welcher Gang
}

// Verteilung: Welches Team kocht welchen Gang
export interface Distribution {
  teamId: string;
  course: Course; // Welchen Gang kocht das Team
  kitchenId: string; // In welcher Küche
  guestRelations: GuestRelation[]; // Bei welchen Teams isst dieses Team
}

// Value Mapping für Küche, Ernährungsform, Gericht-Präferenz
export interface ValueMapping {
  field: "kitchen" | "preference" | "coursePreference";
  rawValue: string; // Wert aus CSV
  mappedValue: string; // Zugeordneter Wert
  /** Zeile aus den eingebauten Standard-Mappings (nur Metadaten / UI) */
  isDefault?: boolean;
}

export interface SortSpec {
  key: string;
  dir: "asc" | "desc";
}

/** Anzahl der Wizard-Schritte (muss mit `STEPS` in App.tsx übereinstimmen). */
export const WIZARD_STEP_COUNT = 5;

export function clampWizardStepIndex(step: number): number {
  return Math.max(0, Math.min(Math.floor(step), WIZARD_STEP_COUNT - 1));
}

// Vollständiger App-State
export interface AppState {
  /** Aktuell geöffneter Wizard-Schritt (0-basiert), persistent. */
  currentStep: number;

  // Schritt 1: CSV Import
  csvData: string[][]; // Rohe CSV-Daten
  csvRawData: string[][]; // Rohe CSV-Daten vor Header-Entfernung
  columnMapping: Record<string, string>; // Mapping von CSV-Spalten zu Person-Feldern
  hasHeader: boolean;
  customFields: Record<string, string>; // Freifelder: fieldId -> fieldName
  valueMappings: ValueMapping[]; // Value-Mappings für Küche, Ernährungsform, Gericht-Präferenz
  
  // Schritt 2: Bereinigte Personen
  persons: Person[];
  step2SortSpecs: SortSpec[];
  
  // Schritt 3: Teams
  teams: Team[];
  step3SortSpecs: SortSpec[];
  
  // Schritt 4: Verteilung
  distribution: Distribution[];
  
  // Schritt 5: Template
  invitationTemplate: string;
  generatedInvitations: Record<string, string>; // Person ID -> generierte Einladung
}

// Initialer State (ohne Standard-Wert-Mappings — vollständig: getDefaultAppState() in defaultValueMappings.ts)
export const initialAppState: AppState = {
  currentStep: 0,
  csvData: [],
  csvRawData: [],
  columnMapping: {},
  hasHeader: true,
  customFields: {},
  valueMappings: [],
  persons: [],
  step2SortSpecs: [],
  teams: [],
  step3SortSpecs: [],
  distribution: [],
  invitationTemplate: "",
  generatedInvitations: {},
};

// Spalten-Mapping Optionen
export const COLUMN_FIELDS = {
  name: "Name",
  preference: "Ernährungsform",
  intolerances: "Unverträglichkeiten",
  partner: "Partner", // Name des Partners
  kitchen: "Küche", // Status: bei mir/bei partner/nicht
  kitchenAddress: "Küchen-Adresse", // Adresse der Küche
  coursePreference: "Gericht-Präferenz",
} as const;

export type ColumnField = keyof typeof COLUMN_FIELDS;

