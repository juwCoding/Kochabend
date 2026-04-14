import React, { createContext, useContext, useReducer, useCallback } from "react";
import type { ReactNode } from "react";
import type { AppState } from "@/types/models";
import { clampWizardStepIndex } from "@/types/models";
import { getDefaultAppState, hydrateValueMappingsIfEmpty } from "@/defaultValueMappings";
import { normalizeTeamsAndDistribution } from "@/utils/stableTeamId";

// Action Types
type AppStateAction =
  | { type: "SET_CSV_DATA"; payload: { csvData: string[][]; csvRawData: string[][]; hasHeader: boolean } }
  | { type: "SET_COLUMN_MAPPING"; payload: Record<string, string> }
  | { type: "SET_CUSTOM_FIELDS"; payload: Record<string, string> }
  | { type: "ADD_CUSTOM_FIELD"; payload: { fieldId: string; fieldName: string } }
  | { type: "SET_VALUE_MAPPINGS"; payload: AppState["valueMappings"] }
  | { type: "SET_PERSONS"; payload: AppState["persons"] }
  | { type: "SET_STEP2_SORT_SPECS"; payload: AppState["step2SortSpecs"] }
  | { type: "UPDATE_PERSON"; payload: { id: string; updates: Partial<AppState["persons"][0]> } }
  | { type: "SET_TEAMS"; payload: AppState["teams"] }
  | { type: "SET_STEP3_SORT_SPECS"; payload: AppState["step3SortSpecs"] }
  | { type: "SET_DISTRIBUTION"; payload: AppState["distribution"] }
  | { type: "SET_INVITATION_TEMPLATE"; payload: string }
  | { type: "SET_GENERATED_INVITATIONS"; payload: Record<string, string> }
  | { type: "LOAD_STATE"; payload: AppState; skipHistory?: boolean }
  | { type: "SET_CURRENT_STEP"; payload: number }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "RESET" };

// State with history for undo/redo
interface AppStateWithHistory {
  current: AppState;
  history: AppState[];
  historyIndex: number;
  maxHistorySize: number;
}

const STORAGE_KEY = "kochabend_state";
const STATE_FORMAT_VERSION = 1;
const DATA_PLACEHOLDER = "__KOCHABEND_DATA_PLACEHOLDER__";

interface VersionedStateEnvelope<T> {
  version: number;
  hash: string;
  data: T;
}

export class StateIntegrityError extends Error {
  constructor(message = "State integrity check failed") {
    super(message);
    this.name = "StateIntegrityError";
  }
}

interface ParsedImportStateResult<T> {
  state: T;
  hasEnvelope: boolean;
  integrityValid: boolean;
}

type PersistenceMode =
  | "full-history"
  | "history-20"
  | "history-5"
  | "current-only"
  | "current-without-raw-csv"
  | "current-without-csv"
  | "failed";

function isQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof DOMException)) return false;
  return (
    error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error.code === 22 ||
    error.code === 1014
  );
}

function trimHistoryToCurrent(
  state: AppStateWithHistory,
  limit: number
): Pick<AppStateWithHistory, "history" | "historyIndex"> {
  if (limit <= 1) {
    return { history: [state.current], historyIndex: 0 };
  }

  const endExclusive = Math.min(state.history.length, state.historyIndex + 1);
  const start = Math.max(0, endExclusive - limit);
  const history = state.history.slice(start, endExclusive);
  return {
    history,
    historyIndex: history.length - 1,
  };
}

function toJsonCompatible<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function computeIntegrityHash(input: string): string {
  let hash = 0x811c9dc5;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function serializeStateEnvelope<T>(data: T, pretty = false): string {
  const version = STATE_FORMAT_VERSION;
  const dataJson = JSON.stringify(toJsonCompatible(data), null, pretty ? 2 : 0);
  const hash = computeIntegrityHash(`${dataJson};version=${version}`);
  const template = JSON.stringify(
    { version, hash, data: DATA_PLACEHOLDER },
    null,
    pretty ? 2 : 0
  );
  return template.replace(`"${DATA_PLACEHOLDER}"`, dataJson);
}

function parseJsonStringLiteral(source: string, start: number): number {
  if (source[start] !== "\"") return -1;
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "\"") return i + 1;
    i += 1;
  }
  return -1;
}

