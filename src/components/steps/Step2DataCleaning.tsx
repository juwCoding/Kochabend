import { useState, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useAppState } from "@/context/AppStateContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Person } from "@/types/models";
import {
  findSimilarNames,
  findDuplicateAddresses,
  calculateSimilarity,
  isCourseColumnMapped,
  validatePreferences,
} from "@/utils/matching";
import {
  formatCourseLabel,
  formatFoodPreferenceLabel,
  formatKitchenLabel,
  getMappedOnlyCourse,
  getMappedOnlyKitchen,
  getMappedOnlyPreference,
  mappingSourceLabel,
  recomputeEffectiveFields,
} from "@/utils/valueResolution";
import {
  computeMappingSuggestions,
  type MappingSuggestion,
  type SuggestionField,
} from "@/utils/mappingSuggestions";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Settings } from "lucide-react";
import type { FoodPreference, KitchenStatus, CoursePreference } from "@/types/models";
import { cn } from "@/lib/utils";

interface DataIssue {
  type: "similar_names" | "duplicate_address" | "validation";
  description: string;
  persons: Person[];
  severity: "warning" | "error";
  field?: string; // Feld, das den Fehler verursacht
  personId?: string; // Person, die den Fehler hat
}

function cellErrorClass(issues: DataIssue[]): string {
  return issues.some((i) => i.severity === "error")
    ? "border border-destructive/60 bg-destructive/10"
    : "";
}

function normText(s: string | undefined): string {
  return (s ?? "").trim();
}

/** Spalten-Keys für die Daten-Tabelle (Sortierung). */
type DataTableSortKey =
  | "name"
  | "preference"
  | "intolerances"
  | "partner"
  | "kitchen"
  | "kitchenAddress"
  | "coursePreference"
  | `custom:${string}`;

type SortSpec = { key: DataTableSortKey; dir: "asc" | "desc" };

/** Vergleichsstring = effektiver Wert (wie in der Zelle, inkl. Mapping/Manuell). */
function sortComparableForColumn(person: Person, key: DataTableSortKey): string {
  switch (key) {
    case "name":
      return normText(person.name);
    case "preference":
      return formatFoodPreferenceLabel(person.preference ?? "");
    case "intolerances":
      return normText(person.intolerances);
    case "partner":
      return normText(person.partner);
    case "kitchen":
      return formatKitchenLabel(person.kitchen ?? "");
    case "kitchenAddress":
      return normText(person.kitchenAddress);
    case "coursePreference":
      return formatCourseLabel(person.coursePreference ?? "");
    default:
      if (key.startsWith("custom:")) {
        const id = key.slice("custom:".length);
        return normText(person.customFieldValues?.[id]);
      }
      return "";
  }
}

function comparePersonsBySortSpecs(a: Person, b: Person, specs: SortSpec[]): number {
  for (const { key, dir } of specs) {
    const va = sortComparableForColumn(a, key);
    const vb = sortComparableForColumn(b, key);
    const cmp = va.localeCompare(vb, "de", { numeric: true, sensitivity: "base" });
    if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
  }
  return 0;
}

