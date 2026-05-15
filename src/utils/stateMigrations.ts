import type { AppState } from "@/types/models";
import { DEFAULT_FAVORITE_PLACEHOLDERS } from "@/defaultValueMappings";
import { generateAllInvitations } from "@/utils/templateEngine";

export const CURRENT_STATE_FORMAT_VERSION = 2;

const migrations: Record<number, (state: AppState) => AppState> = {
  1: migrateV1ToV2,
};

/** v1 invitation placeholder token → v2 token(s) inside `{{…}}`. Longest `from` first at runtime. */
const V1_TO_V2_TEMPLATE_REPLACEMENTS: Array<[from: string, to: string]> = [
  ["IsstBei1Team", "Gastgeber1.PersonMitKüche.Name}} und {{Gastgeber1.PersonOhneKüche.Name"],
  ["IsstBei1", "Gastgeber1.PersonMitKüche.Name}} und {{Gastgeber1.PersonOhneKüche.Name"],
  ["IsstBei2Team", "Gastgeber2.PersonMitKüche.Name}} und {{Gastgeber2.PersonOhneKüche.Name"],
  ["IsstBei2", "Gastgeber2.PersonMitKüche.Name}} und {{Gastgeber2.PersonOhneKüche.Name"],
  ["IsstBei1Ernährungsform", "Gastgeber1.Ernährungsform"],
  ["IsstBei2Ernährungsform", "Gastgeber2.Ernährungsform"],
  ["IsstBei1Adresse", "Gastgeber1.PersonMitKüche.Adresse"],
  ["IsstBei2Adresse", "Gastgeber2.PersonMitKüche.Adresse"],
  ["IsstBei1Gang", "Gastgeber1.Gang"],
  ["IsstBei2Gang", "Gastgeber2.Gang"],
  ["KochtUnverträglichkeiten", "team.Unverträglichkeiten"],
  ["KochtErnährungsform", "team.Ernährungsform"],
  ["KochtAdresse", "team.Adresse"],
  ["KochtKüche", "team.Adresse"],
  ["KochtGang", "team.Gang"],
  ["KochtGäste", "team.Gäste"],
  ["TeamErnährungsform", "team.Ernährungsform"],
  ["TeamPräferenz", "team.Ernährungsform"],
  ["TeamPartner", "Partner.Name"],
  ["Gericht-Präferenz", "Person.Gericht-Präferenz"],
  ["Unverträglichkeiten", "Person.Unverträglichkeiten"],
  ["Ernährungsform", "Person.Ernährungsform"],
  ["Präferenz", "Person.Ernährungsform"],
  ["Adresse", "Person.Adresse"],
  ["Partner", "Person.Partner"],
  ["Gruppe", "Person.Partner"],
  ["Küche", "Person.Küche"],
  ["Name", "Person.Name"],
];

const SORTED_V1_TO_V2_TEMPLATE_REPLACEMENTS = [...V1_TO_V2_TEMPLATE_REPLACEMENTS].sort(
  (a, b) => b[0].length - a[0].length
);

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function migrateV1TemplatePlaceholders(text: string, customFieldNames: string[]): string {
  let result = text;

  for (const [from, to] of SORTED_V1_TO_V2_TEMPLATE_REPLACEMENTS) {
    const pattern = new RegExp(`\\{\\{${escapeRegexLiteral(from)}\\}\\}`, "g");
    result = result.replace(pattern, `{{${to}}}`);
  }

  const sortedCustom = [...customFieldNames].sort((a, b) => b.length - a.length);
  for (const fieldName of sortedCustom) {
    if (fieldName.startsWith("Person.")) continue;
    const pattern = new RegExp(`\\{\\{${escapeRegexLiteral(fieldName)}\\}\\}`, "g");
    result = result.replace(pattern, `{{Person.${fieldName}}}`);
  }

  return result;
}

function migrateV1FavoritePlaceholderIds(
  favorites: string[],
  customFieldNames: string[]
): string[] {
  const migrated = favorites.map((id) =>
    migrateV1TemplatePlaceholders(`{{${id}}}`, customFieldNames).slice(2, -2)
  );
  return [...new Set(migrated)];
}

export function migrateAppStateToCurrent(state: AppState, fromVersion: number): AppState {
  let version = fromVersion;
  let current = state;
  while (version < CURRENT_STATE_FORMAT_VERSION) {
    const step = migrations[version];
    if (!step) {
      throw new Error(`Missing state migration from version ${version} to ${version + 1}`);
    }
    current = step(current);
    version += 1;
  }
  return current;
}

export function parseStoredEnvelopeVersion(json: string): number {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (parsed && typeof parsed === "object" && "data" in parsed) {
      const envelope = parsed as { version?: unknown };
      if (typeof envelope.version === "number") {
        return envelope.version;
      }
    }
  } catch {
    // fall through
  }
  return 1;
}

function migrateV1ToV2(state: AppState): AppState {
  const customFieldNames = Object.values(state.customFields)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  const invitationTemplate = migrateV1TemplatePlaceholders(
    state.invitationTemplate ?? "",
    customFieldNames
  );

  const generatedInvitations: Record<string, string> = {};
  for (const [personId, text] of Object.entries(state.generatedInvitations ?? {})) {
    generatedInvitations[personId] = migrateV1TemplatePlaceholders(text, customFieldNames);
  }

  const hadFavorites =
    Array.isArray(state.favoritePlaceholders) && state.favoritePlaceholders.length > 0;
  const favoritePlaceholders = hadFavorites
    ? migrateV1FavoritePlaceholderIds(state.favoritePlaceholders, customFieldNames)
    : [...DEFAULT_FAVORITE_PLACEHOLDERS];

  let next: AppState = {
    ...state,
    invitationTemplate,
    generatedInvitations,
    favoritePlaceholders,
  };

  if (next.distribution.length > 0 && next.persons.length > 0) {
    next = {
      ...next,
      generatedInvitations: generateAllInvitations(
        next.invitationTemplate,
        next.persons,
        next.teams,
        next.distribution,
        next.customFields,
        next.columnMapping
      ),
    };
  }

  return next;
}