function findJsonValueEnd(source: string, start: number): number {
  if (start >= source.length) return -1;
  const startChar = source[start];

  if (startChar === "\"") return parseJsonStringLiteral(source, start);

  if (startChar === "{" || startChar === "[") {
    const closeChar = startChar === "{" ? "}" : "]";
    let depth = 0;
    let i = start;
    while (i < source.length) {
      const ch = source[i];
      if (ch === "\"") {
        const end = parseJsonStringLiteral(source, i);
        if (end === -1) return -1;
        i = end;
        continue;
      }
      if (ch === startChar) depth += 1;
      if (ch === closeChar) {
        depth -= 1;
        if (depth === 0) return i + 1;
      }
      i += 1;
    }
    return -1;
  }

  let i = start;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "," || ch === "}" || ch === "]") return i;
    i += 1;
  }
  return source.length;
}

function extractTopLevelDataRaw(source: string): string | null {
  let i = 0;
  while (i < source.length && /\s/.test(source[i])) i += 1;
  if (source[i] !== "{") return null;
  i += 1;

  while (i < source.length) {
    while (i < source.length && /\s/.test(source[i])) i += 1;
    if (source[i] === "}") break;
    if (source[i] !== "\"") return null;

    const keyEnd = parseJsonStringLiteral(source, i);
    if (keyEnd === -1) return null;
    const key = JSON.parse(source.slice(i, keyEnd)) as string;
    i = keyEnd;

    while (i < source.length && /\s/.test(source[i])) i += 1;
    if (source[i] !== ":") return null;
    i += 1;
    while (i < source.length && /\s/.test(source[i])) i += 1;

    const valueStart = i;
    const valueEnd = findJsonValueEnd(source, valueStart);
    if (valueEnd === -1) return null;

    if (key === "data") {
      return source.slice(valueStart, valueEnd);
    }

    i = valueEnd;
    while (i < source.length && /\s/.test(source[i])) i += 1;
    if (source[i] === ",") i += 1;
  }

  return null;
}

export function inspectImportState(json: string): { hasEnvelope: boolean; integrityValid: boolean } {
  const parsed = JSON.parse(json) as unknown;
  if (!parsed || typeof parsed !== "object" || !("data" in parsed)) {
    return { hasEnvelope: false, integrityValid: true };
  }

  const envelope = parsed as Partial<VersionedStateEnvelope<unknown>>;
  if (typeof envelope.hash !== "string" || typeof envelope.version !== "number") {
    return { hasEnvelope: true, integrityValid: false };
  }

  const rawData = extractTopLevelDataRaw(json);
  if (rawData === null) {
    return { hasEnvelope: true, integrityValid: false };
  }

  const expectedHash = computeIntegrityHash(`${rawData};version=${envelope.version}`);
  return { hasEnvelope: true, integrityValid: expectedHash === envelope.hash };
}

function parseImportState<T>(
  json: string,
  options?: { allowCorrupt?: boolean }
): ParsedImportStateResult<T> {
  const parsed = JSON.parse(json) as unknown;
  const inspection = inspectImportState(json);
  if (inspection.hasEnvelope) {
    if (!inspection.integrityValid && !options?.allowCorrupt) {
      throw new StateIntegrityError();
    }
    const envelope = parsed as VersionedStateEnvelope<T>;
    return {
      state: envelope.data,
      hasEnvelope: true,
      integrityValid: inspection.integrityValid,
    };
  }

  return {
    state: parsed as T,
    hasEnvelope: false,
    integrityValid: true,
  };
}

function saveStateToStorage(state: AppStateWithHistory): PersistenceMode {
  const attempts: Array<{ mode: PersistenceMode; payload: AppStateWithHistory }> = [
    {
      mode: "full-history",
      payload: state,
    },
    {
      mode: "history-20",
      payload: {
        ...state,
        ...trimHistoryToCurrent(state, 20),
      },
    },
    {
      mode: "history-5",
      payload: {
        ...state,
        ...trimHistoryToCurrent(state, 5),
      },
    },
    {
      mode: "current-only",
      payload: {
        ...state,
        history: [state.current],
        historyIndex: 0,
      },
    },
    {
      mode: "current-without-raw-csv",
      payload: {
        ...state,
        current: { ...state.current, csvRawData: [] },
        history: [{ ...state.current, csvRawData: [] }],
        historyIndex: 0,
      },
    },
    {
      mode: "current-without-csv",
      payload: {
        ...state,
        current: { ...state.current, csvData: [], csvRawData: [] },
        history: [{ ...state.current, csvData: [], csvRawData: [] }],
        historyIndex: 0,
      },
    },
  ];

  for (const attempt of attempts) {
    try {
      localStorage.setItem(STORAGE_KEY, serializeStateEnvelope(attempt.payload));
      return attempt.mode;
    } catch (error) {
      if (!isQuotaExceededError(error)) {
        console.error("Failed to save state to localStorage:", error);
        return "failed";
      }
    }
  }

  return "failed";
}

