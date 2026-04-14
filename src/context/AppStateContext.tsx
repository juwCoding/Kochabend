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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(attempt.payload));
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
      const parsed = JSON.parse(stored);
      const base = parsed.current || getDefaultAppState();
      const current = hydrateAppStateShape(base);
      const historyRaw = parsed.history || [current];
      const history = historyRaw.map((h: AppState) => hydrateAppStateShape(h));
      return {
        current,
        history,
        historyIndex: parsed.historyIndex ?? 0,
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
  importState: (json: string) => void;
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
    return JSON.stringify(stateWithHistory.current, null, 2);
  }, [stateWithHistory.current]);

  const importState = useCallback((json: string) => {
    try {
      const importedState: AppState = JSON.parse(json);
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

