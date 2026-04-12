import { useState } from "react";
import { AppStateProvider, useAppState } from "@/context/AppStateContext";
import { Wizard } from "@/components/Wizard";
import { Button } from "@/components/ui/button";
import { Step1CSVImport } from "@/components/steps/Step1CSVImport";
import { Step2DataCleaning } from "@/components/steps/Step2DataCleaning";
import { Step3TeamAssignment } from "@/components/steps/Step3TeamAssignment";
import { Step4Distribution } from "@/components/steps/Step4Distribution";
import { Step5Invitations } from "@/components/steps/Step5Invitations";
import { Undo2, Redo2, Download, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { isStep2Valid } from "@/utils/matching";
import { isStep3Valid } from "@/utils/teamDerived";
import { clampWizardStepIndex } from "@/types/models";

const STEPS = [
  { title: "CSV Import", component: Step1CSVImport },
  { title: "Daten-Cleaning", component: Step2DataCleaning },
  { title: "Team-Zuordnung", component: Step3TeamAssignment },
  { title: "Verteilung", component: Step4Distribution },
  { title: "Einladungen", component: Step5Invitations },
];

const REQUIRED_FIELDS: Array<keyof typeof import("@/types/models").COLUMN_FIELDS> = ["name", "preference", "intolerances", "kitchen", "kitchenAddress"];

function AppContent() {
  const { state, dispatch, undo, redo, canUndo, canRedo, exportState, importState } = useAppState();
  const [isImporting, setIsImporting] = useState(false);

  const currentStep = clampWizardStepIndex(state.currentStep);
  const setCurrentStep = (step: number) => {
    dispatch({ type: "SET_CURRENT_STEP", payload: step });
  };

  // Check if step 1 is complete (all required fields mapped)
  const isStep1Complete = () => {
    if (state.csvData.length === 0) return false;
    const mappedFields = new Set(Object.values(state.columnMapping));
    return REQUIRED_FIELDS.every((field) => mappedFields.has(field));
  };

  const handleDownload = () => {
    const json = exportState();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kochabend_${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = e.target?.result as string;
        importState(json);
        setIsImporting(false);
      } catch (error) {
        console.error("Failed to import:", error);
        alert("Fehler beim Importieren der Datei");
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
  };

  const CurrentStepComponent = STEPS[currentStep].component;

  const step1Done = isStep1Complete();
  const step2Done = isStep2Valid(state.persons, state.columnMapping);
  const step3Done = isStep3Valid(state.teams, state.persons);
  const maxReachableStep = !step1Done
    ? 0
    : !step2Done
      ? 1
      : !step3Done
        ? 2
        : STEPS.length - 1;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-6">
          <h1 className="text-4xl font-bold mb-2">Schnitzi kocht</h1>
        </div>

        {/* Toolbar */}
        <div className="mb-6 flex items-center justify-between gap-4 p-4 border rounded-md bg-card">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={undo}
              disabled={!canUndo}
              title="Rückgängig"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={redo}
              disabled={!canRedo}
              title="Wiederholen"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <label>
              <Input
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
                disabled={isImporting}
              />
              <Button variant="outline" size="sm" asChild>
                <span>
                  <Upload className="mr-2 h-4 w-4" />
                  Importieren
                </span>
              </Button>
            </label>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
          </div>
        </div>

        {/* Wizard */}
        <div className="bg-card border rounded-lg p-6">
          <Wizard
            currentStep={currentStep}
            totalSteps={STEPS.length}
            maxReachableStep={maxReachableStep}
            onStepChange={setCurrentStep}
            canProceed={
              currentStep === 0
                ? step1Done
                : currentStep === 1
                  ? step2Done
                  : currentStep === 2
                    ? step3Done
                    : true
            }
          >
            <CurrentStepComponent />
          </Wizard>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <AppStateProvider>
      <AppContent />
    </AppStateProvider>
  );
}

export default App;