function hydrateAppStateShape(base: AppState): AppState {
  const validSortSpecs = (specs: AppState["step2SortSpecs"] | AppState["step3SortSpecs"]) =>
    Array.isArray(specs)
      ? specs.filter(
          (s): s is { key: string; dir: "asc" | "desc" } =>
            !!s && typeof s.key === "string" && (s.dir === "asc" || s.dir === "desc")
        )
      : [];

  const teams = Array.isArray(base.teams) ? base.teams : [];
  const distribution = Array.isArray(base.distribution) ? base.distribution : [];
  const { teams: normTeams, distribution: normDist } = normalizeTeamsAndDistribution(
    teams,
    distribution
  );

  return {
    ...base,
    currentStep: clampWizardStepIndex(
      typeof base.currentStep === "number" ? base.currentStep : 0
    ),
    valueMappings: hydrateValueMappingsIfEmpty(base.valueMappings),
    hasHeader: typeof base.hasHeader === "boolean" ? base.hasHeader : true,
    step2SortSpecs: validSortSpecs(base.step2SortSpecs),
    step3SortSpecs: validSortSpecs(base.step3SortSpecs),
    teams: normTeams,
    distribution: normDist,
  };
}

// Load from localStorage
const loadStateFromStorage = (): AppStateWithHistory | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsedResult = parseImportState<AppStateWithHistory>(stored);
      if (parsedResult.hasEnvelope && !parsedResult.integrityValid) {
        console.error("Failed to load state from localStorage: integrity hash mismatch.");
        return null;
      }
      const loaded = parsedResult.state;
      if (!loaded || typeof loaded !== "object") {
        return null;
      }

      const maybeLoaded = loaded as Partial<AppStateWithHistory>;
      const base = maybeLoaded.current || getDefaultAppState();
      const current = hydrateAppStateShape(base);
      const historyRaw = maybeLoaded.history || [current];
      const history = historyRaw.map((h: AppState) => hydrateAppStateShape(h));
      return {
        current,
        history,
        historyIndex: maybeLoaded.historyIndex ?? 0,
        maxHistorySize: 50,
      };
    }
  } catch (error) {
    console.error("Failed to load state from localStorage:", error);
  }
  return null;
};

const freshState = getDefaultAppState();

const initialState: AppStateWithHistory = loadStateFromStorage() || {
  current: freshState,
  history: [freshState],
  historyIndex: 0,
  maxHistorySize: 50,
};

// Reducer
function appStateReducer(
  state: AppStateWithHistory,
  action: AppStateAction
): AppStateWithHistory {
  let newState: AppState;

  switch (action.type) {
    case "SET_CSV_DATA":
      newState = {
        ...state.current,
        csvData: action.payload.csvData,
        csvRawData: action.payload.csvRawData,
        hasHeader: action.payload.hasHeader,
      };
      break;
    case "SET_CUSTOM_FIELDS":
      newState = {
        ...state.current,
        customFields: action.payload,
      };
      break;
    case "ADD_CUSTOM_FIELD":
      newState = {
        ...state.current,
        customFields: {
          ...state.current.customFields,
          [action.payload.fieldId]: action.payload.fieldName,
        },
      };
      break;
    case "SET_VALUE_MAPPINGS":
      newState = {
        ...state.current,
        valueMappings: action.payload,
      };
      break;
    case "UPDATE_PERSON":
      newState = {
        ...state.current,
        persons: state.current.persons.map((p) =>
          p.id === action.payload.id ? { ...p, ...action.payload.updates } : p
        ),
      };
      break;
    case "SET_COLUMN_MAPPING":
      newState = {
        ...state.current,
        columnMapping: action.payload,
      };
      break;
    case "SET_PERSONS":
      newState = {
        ...state.current,
        persons: action.payload,
      };
      break;
    case "SET_STEP2_SORT_SPECS":
      newState = {
        ...state.current,
        step2SortSpecs: action.payload,
      };
      break;
    case "SET_TEAMS": {
      const merged = { ...state.current, teams: action.payload };
      const { teams, distribution } = normalizeTeamsAndDistribution(
        merged.teams,
        merged.distribution
      );
      newState = { ...merged, teams, distribution };
      break;
    }
    case "SET_STEP3_SORT_SPECS":
      newState = {
        ...state.current,
        step3SortSpecs: action.payload,
      };
      break;
    case "SET_DISTRIBUTION": {
      const merged = { ...state.current, distribution: action.payload };
      const { teams, distribution } = normalizeTeamsAndDistribution(
        merged.teams,
        merged.distribution
      );
      newState = { ...merged, teams, distribution };
      break;
    }
    case "SET_INVITATION_TEMPLATE":
      newState = {
        ...state.current,
        invitationTemplate: action.payload,
      };
      break;
    case "SET_GENERATED_INVITATIONS":
      newState = {
        ...state.current,
        generatedInvitations: action.payload,
      };
      break;
    case "LOAD_STATE":
      newState = hydrateAppStateShape(action.payload);
      // If skipHistory is true, don't add to history (used for undo/redo)
      if (action.skipHistory) {
        return {
          ...state,
          current: newState,
        };
      }
      break;
    case "SET_CURRENT_STEP":
      return {
        ...state,
        current: {
          ...state.current,
          currentStep: clampWizardStepIndex(action.payload),
        },
      };
    case "UNDO":
      if (state.historyIndex > 0) {
        const newIndex = state.historyIndex - 1;
        return {
          ...state,
          current: hydrateAppStateShape(state.history[newIndex]),
          historyIndex: newIndex,
        };
      }
      return state;
    case "REDO":
      if (state.historyIndex < state.history.length - 1) {
        const newIndex = state.historyIndex + 1;
        return {
          ...state,
          current: hydrateAppStateShape(state.history[newIndex]),
          historyIndex: newIndex,
        };
      }
      return state;
    case "RESET":
      newState = getDefaultAppState();
      break;
    default:
      return state;
  }

  // Add to history (unless skipping)
  const newHistory = state.history.slice(0, state.historyIndex + 1);
  newHistory.push(newState);
  
  // Limit history size
  if (newHistory.length > state.maxHistorySize) {
    newHistory.shift();
    return {
      current: newState,
      history: newHistory,
      historyIndex: newHistory.length - 1,
      maxHistorySize: state.maxHistorySize,
    };
  }

  return {
    current: newState,
    history: newHistory,
    historyIndex: newHistory.length - 1,
    maxHistorySize: state.maxHistorySize,
  };
}