function DataTableSortHead({
  label,
  columnKey,
  sortSpecs,
  onToggle,
  onPromote,
}: {
  label: string;
  columnKey: DataTableSortKey;
  sortSpecs: SortSpec[];
  onToggle: (key: DataTableSortKey) => void;
  onPromote: (key: DataTableSortKey) => void;
}) {
  const specIndex = sortSpecs.findIndex((s) => s.key === columnKey);
  const spec = specIndex >= 0 ? sortSpecs[specIndex] : undefined;
  const showPriorityIndex =
    sortSpecs.length > 1 && spec !== undefined && specIndex >= 0;
  return (
    <TableHead
      className="cursor-pointer select-none hover:bg-muted/50"
      onClick={() => onToggle(columnKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {spec?.dir === "asc" && <ChevronUp className="h-4 w-4 shrink-0 opacity-70" aria-hidden />}
        {spec?.dir === "desc" && <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />}
        {showPriorityIndex && (
          <button
            type="button"
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-medium text-muted-foreground tabular-nums leading-none hover:bg-primary/40 hover:text-white cursor-cell"
            aria-label={`Sortierpriorität ${specIndex + 1} von ${sortSpecs.length}`}
            title={`Gibt Sortierungsreihenfolge an.${specIndex > 0 ? " Mit Klick wird es bevorzugt." : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onPromote(columnKey);
            }}
          >
            {specIndex + 1}
          </button>
        )}
      </span>
    </TableHead>
  );
}

function normalizeSuggestionText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function rankRawSuggestions(query: string, candidates: string[], limit = 8): string[] {
  const q = normalizeSuggestionText(query);
  if (!q) return [...candidates].sort((a, b) => a.localeCompare(b, "de")).slice(0, limit);

  if (q.length === 1) {
    const withChar = candidates
      .map((candidate) => {
        const normCandidate = normalizeSuggestionText(candidate);
        const index = normCandidate.indexOf(q);
        const starts = index === 0 ? 1 : 0;
        return { candidate, index, starts };
      })
      .filter((entry) => entry.index >= 0)
      .sort((a, b) => {
        if (b.starts !== a.starts) return b.starts - a.starts;
        if (a.index !== b.index) return a.index - b.index;
        return a.candidate.localeCompare(b.candidate, "de");
      })
      .slice(0, limit)
      .map((entry) => entry.candidate);

    return withChar;
  }

  const ranked = candidates
    .map((candidate) => {
      const normCandidate = normalizeSuggestionText(candidate);
      const similarity = calculateSimilarity(q, normCandidate);
      const starts = normCandidate.startsWith(q) ? 1 : 0;
      const includes = !starts && normCandidate.includes(q) ? 1 : 0;
      const score = similarity + starts * 0.25 + includes * 0.12;
      return { candidate, score };
    })
    .filter((entry) => entry.score >= 0.28)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.candidate.localeCompare(b.candidate, "de");
    })
    .slice(0, limit)
    .map((entry) => entry.candidate);

  return ranked;
}

/** Nur custom_*-Spalten aus CSV; Zeilenindex = Personenindex. */
function mergeCustomFieldValuesFromCsv(
  persons: Person[],
  csvData: string[][],
  columnMapping: Record<string, string>
): Person[] {
  return persons.map((person, i) => {
    const row = csvData[i];
    if (!row) return person;
    const customValues: Record<string, string> = {};
    for (const [columnKey, field] of Object.entries(columnMapping)) {
      if (field === "__none__" || !field.startsWith("custom_")) continue;
      const columnIndex = parseInt(columnKey.replace("column_", ""), 10);
      if (columnIndex >= 0 && columnIndex < row.length) {
        customValues[field] = row[columnIndex]?.trim() ?? "";
      }
    }
    const ts = person.textSnapshot ?? {
      name: person.name ?? "",
      intolerances: person.intolerances ?? "",
      partner: person.partner ?? "",
      kitchenAddress: person.kitchenAddress ?? "",
      custom: {},
    };
    return {
      ...person,
      customFieldValues: customValues,
      textSnapshot: {
        ...ts,
        custom: { ...customValues },
      },
    };
  });
}

function buildTextSnapshotFromPerson(p: Partial<Person> & { customFieldValues?: Record<string, string> }): NonNullable<Person["textSnapshot"]> {
  return {
    name: p.name ?? "",
    intolerances: p.intolerances ?? "",
    partner: p.partner ?? "",
    kitchenAddress: p.kitchenAddress ?? "",
    custom: { ...(p.customFieldValues ?? {}) },
  };
}

/** Manueller Wert oben (schwarz), CSV-Original unten (grau), wenn abweichend. */
function TextFieldStack({
  value,
  original,
  editing,
  input,
  onViewClick,
  errorClassName,
}: {
  value: string;
  original: string | undefined;
  editing: boolean;
  input: ReactNode;
  onViewClick: () => void;
  errorClassName?: string;
}) {
  const changed = original !== undefined && normText(value) !== normText(original);
  if (editing) {
    return (
      <div className="flex flex-col gap-1 min-w-[10rem]">
        {input}
        {changed && (
          <div className="text-xs text-muted-foreground leading-tight">
            Aus CSV: {normText(original) === "" ? "(leer)" : original}
          </div>
        )}
      </div>
    );
  }
  if (changed) {
    return (
      <div
        className={cn("space-y-0.5 min-w-[10rem] cursor-pointer", errorClassName)}
        onClick={onViewClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onViewClick();
          }
        }}
        role="button"
        tabIndex={0}
      >
        <div className="text-sm font-semibold text-foreground leading-tight">
          {normText(value) === "" ? "(leer)" : value}
        </div>
        <div className="text-xs text-muted-foreground leading-tight">
          Aus CSV: {normText(original) === "" ? "(leer)" : original}
        </div>
      </div>
    );
  }
  return (
    <span className={errorClassName} onClick={onViewClick} style={{ cursor: "pointer" }}>
      {value}
    </span>
  );
}

function MappedEnumStack({
  rawLabel,
  rawValue,
  mappedValue,
  mappedSource,
  manualValue,
  formatMapped,
  formatManual,
}: {
  rawLabel: string;
  rawValue: string | undefined;
  mappedValue: string | null;
  mappedSource: "user" | "default" | null;
  manualValue: string | null;
  formatMapped: (v: string) => string;
  formatManual: (v: string) => string;
}) {
  const hasManual = manualValue !== null;
  const hasMapped = mappedValue !== null && mappedSource !== null;
  const showMappedSecondary =
    hasMapped && hasManual && manualValue !== null && mappedValue !== manualValue;
  const showMappedPrimary = hasMapped && !hasManual;

  return (
    <div className="space-y-0.5 min-w-[10rem]">
      {hasManual && (
        <div className="text-sm font-semibold leading-tight">
          Manuell: {formatManual(manualValue)}
        </div>
      )}
      {showMappedSecondary && (
        <div className="text-sm text-muted-foreground leading-tight">
          {mappingSourceLabel(mappedSource!)}: {formatMapped(mappedValue!)}
        </div>
      )}
      {showMappedPrimary && (
        <div className="text-sm font-medium leading-tight">
          {mappingSourceLabel(mappedSource!)}: {formatMapped(mappedValue!)}
        </div>
      )}
      {rawValue !== undefined && (
        <div className="text-xs text-muted-foreground leading-tight">
          {rawLabel}: {rawValue === "" ? "(leer)" : rawValue}
        </div>
      )}
    </div>
  );
}

export function Step2DataCleaning() {
  const { state, dispatch } = useAppState();
  const [persons, setPersons] = useState<Person[]>([]);
  const [issues, setIssues] = useState<DataIssue[]>([]);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [isMappingDialogOpen, setIsMappingDialogOpen] = useState(false);
  const [mappingField, setMappingField] = useState<"kitchen" | "preference" | "coursePreference">("kitchen");
  const [newMappingRaw, setNewMappingRaw] = useState("");
  const [newMappingValue, setNewMappingValue] = useState("");
  const [isRawSuggestionsOpen, setIsRawSuggestionsOpen] = useState(false);
  const sortSpecs = useMemo(
    () =>
      state.step2SortSpecs.filter(
        (s): s is SortSpec => typeof s?.key === "string" && (s.dir === "asc" || s.dir === "desc")
      ),
    [state.step2SortSpecs]
  );

  const isCourseColumnMappedHere = useMemo(
    () => isCourseColumnMapped(state.columnMapping),
    [state.columnMapping]
  );

  const customFieldColumns = useMemo(
    () => Object.entries(state.customFields),
    [state.customFields]
  );

  /** Wenn Gericht-Spalte nicht zugeordnet ist, wirkt das Dialog-Feld wie „Küche“ (kein coursePreference-UI). */
  const activeMappingField = useMemo((): "kitchen" | "preference" | "coursePreference" => {
    if (!isCourseColumnMappedHere && mappingField === "coursePreference") return "kitchen";
    return mappingField;
  }, [isCourseColumnMappedHere, mappingField]);

  const validCustomFieldIds = useMemo(
    () => new Set(Object.keys(state.customFields)),
    [state.customFields]
  );

  /** Nur gültige Spalten (sichtbare Spalten); versteckte Einträge bleiben in sortSpecs für späteres Wieder-Einblenden. */
  const activeSortSpecs = useMemo(
    () =>
      sortSpecs.filter((s) => {
        if (s.key === "coursePreference" && !isCourseColumnMappedHere) return false;
        if (s.key.startsWith("custom:")) {
          return validCustomFieldIds.has(s.key.slice("custom:".length));
        }
        return true;
      }),
    [sortSpecs, isCourseColumnMappedHere, validCustomFieldIds]
  );

  const sortedPersons = useMemo(() => {
    if (activeSortSpecs.length === 0) return persons;
    const indexed = persons.map((p, i) => ({ p, i }));
    indexed.sort((a, b) => {
      const c = comparePersonsBySortSpecs(a.p, b.p, activeSortSpecs);
      if (c !== 0) return c;
      return a.i - b.i;
    });
    return indexed.map((x) => x.p);
  }, [persons, activeSortSpecs]);

  const setStep2SortSpecs = (next: SortSpec[]) => {
    dispatch({ type: "SET_STEP2_SORT_SPECS", payload: next });
  };

  const toggleColumnSort = (key: DataTableSortKey) => {
    const i = sortSpecs.findIndex((s) => s.key === key);
    if (i === -1) return setStep2SortSpecs([...sortSpecs, { key, dir: "asc" }]);
    if (sortSpecs[i].dir === "asc") {
      return setStep2SortSpecs(sortSpecs.map((s, j) => (j === i ? { ...s, dir: "desc" as const } : s)));
    }
    setStep2SortSpecs(sortSpecs.filter((_, j) => j !== i));
  };

  const promoteColumnSort = (key: DataTableSortKey) => {
    const i = sortSpecs.findIndex((s) => s.key === key);
    if (i <= 0) return;
    const next = [...sortSpecs];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    setStep2SortSpecs(next);
  };

  const commitPersons = (next: Person[]) => {
    setPersons(next);
    dispatch({ type: "SET_PERSONS", payload: next });
  };

  /** Nur bei Änderung von CSV oder Spalten-Mapping neu einlesen — nicht bei jedem valueMappings-/Personen-Update (sonst gingen manuelle Edits verloren). */
  const customCsvSourceKey = useMemo(
    () => JSON.stringify({ cm: state.columnMapping, csv: state.csvData }),
    [state.columnMapping, state.csvData]
  );
  const customCsvSourceRef = useRef<string>("");

  // CSV → Personen oder State übernehmen; bei Mapping-Änderung neu auflösen (manuell bleibt)
  useEffect(() => {
    if (state.persons.length > 0) {
      let normalized = state.persons.map((p) => recomputeEffectiveFields(p, state.valueMappings));
      if (customCsvSourceKey !== customCsvSourceRef.current) {
        customCsvSourceRef.current = customCsvSourceKey;
        normalized = mergeCustomFieldValuesFromCsv(normalized, state.csvData, state.columnMapping);
        normalized = normalized.map((p) => recomputeEffectiveFields(p, state.valueMappings));
      }
      normalized = normalized.map((p) =>
        p.textSnapshot ? p : { ...p, textSnapshot: buildTextSnapshotFromPerson(p) }
      );
      if (JSON.stringify(normalized) === JSON.stringify(state.persons)) {
        setPersons((prev) => (JSON.stringify(prev) === JSON.stringify(normalized) ? prev : normalized));
        return;
      }
      commitPersons(normalized);
      return;
    }

    if (state.csvData.length === 0) return;

    const newPersons: Person[] = [];

    for (let i = 0; i < state.csvData.length; i++) {
      const row = state.csvData[i];
      const person: Partial<Person> = {
        id: `person_${i}`,
        _rawValues: {},
        customFieldValues: {},
      };

      for (const [columnKey, field] of Object.entries(state.columnMapping)) {
        if (field === "__none__") continue;

        const columnIndex = parseInt(columnKey.replace("column_", ""));
        if (columnIndex >= 0 && columnIndex < row.length) {
          const rawValue = row[columnIndex]?.trim() || "";

          if (field.startsWith("custom_")) {
            person.customFieldValues![field] = rawValue;
            continue;
          }

          switch (field) {
            case "name":
              person.name = rawValue;
              break;
            case "preference":
              person._rawValues!.preference = rawValue;
              break;
            case "intolerances":
              person.intolerances = rawValue;
              break;
            case "partner":
              person.partner = rawValue || undefined;
              break;
            case "kitchen":
              person._rawValues!.kitchen = rawValue;
              if (!person.kitchenAddress) {
                person.kitchenAddress = "";
              }
              break;
            case "kitchenAddress":
              person.kitchenAddress = rawValue;
              break;
            case "coursePreference":
              person._rawValues!.coursePreference = rawValue;
              break;
          }
        }
      }

      person.textSnapshot = buildTextSnapshotFromPerson(person as Partial<Person>);
      newPersons.push(recomputeEffectiveFields(person as Person, state.valueMappings));
    }

    commitPersons(newPersons);
    customCsvSourceRef.current = customCsvSourceKey;
  }, [dispatch, state.columnMapping, state.csvData, state.persons, state.valueMappings, customCsvSourceKey]);

  // Detect issues
  useEffect(() => {
    if (persons.length === 0) return;

    const detectedIssues: DataIssue[] = [];

    // Similar names
    const similarNames = findSimilarNames(persons, 0.7);
    for (const { person1, person2, similarity } of similarNames) {
      detectedIssues.push({
        type: "similar_names",
        description: `Ähnliche Namen gefunden (${Math.round(similarity * 100)}% Übereinstimmung)`,
        persons: [person1, person2],
        severity: "warning",
      });
    }

    // Duplicate addresses
    const duplicateAddresses = findDuplicateAddresses(persons);
    for (const { address, persons: addressPersons } of duplicateAddresses) {
      detectedIssues.push({
        type: "duplicate_address",
        description: `Gleiche Küchen-Adresse: ${address}`,
        persons: addressPersons,
        severity: "warning",
        field: "kitchenAddress",
      });
    }

    // Validation issues
    const validationIssues = validatePreferences(persons, state.columnMapping);
    for (const { person, issue } of validationIssues) {
      let field: string | undefined;
      if (issue.includes("Ernährungsform")) field = "preference";
      else if (issue.includes("Küche")) field = "kitchen";
      else if (issue.includes("Gericht-Präferenz")) field = "coursePreference";

      detectedIssues.push({
        type: "validation",
        description: issue,
        persons: [person],
        severity: "error",
        field,
        personId: person.id,
      });
    }

    setIssues(detectedIssues);
  }, [persons, state.columnMapping]);

  const handleUpdatePerson = (personId: string, field: keyof Person, value: unknown) => {
    const next = persons.map((p) => (p.id === personId ? { ...p, [field]: value } : p));
    commitPersons(next);
  };

  const handleUpdateCustomField = (personId: string, fieldId: string, value: string) => {
    const next = persons.map((p) =>
      p.id === personId
        ? { ...p, customFieldValues: { ...p.customFieldValues, [fieldId]: value } }
        : p
    );
    commitPersons(next);
  };

  const setPreferenceManual = (personId: string, value: FoodPreference) => {
    const next = persons.map((p) =>
      p.id === personId ? { ...p, preferenceManual: value, preference: value } : p
    );
    commitPersons(next);
  };

  const clearPreferenceManual = (personId: string) => {
    const next = persons.map((p) => {
      if (p.id !== personId) return p;
      const cleared: Person = { ...p, preferenceManual: undefined };
      return recomputeEffectiveFields(cleared, state.valueMappings);
    });
    commitPersons(next);
  };

  const setKitchenManual = (personId: string, value: KitchenStatus) => {
    const next = persons.map((p) =>
      p.id === personId ? { ...p, kitchenManual: value, kitchen: value } : p
    );
    commitPersons(next);
  };

  const clearKitchenManual = (personId: string) => {
    const next = persons.map((p) => {
      if (p.id !== personId) return p;
      const cleared: Person = { ...p, kitchenManual: undefined };
      return recomputeEffectiveFields(cleared, state.valueMappings);
    });
    commitPersons(next);
  };

  const setCourseManual = (personId: string, value: CoursePreference) => {
    const next = persons.map((p) =>
      p.id === personId ? { ...p, coursePreferenceManual: value, coursePreference: value } : p
    );
    commitPersons(next);
  };

  const clearCourseManual = (personId: string) => {
    const next = persons.map((p) => {
      if (p.id !== personId) return p;
      const cleared: Person = { ...p, coursePreferenceManual: undefined };
      return recomputeEffectiveFields(cleared, state.valueMappings);
    });
    commitPersons(next);
  };

  const mappingSuggestions = useMemo(
    () =>
      computeMappingSuggestions(persons, state.valueMappings, {
        includeCourse: isCourseColumnMappedHere,
      }),
    [persons, state.valueMappings, isCourseColumnMappedHere]
  );

  const loadedRawCandidates = useMemo(() => {
    const values = new Set<string>();
    for (const p of persons) {
      const raw =
        activeMappingField === "preference"
          ? p._rawValues?.preference
          : activeMappingField === "kitchen"
            ? p._rawValues?.kitchen
            : p._rawValues?.coursePreference;
      const trimmed = (raw ?? "").trim();
      if (trimmed) values.add(trimmed);
    }
    return [...values];
  }, [persons, activeMappingField]);

  const existingMappedRawsForField = useMemo(() => {
    const set = new Set<string>();
    for (const m of state.valueMappings) {
      if (m.field !== activeMappingField) continue;
      set.add(normalizeSuggestionText(m.rawValue));
    }
    return set;
  }, [state.valueMappings, activeMappingField]);

  const filteredRawCandidates = useMemo(
    () =>
      rankRawSuggestions(
        newMappingRaw,
        loadedRawCandidates.filter(
          (candidate) => !existingMappedRawsForField.has(normalizeSuggestionText(candidate))
        )
      ),
    [newMappingRaw, loadedRawCandidates, existingMappedRawsForField]
  );

  const isMappingDuplicate = useMemo(() => {
    const raw = newMappingRaw.trim();
    if (!raw) return false;
    const lower = raw.toLowerCase();
    return state.valueMappings.some(
      (m) => m.field === activeMappingField && m.rawValue.trim().toLowerCase() === lower
    );
  }, [state.valueMappings, activeMappingField, newMappingRaw]);

  const handleAddMapping = () => {
    const raw = newMappingRaw.trim();
    if (!raw || !newMappingValue.trim()) return;
    if (isMappingDuplicate) return;

    dispatch({
      type: "SET_VALUE_MAPPINGS",
      payload: [
        ...state.valueMappings,
        {
          field: activeMappingField,
          rawValue: raw,
          mappedValue: newMappingValue,
        },
      ],
    });

    setNewMappingRaw("");
    setNewMappingValue("");
    setIsRawSuggestionsOpen(false);
  };

  const handleDeleteMapping = (index: number) => {
    const newMappings = [...state.valueMappings];
    newMappings.splice(index, 1);
    dispatch({
      type: "SET_VALUE_MAPPINGS",
      payload: newMappings,
    });
  };

  const applySuggestion = (s: MappingSuggestion) => {
    const raw = s.rawValue.trim();
    const lower = raw.toLowerCase();
    if (state.valueMappings.some((m) => m.field === s.field && m.rawValue.trim().toLowerCase() === lower)) {
      return;
    }
    dispatch({
      type: "SET_VALUE_MAPPINGS",
      payload: [
        ...state.valueMappings,
        {
          field: s.field,
          rawValue: raw,
          mappedValue: s.suggestedMappedValue,
        },
      ],
    });
  };

  const suggestionFieldLabel = (f: SuggestionField) => {
    switch (f) {
      case "kitchen":
        return "Küche";
      case "preference":
        return "Ernährungsform";
      case "coursePreference":
        return "Gericht-Präferenz";
    }
  };

  const formatSuggestedMapped = (f: SuggestionField, v: string) => {
    if (f === "kitchen") return formatKitchenLabel(v);
    if (f === "preference") return formatFoodPreferenceLabel(v);
    return formatCourseLabel(v);
  };

  const getFieldIssues = (personId: string, field: string): DataIssue[] => {
    return issues.filter((issue) => issue.personId === personId && issue.field === field);
  };

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  const kitchenOptions: KitchenStatus[] = ["kann_gekocht_werden", "partner_kocht", "kann_nicht_gekocht_werden"];
  const preferenceOptions: FoodPreference[] = ["vegan", "vegetarisch", "egal"];
  const courseOptions: CoursePreference[] = ["keine", "Vorspeise", "Hauptgang", "Nachspeise"];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Schritt 2: Daten-Cleaning</h2>
        <p className="text-muted-foreground">
          Überprüfen Sie die Daten auf Duplikate, ähnliche Einträge und Validierungsfehler. Sie können Werte direkt in der Tabelle bearbeiten.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 border rounded-md">
          <div className="text-2xl font-bold">{persons.length}</div>
          <div className="text-sm text-muted-foreground">Personen</div>
        </div>
        <div className="p-4 border rounded-md">
          <div className="text-2xl font-bold text-destructive">{errorCount}</div>
          <div className="text-sm text-muted-foreground">Fehler</div>
        </div>
        <div className="p-4 border rounded-md">
          <div className="text-2xl font-bold text-yellow-600">{warningCount}</div>
          <div className="text-sm text-muted-foreground">Warnungen</div>
        </div>
      </div>

      {/* Value Mapping Dialog */}
      <Dialog open={isMappingDialogOpen} onOpenChange={setIsMappingDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">
            <Settings className="mr-2 h-4 w-4" />
            Wert-Mappings verwalten
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Wert-Mappings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Feld</label>
              <Select
                value={activeMappingField}
                onValueChange={(v) => setMappingField(v as typeof mappingField)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kitchen">Küche</SelectItem>
                  <SelectItem value="preference">Ernährungsform</SelectItem>
                  {isCourseColumnMappedHere && (
                    <SelectItem value="coursePreference">Gericht-Präferenz</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Rohwert (aus CSV)</label>
                <div className="relative">
                  <Input
                    value={newMappingRaw}
                    onChange={(e) => {
                      setNewMappingRaw(e.target.value);
                      setIsRawSuggestionsOpen(true);
                    }}
                    onFocus={() => setIsRawSuggestionsOpen(true)}
                    onClick={() => setIsRawSuggestionsOpen(true)}
                    onBlur={() => {
                      window.setTimeout(() => setIsRawSuggestionsOpen(false), 120);
                    }}
                    placeholder="z.B. ja"
                    className={isMappingDuplicate ? "border-destructive" : undefined}
                    aria-invalid={isMappingDuplicate}
                    aria-expanded={isRawSuggestionsOpen}
                    aria-haspopup="listbox"
                  />
                  {isRawSuggestionsOpen && filteredRawCandidates.length > 0 && (
                    <div
                      className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover shadow-md"
                      role="listbox"
                    >
                      {filteredRawCandidates.map((candidate) => (
                        <button
                          key={candidate}
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setNewMappingRaw(candidate);
                            setIsRawSuggestionsOpen(false);
                          }}
                        >
                          {candidate}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Zugeordneter Wert</label>
                <Select value={newMappingValue} onValueChange={setNewMappingValue}>
                  <SelectTrigger>
                    <SelectValue placeholder="Wert auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeMappingField === "kitchen" &&
                      kitchenOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt === "kann_gekocht_werden" ? "bei mir" : opt === "partner_kocht" ? "bei partner" : "nicht"}
                        </SelectItem>
                      ))}
                    {activeMappingField === "preference" &&
                      preferenceOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    {activeMappingField === "coursePreference" &&
                      courseOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {isMappingDuplicate && newMappingRaw.trim() !== "" && (
              <p className="text-sm text-destructive">
                Dieser Rohwert ist für dieses Feld bereits vergeben. Zum Ändern den bestehenden Eintrag löschen.
              </p>
            )}
            <Button
              onClick={handleAddMapping}
              disabled={!newMappingRaw.trim() || !newMappingValue.trim() || isMappingDuplicate}
            >
              Mapping hinzufügen
            </Button>

            <details className="group rounded-md border bg-muted/30">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                <span>
                  Vorschläge
                  {mappingSuggestions.length > 0 && (
                    <span className="ml-2 font-normal text-muted-foreground">
                      ({mappingSuggestions.length})
                    </span>
                  )}
                </span>
              </summary>
              <div className="space-y-2 border-t px-3 py-2 text-sm">
                <p className="text-muted-foreground leading-snug">
                  Rohwerte aus den drei Zuordnungs-Spalten und aus Textfeldern werden mit gültigen Werten und
                  Standard-Synonymen verglichen. Übernehmen fügt ein Mapping wie bei „Mapping hinzufügen“ hinzu.
                </p>
                {mappingSuggestions.length === 0 ? (
                  <p className="text-muted-foreground italic">Keine Vorschläge für die aktuellen Daten.</p>
                ) : (
                  <ul className="max-h-52 space-y-2 overflow-auto pr-1">
                    {mappingSuggestions.map((s, i) => (
                      <li
                        key={`${s.field}-${normText(s.rawValue)}-${i}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background p-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-foreground">
                            {suggestionFieldLabel(s.field)}: „{s.rawValue}“ →{" "}
                            {formatSuggestedMapped(s.field, s.suggestedMappedValue)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {s.source === "enum_column" ? "Aus CSV-Zuordnungsspalte" : "Aus Textfeld"} · Treffer
                            ca. {Math.round(s.score * 100)}%
                          </div>
                        </div>
                        <Button type="button" size="sm" variant="secondary" onClick={() => applySuggestion(s)}>
                          Übernehmen
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>

            <div className="space-y-2">
              <h4 className="font-medium">Aktuelle Mappings für {activeMappingField}</h4>
              <div className="space-y-1 max-h-48 overflow-auto">
                {state.valueMappings
                  .filter((m) => m.field === activeMappingField)
                  .map((mapping, index) => (
                    <div key={index} className="flex items-center justify-between p-2 border rounded">
                      <span className="text-sm">
                        "{mapping.rawValue}" → {mapping.mappedValue}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const globalIndex = state.valueMappings.findIndex(
                            (m) => m.field === mapping.field && m.rawValue === mapping.rawValue
                          );
                          if (globalIndex >= 0) handleDeleteMapping(globalIndex);
                        }}
                      >
                        Löschen
                      </Button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {persons.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Daten-Übersicht</h3>
          <div className="border rounded-md overflow-auto max-h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  <DataTableSortHead
                    label="Name"
                    columnKey="name"
                    sortSpecs={activeSortSpecs}
                    onToggle={toggleColumnSort}
                    onPromote={promoteColumnSort}
                  />
                  <DataTableSortHead
                    label="Ernährungsform"
                    columnKey="preference"
                    sortSpecs={activeSortSpecs}
                    onToggle={toggleColumnSort}
                    onPromote={promoteColumnSort}
                  />
                  <DataTableSortHead
                    label="Unverträglichkeiten"
                    columnKey="intolerances"
                    sortSpecs={activeSortSpecs}
                    onToggle={toggleColumnSort}
                    onPromote={promoteColumnSort}
                  />
                  <DataTableSortHead
                    label="Partner"
                    columnKey="partner"
                    sortSpecs={activeSortSpecs}
                    onToggle={toggleColumnSort}
                    onPromote={promoteColumnSort}
                  />
                  <DataTableSortHead
                    label="Küche"
                    columnKey="kitchen"
                    sortSpecs={activeSortSpecs}
                    onToggle={toggleColumnSort}
                    onPromote={promoteColumnSort}
                  />
                  <DataTableSortHead
                    label="Küchen-Adresse"
                    columnKey="kitchenAddress"
                    sortSpecs={activeSortSpecs}
                    onToggle={toggleColumnSort}
                    onPromote={promoteColumnSort}
                  />
                  {isCourseColumnMappedHere && (
                    <DataTableSortHead
                      label="Gericht-Präferenz"
                      columnKey="coursePreference"
                      sortSpecs={activeSortSpecs}
                      onToggle={toggleColumnSort}
                      onPromote={promoteColumnSort}
                    />
                  )}
                  {customFieldColumns.map(([fieldId, fieldName]) => (
                    <DataTableSortHead
                      key={fieldId}
                      label={fieldName}
                      columnKey={`custom:${fieldId}`}
                      sortSpecs={activeSortSpecs}
                      onToggle={toggleColumnSort}
                      onPromote={promoteColumnSort}
                    />
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedPersons.map((person) => {
                  const nameIssues = getFieldIssues(person.id, "name");
                  const preferenceIssues = getFieldIssues(person.id, "preference");
                  const kitchenIssues = getFieldIssues(person.id, "kitchen");
                  const kitchenAddressIssues = getFieldIssues(person.id, "kitchenAddress");
                  const courseIssues = isCourseColumnMappedHere
                    ? getFieldIssues(person.id, "coursePreference")
                    : [];
                  const prefMapped = getMappedOnlyPreference(person, state.valueMappings);
                  const kitMapped = getMappedOnlyKitchen(person, state.valueMappings);
                  const courseMapped = getMappedOnlyCourse(person, state.valueMappings);

                  return (
                    <TableRow key={person.id}>
                      <TableCell>
                        <TextFieldStack
                          value={person.name}
                          original={person.textSnapshot?.name}
                          editing={editingPersonId === person.id}
                          input={
                            <Input
                              value={person.name}
                              onChange={(e) => handleUpdatePerson(person.id, "name", e.target.value)}
                              onBlur={() => setEditingPersonId(null)}
                              className={nameIssues.some((i) => i.severity === "error") ? "border-destructive" : ""}
                            />
                          }
                          onViewClick={() => setEditingPersonId(person.id)}
                          errorClassName={
                            nameIssues.some((i) => i.severity === "error") ? "text-destructive font-medium" : undefined
                          }
                        />
                      </TableCell>
                      <TableCell className={cn(cellErrorClass(preferenceIssues))}>
                        {editingPersonId === person.id ? (
                          <div className="flex flex-col gap-1 min-w-[11rem]">
                            <Select
                              value={person.preference ?? "placeholder"}
                              onValueChange={(v) => {
                                if (v === "placeholder") return;
                                setPreferenceManual(person.id, v as FoodPreference);
                              }}
                              onOpenChange={(open) => !open && setEditingPersonId(null)}
                            >
                              <SelectTrigger
                                className={
                                  preferenceIssues.some((i) => i.severity === "error") ? "border-destructive" : ""
                                }
                              >
                                <SelectValue placeholder="Gültigen Wert wählen" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="placeholder" disabled>
                                  Gültigen Wert wählen
                                </SelectItem>
                                {preferenceOptions.map((opt) => (
                                  <SelectItem key={opt} value={opt}>
                                    {opt}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {person.preferenceManual !== undefined && (
                              <button
                                type="button"
                                className="text-xs text-muted-foreground underline text-left"
                                onClick={() => clearPreferenceManual(person.id)}
                              >
                                Nur Mapping (manuell zurücksetzen)
                              </button>
                            )}
                          </div>
                        ) : (
                          <div
                            className={
                              preferenceIssues.some((i) => i.severity === "error")
                                ? "text-destructive font-medium"
                                : ""
                            }
                            onClick={() => setEditingPersonId(person.id)}
                            style={{ cursor: "pointer" }}
                          >
                            <MappedEnumStack
                              rawLabel="Aus CSV"
                              rawValue={person._rawValues?.preference}
                              mappedValue={prefMapped.value}
                              mappedSource={prefMapped.source}
                              manualValue={person.preferenceManual != null ? person.preferenceManual : null}
                              formatMapped={formatFoodPreferenceLabel}
                              formatManual={formatFoodPreferenceLabel}
                            />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <TextFieldStack
                          value={person.intolerances}
                          original={person.textSnapshot?.intolerances}
                          editing={editingPersonId === person.id}
                          input={
                            <Input
                              value={person.intolerances}
                              onChange={(e) => handleUpdatePerson(person.id, "intolerances", e.target.value)}
                              onBlur={() => setEditingPersonId(null)}
                            />
                          }
                          onViewClick={() => setEditingPersonId(person.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <TextFieldStack
                          value={person.partner ?? ""}
                          original={person.textSnapshot?.partner}
                          editing={editingPersonId === person.id}
                          input={
                            <Input
                              value={person.partner || ""}
                              onChange={(e) =>
                                handleUpdatePerson(person.id, "partner", e.target.value || undefined)
                              }
                              onBlur={() => setEditingPersonId(null)}
                              placeholder="Partner-Name"
                            />
                          }
                          onViewClick={() => setEditingPersonId(person.id)}
                        />
                      </TableCell>
                      <TableCell className={cn(cellErrorClass(kitchenIssues))}>
                        {editingPersonId === person.id ? (
                          <div className="flex flex-col gap-1 min-w-[11rem]">
                            <Select
                              value={person.kitchen ?? "placeholder"}
                              onValueChange={(v) => {
                                if (v === "placeholder") return;
                                setKitchenManual(person.id, v as KitchenStatus);
                              }}
                              onOpenChange={(open) => !open && setEditingPersonId(null)}
                            >
                              <SelectTrigger
                                className={
                                  kitchenIssues.some((i) => i.severity === "error") ? "border-destructive" : ""
                                }
                              >
                                <SelectValue placeholder="Gültigen Wert wählen" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="placeholder" disabled>
                                  Gültigen Wert wählen
                                </SelectItem>
                                {kitchenOptions.map((opt) => (
                                  <SelectItem key={opt} value={opt}>
                                    {opt === "kann_gekocht_werden"
                                      ? "bei mir"
                                      : opt === "partner_kocht"
                                        ? "bei partner"
                                        : "nicht"}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {person.kitchenManual !== undefined && (
                              <button
                                type="button"
                                className="text-xs text-muted-foreground underline text-left"
                                onClick={() => clearKitchenManual(person.id)}
                              >
                                Nur Mapping (manuell zurücksetzen)
                              </button>
                            )}
                          </div>
                        ) : (
                          <div
                            className={
                              kitchenIssues.some((i) => i.severity === "error")
                                ? "text-destructive font-medium"
                                : ""
                            }
                            onClick={() => setEditingPersonId(person.id)}
                            style={{ cursor: "pointer" }}
                          >
                            <MappedEnumStack
                              rawLabel="Aus CSV"
                              rawValue={person._rawValues?.kitchen}
                              mappedValue={kitMapped.value}
                              mappedSource={kitMapped.source}
                              manualValue={person.kitchenManual != null ? person.kitchenManual : null}
                              formatMapped={formatKitchenLabel}
                              formatManual={formatKitchenLabel}
                            />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className={cn(cellErrorClass(kitchenAddressIssues))}>
                        <TextFieldStack
                          value={person.kitchenAddress}
                          original={person.textSnapshot?.kitchenAddress}
                          editing={editingPersonId === person.id}
                          input={
                            <Input
                              value={person.kitchenAddress}
                              onChange={(e) => handleUpdatePerson(person.id, "kitchenAddress", e.target.value)}
                              onBlur={() => setEditingPersonId(null)}
                              className={
                                kitchenAddressIssues.some((i) => i.severity === "error") ? "border-destructive" : ""
                              }
                            />
                          }
                          onViewClick={() => setEditingPersonId(person.id)}
                          errorClassName={
                            kitchenAddressIssues.some((i) => i.severity === "error")
                              ? "text-destructive font-medium"
                              : undefined
                          }
                        />
                      </TableCell>
                      {isCourseColumnMappedHere && (
                        <TableCell className={cn(cellErrorClass(courseIssues))}>
                          {editingPersonId === person.id ? (
                            <div className="flex flex-col gap-1 min-w-[11rem]">
                              <Select
                                value={person.coursePreference ?? "placeholder"}
                                onValueChange={(v) => {
                                  if (v === "placeholder") return;
                                  setCourseManual(person.id, v as CoursePreference);
                                }}
                                onOpenChange={(open) => !open && setEditingPersonId(null)}
                              >
                                <SelectTrigger
                                  className={
                                    courseIssues.some((i) => i.severity === "error") ? "border-destructive" : ""
                                  }
                                >
                                  <SelectValue placeholder="Gültigen Wert wählen" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="placeholder" disabled>
                                    Gültigen Wert wählen
                                  </SelectItem>
                                  {courseOptions.map((opt) => (
                                    <SelectItem key={opt} value={opt}>
                                      {opt}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {person.coursePreferenceManual !== undefined && (
                                <button
                                  type="button"
                                  className="text-xs text-muted-foreground underline text-left"
                                  onClick={() => clearCourseManual(person.id)}
                                >
                                  Nur Mapping (manuell zurücksetzen)
                                </button>
                              )}
                            </div>
                          ) : (
                            <div
                              className={
                                courseIssues.some((i) => i.severity === "error")
                                  ? "text-destructive font-medium"
                                  : ""
                              }
                              onClick={() => setEditingPersonId(person.id)}
                              style={{ cursor: "pointer" }}
                            >
                              <MappedEnumStack
                                rawLabel="Aus CSV"
                                rawValue={person._rawValues?.coursePreference}
                                mappedValue={courseMapped.value}
                                mappedSource={courseMapped.source}
                                manualValue={
                                  person.coursePreferenceManual != null ? person.coursePreferenceManual : null
                                }
                                formatMapped={formatCourseLabel}
                                formatManual={formatCourseLabel}
                              />
                            </div>
                          )}
                        </TableCell>
                      )}
                      {customFieldColumns.map(([fieldId]) => (
                        <TableCell key={fieldId}>
                          <TextFieldStack
                            value={person.customFieldValues?.[fieldId] ?? ""}
                            original={person.textSnapshot?.custom?.[fieldId]}
                            editing={editingPersonId === person.id}
                            input={
                              <Input
                                value={person.customFieldValues?.[fieldId] ?? ""}
                                onChange={(e) => handleUpdateCustomField(person.id, fieldId, e.target.value)}
                                onBlur={() => setEditingPersonId(null)}
                              />
                            }
                            onViewClick={() => setEditingPersonId(person.id)}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {issues.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Gefundene Probleme</h3>
          <div className="space-y-2">
            {issues.map((issue, index) => (
              <div
                key={index}
                className={`p-4 border rounded-md ${
                  issue.severity === "error" ? "border-destructive" : "border-yellow-500"
                }`}
              >
                <div className="flex items-start gap-2">
                  {issue.severity === "error" ? (
                    <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <div className="font-medium">{issue.description}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Betroffene Personen: {issue.persons.map((p) => p.name).join(", ")}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2">
          {errorCount === 0 ? (
            <>
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="text-sm text-muted-foreground">
                Keine Fehler gefunden.
              </span>
            </>
          ) : (
            <span className="text-sm text-destructive">
              Bitte beheben Sie die Fehler vor dem Fortfahren.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
