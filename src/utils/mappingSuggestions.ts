import type { Person, ValueMapping } from "@/types/models";
import { DEFAULT_VALUE_MAPPINGS } from "@/defaultValueMappings";
import { calculateSimilarity } from "@/utils/matching";
import {
  formatCourseLabel,
  formatFoodPreferenceLabel,
  formatKitchenLabel,
  resolveCourseRaw,
  resolveKitchenRaw,
  resolvePreferenceRaw,
} from "@/utils/valueResolution";

export type SuggestionField = "kitchen" | "preference" | "coursePreference";

export interface MappingSuggestion {
  field: SuggestionField;
  rawValue: string;
  suggestedMappedValue: string;
  score: number;
  source: "enum_column" | "text_field";
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function mappingExists(mappings: ValueMapping[], field: SuggestionField, raw: string): boolean {
  const n = norm(raw);
  return mappings.some((m) => m.field === field && norm(m.rawValue) === n);
}

function resolvedForField(
  mappings: ValueMapping[],
  field: SuggestionField,
  raw: string
): boolean {
  const t = raw.trim();
  if (!t) return true;
  switch (field) {
    case "preference":
      return resolvePreferenceRaw(t, mappings).value !== null;
    case "kitchen":
      return resolveKitchenRaw(t, mappings).value !== null;
    case "coursePreference":
      return resolveCourseRaw(t, mappings).value !== null;
    default:
      return false;
  }
}

/** Synonyme pro kanonischem Zielwert (inkl. Standard-Mappings). */
function buildLabelSets(): Record<SuggestionField, Map<string, Set<string>>> {
  const out: Record<SuggestionField, Map<string, Set<string>>> = {
    preference: new Map(),
    kitchen: new Map(),
    coursePreference: new Map(),
  };

  const add = (field: SuggestionField, mapped: string, label: string) => {
    const n = norm(label);
    if (!n) return;
    if (!out[field].has(mapped)) out[field].set(mapped, new Set());
    out[field].get(mapped)!.add(n);
  };

  for (const m of DEFAULT_VALUE_MAPPINGS) {
    if (m.field === "preference" || m.field === "kitchen" || m.field === "coursePreference") {
      add(m.field, m.mappedValue, m.rawValue);
      add(m.field, m.mappedValue, m.mappedValue);
    }
  }

  add("preference", "vegan", formatFoodPreferenceLabel("vegan"));
  add("preference", "vegetarisch", formatFoodPreferenceLabel("vegetarisch"));
  add("preference", "egal", formatFoodPreferenceLabel("egal"));

  add("kitchen", "kann_gekocht_werden", formatKitchenLabel("kann_gekocht_werden"));
  add("kitchen", "partner_kocht", formatKitchenLabel("partner_kocht"));
  add("kitchen", "kann_nicht_gekocht_werden", formatKitchenLabel("kann_nicht_gekocht_werden"));

  add("coursePreference", "keine", formatCourseLabel("keine"));
  add("coursePreference", "Vorspeise", formatCourseLabel("Vorspeise"));
  add("coursePreference", "Hauptgang", formatCourseLabel("Hauptgang"));
  add("coursePreference", "Nachspeise", formatCourseLabel("Nachspeise"));

  return out;
}

const LABEL_SETS = buildLabelSets();

function scoreAgainstMapped(
  rawNorm: string,
  field: SuggestionField,
  mappedValue: string
): number {
  const labels = LABEL_SETS[field].get(mappedValue);
  if (!labels || labels.size === 0) return 0;
  let best = 0;
  const minLenSubstring = 3;
  for (const lab of labels) {
    const sim = calculateSimilarity(rawNorm, lab);
    let score = sim;
    if (
      lab.length >= minLenSubstring &&
      rawNorm.length >= minLenSubstring &&
      (rawNorm.includes(lab) || lab.includes(rawNorm))
    ) {
      score = Math.max(score, 0.72);
    }
    best = Math.max(best, score);
  }
  return best;
}

function bestSuggestionForRaw(
  raw: string,
  field: SuggestionField,
  mappings: ValueMapping[],
  minScore: number
): { mappedValue: string; score: number } | null {
  const t = raw.trim();
  if (!t) return null;
  if (resolvedForField(mappings, field, t)) return null;
  if (mappingExists(mappings, field, t)) return null;

  const rawNorm = norm(t);
  const mappedKeys = [...LABEL_SETS[field].keys()];
  let best: { mappedValue: string; score: number } | null = null;
  for (const mappedValue of mappedKeys) {
    const s = scoreAgainstMapped(rawNorm, field, mappedValue);
    if (s < minScore) continue;
    if (!best || s > best.score) best = { mappedValue, score: s };
  }
  return best;
}

function collectEnumColumnRaws(persons: Person[]): Record<SuggestionField, Set<string>> {
  const sets: Record<SuggestionField, Set<string>> = {
    preference: new Set(),
    kitchen: new Set(),
    coursePreference: new Set(),
  };
  for (const p of persons) {
    const rp = p._rawValues?.preference;
    const rk = p._rawValues?.kitchen;
    const rc = p._rawValues?.coursePreference;
    if (rp != null && String(rp).trim()) sets.preference.add(String(rp).trim());
    if (rk != null && String(rk).trim()) sets.kitchen.add(String(rk).trim());
    if (rc != null && String(rc).trim()) sets.coursePreference.add(String(rc).trim());
  }
  return sets;
}

function collectTextFieldRaws(persons: Person[]): Set<string> {
  const set = new Set<string>();
  for (const p of persons) {
    const push = (s: string | undefined) => {
      const t = (s ?? "").trim();
      if (t.length >= 2) set.add(t);
    };
    push(p.name);
    push(p.intolerances);
    push(p.partner);
    push(p.kitchenAddress);
    const custom = p.customFieldValues ?? {};
    for (const v of Object.values(custom)) push(v);
  }
  return set;
}

/**
 * Heuristische Mapping-Vorschläge: Rohstrings mit kanonischen Werten und Standard-Synonymen abgleichen.
 * Berücksichtigt die drei Enum-Spalten sowie Textspalten (Name, Partner, …).
 */
export function computeMappingSuggestions(
  persons: Person[],
  valueMappings: ValueMapping[],
  options: { includeCourse: boolean }
): MappingSuggestion[] {
  const byKey = new Map<string, MappingSuggestion>();
  const tryAdd = (s: MappingSuggestion) => {
    const key = `${s.field}\0${norm(s.rawValue)}`;
    const existing = byKey.get(key);
    if (!existing || s.score > existing.score) byKey.set(key, s);
  };

  const enumRaws = collectEnumColumnRaws(persons);
  const fields: SuggestionField[] = options.includeCourse
    ? ["preference", "kitchen", "coursePreference"]
    : ["preference", "kitchen"];

  for (const field of fields) {
    for (const raw of enumRaws[field]) {
      const hit = bestSuggestionForRaw(raw, field, valueMappings, 0.48);
      if (hit)
        tryAdd({
          field,
          rawValue: raw,
          suggestedMappedValue: hit.mappedValue,
          score: hit.score,
          source: "enum_column",
        });
    }
  }

  const textRaws = collectTextFieldRaws(persons);
  for (const raw of textRaws) {
    for (const field of fields) {
      const hit = bestSuggestionForRaw(raw, field, valueMappings, 0.58);
      if (hit)
        tryAdd({
          field,
          rawValue: raw,
          suggestedMappedValue: hit.mappedValue,
          score: hit.score,
          source: "text_field",
        });
    }
  }

  return [...byKey.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.rawValue.localeCompare(b.rawValue, "de");
  });
}