// Context
interface AppStateContextType {
  state: AppState;
  dispatch: React.Dispatch<AppStateAction>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  saveToHistory: () => void;
  exportState: () => string;
  importState: (json: string, options?: { allowCorrupt?: boolean }) => void;
}

const AppStateContext = createContext<AppStateContextType | undefined>(undefined);

// Provider
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [stateWithHistory, dispatch] = useReducer(appStateReducer, initialState);
  const lastPersistenceModeRef = React.useRef<PersistenceMode | null>(null);

  // Save to localStorage whenever state changes
  React.useEffect(() => {
    const mode = saveStateToStorage(stateWithHistory);

    if (mode === lastPersistenceModeRef.current) return;

    if (mode === "failed") {
      console.error(
        "Failed to save state to localStorage: storage quota exceeded for all fallback modes."
      );
    } else if (mode !== "full-history") {
      console.warn(
        `Saved app state in reduced mode (${mode}) due to localStorage quota limits.`
      );
    } else if (lastPersistenceModeRef.current && lastPersistenceModeRef.current !== "full-history") {
      console.info("localStorage persistence recovered to full history mode.");
    }

    lastPersistenceModeRef.current = mode;
  }, [stateWithHistory]);

  const undo = useCallback(() => {
    dispatch({ type: "UNDO" });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: "REDO" });
  }, []);

  const canUndo = stateWithHistory.historyIndex > 0;
  const canRedo = stateWithHistory.historyIndex < stateWithHistory.history.length - 1;

  const saveToHistory = useCallback(() => {
    // Current state is already in history, but we can force a save point
    // by dispatching a no-op that triggers history update
    // Actually, we'll just ensure the current state is saved
    // The reducer already handles this
  }, []);

  const exportState = useCallback(() => {
    return serializeStateEnvelope(stateWithHistory.current, true);
  }, [stateWithHistory.current]);

  const importState = useCallback((json: string, options?: { allowCorrupt?: boolean }) => {
    try {
      const parsedResult = parseImportState<AppState>(json, options);
      const importedState = parsedResult.state;

      if (!importedState || typeof importedState !== "object") {
        throw new Error("Invalid state payload");
      }

      dispatch({
        type: "LOAD_STATE",
        payload: hydrateAppStateShape({
          ...importedState,
          valueMappings: hydrateValueMappingsIfEmpty(importedState.valueMappings),
        }),
        skipHistory: false,
      });
    } catch (error) {
      console.error("Failed to import state:", error);
      if (error instanceof StateIntegrityError) {
        throw error;
      }
      throw new Error("Invalid state file");
    }
  }, []);

  return (
    <AppStateContext.Provider
      value={{
        state: stateWithHistory.current,
        dispatch,
        undo,
        redo,
        canUndo,
        canRedo,
        saveToHistory,
        exportState,
        importState,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

// Hook
export function useAppState() {
  const context = useContext(AppStateContext);
  if (context === undefined) {
    throw new Error("useAppState must be used within an AppStateProvider");
  }
  return context;
}

