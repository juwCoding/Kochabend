import React, { createContext, useContext, useReducer, useCallback } from "react";
import type { ReactNode } from "react";
import type { AppState } from "@/types/models";
import { clampWizardStepIndex } from "@/types/models";
import { getDefaultAppState, hydrateValueMappingsIfEmpty } from "@/defaultValueMappings";

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

function hydrateAppStateShape(base: AppState): AppState {
  const validSortSpecs = (specs: AppState["step2SortSpecs"] | AppState["step3SortSpecs"]) =>
    Array.isArray(specs)
      ? specs.filter(
          (s): s is { key: string; dir: "asc" | "desc" } =>
            !!s && typeof s.key === "string" && (s.dir === "asc" || s.dir === "desc")
        )
      : [];

  return {
    ...base,
    currentStep: clampWizardStepIndex(
      typeof base.currentStep === "number" ? base.currentStep : 0
    ),
    valueMappings: hydrateValueMappingsIfEmpty(base.valueMappings),
    hasHeader: typeof base.hasHeader === "boolean" ? base.hasHeader : true,
    step2SortSpecs: validSortSpecs(base.step2SortSpecs),
    step3SortSpecs: validSortSpecs(base.step3SortSpecs),
  };
}

// Load from localStorage
const loadStateFromStorage = (): AppStateWithHistory | null => {
  try {
    const stored = localStorage.getItem("kochabend_state");
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
    case "SET_TEAMS":
      newState = {
        ...state.current,
        teams: action.payload,
      };
      break;
    case "SET_STEP3_SORT_SPECS":
      newState = {
        ...state.current,
        step3SortSpecs: action.payload,
      };
      break;
    case "SET_DISTRIBUTION":
      newState = {
        ...state.current,
        distribution: action.payload,
      };
      break;
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
          current: state.history[newIndex],
          historyIndex: newIndex,
        };
      }
      return state;
    case "REDO":
      if (state.historyIndex < state.history.length - 1) {
        const newIndex = state.historyIndex + 1;
        return {
          ...state,
          current: state.history[newIndex],
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

  // Save to localStorage whenever state changes
  React.useEffect(() => {
    try {
      localStorage.setItem("kochabend_state", JSON.stringify(stateWithHistory));
    } catch (error) {
      console.error("Failed to save state to localStorage:", error);
    }
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

