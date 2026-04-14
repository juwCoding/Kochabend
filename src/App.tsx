import { useEffect, useState } from "react";
import { AppStateProvider, useAppState } from "@/context/AppStateContext";
import { Wizard } from "@/components/Wizard";
import { Button } from "@/components/ui/button";
import { Step1CSVImport } from "@/components/steps/Step1CSVImport";
import { Step2DataCleaning } from "@/components/steps/Step2DataCleaning";
import { Step3TeamAssignment } from "@/components/steps/Step3TeamAssignment";
import { Step4Distribution } from "@/components/steps/Step4Distribution";
import { Step5Invitations } from "@/components/steps/Step5Invitations";
import { Undo2, Redo2, Download, Upload, HelpCircle, ChevronDown } from "lucide-react";
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
const GENERAL_EXPLANATION_KEY = "general";

function AppContent() {
  const { state, dispatch, undo, redo, canUndo, canRedo, exportState, importState } = useAppState();
  const [isImporting, setIsImporting] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [openExplanationItem, setOpenExplanationItem] = useState("step-0");

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
  const currentStepExplanationKey = `step-${currentStep}`;

  useEffect(() => {
    setOpenExplanationItem(currentStepExplanationKey);
  }, [currentStepExplanationKey]);

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
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowExplanation((prev) => {
                  const next = !prev;
                  if (!prev) {
                    setOpenExplanationItem(currentStepExplanationKey);
                  }
                  return next;
                });
              }}
              title="Erklärungen ein- oder ausblenden"
              aria-expanded={showExplanation}
            >
              <HelpCircle className="h-4 w-4" />
              <span className="sr-only">Erklärungen</span>
            </Button>
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

        {showExplanation && (
          <div className="mb-6 border rounded-lg bg-card">
            <div className="border-b px-4 py-3">
              <h2 className="text-lg font-semibold">Erklärungen</h2>
              <p className="text-sm text-muted-foreground">
                Eine kurze Orientierung zum Ablauf und zu jedem Schritt.
              </p>
            </div>
            <div className="divide-y">
              <ExplanationAccordionItem
                title="Allgemein"
                isOpen={openExplanationItem === GENERAL_EXPLANATION_KEY}
                onToggle={() => setOpenExplanationItem((prev) => (prev === GENERAL_EXPLANATION_KEY ? "" : GENERAL_EXPLANATION_KEY))}
              >
                <p>
                  Dieses Tool hilft dir, einen Kochabend strukturiert zu planen: aus Teilnehmenden-Daten werden saubere Teams,
                  eine faire Verteilung auf Vorspeise/Hauptgang/Nachspeise und am Ende klare Einladungsinfos.
                </p>
                <p className="mt-2">
                  Empfohlener Start: erst eine Umfrage mit allen relevanten Angaben (z. B. Name, Präferenz, Intoleranzen,
                  Küche, Adresse) machen und daraus eine CSV erstellen. Diese CSV importierst du dann hier im ersten Schritt.
                </p>
                <p className="mt-2">
                  Dein Stand wird im Browser gespeichert, damit du beim nächsten Öffnen weitermachen kannst. Zur Sicherheit
                  kannst du zusätzlich jederzeit über <strong>Download</strong> eine JSON-Sicherung exportieren und später über
                  <strong> Importieren</strong> wieder laden.
                </p>
                <p className="mt-2">
                  Mit <strong>Undo/Redo</strong> kannst du Änderungen rückgängig machen oder wiederherstellen, falls du etwas
                  testen oder korrigieren willst.
                </p>
              </ExplanationAccordionItem>

              {STEPS.map((step, index) => {
                const stepKey = `step-${index}`;
                return (
                  <ExplanationAccordionItem
                    key={step.title}
                    title={`Schritt ${index + 1}: ${step.title}`}
                    isOpen={openExplanationItem === stepKey}
                    onToggle={() => setOpenExplanationItem((prev) => (prev === stepKey ? "" : stepKey))}
                  >
                    {index === 0 && (
                      <>
                        <p>
                          Lade deine CSV-Datei hoch und ordne jede Spalte dem passenden Feld zu. Wichtig ist, dass alle
                          Pflichtfelder korrekt gemappt sind, sonst bleibt der nächste Schritt gesperrt.
                        </p>
                      </>
                    )}
                    {index === 1 && (
                      <>
                        <p>
                          Prüfe die importierten Personen und bereinige fehlerhafte oder fehlende Daten. Typische Punkte sind
                          uneinheitliche Schreibweisen, leere Felder oder widersprüchliche Küchenangaben.
                        </p>
                        <p className="mt-2">
                          Nimm dir hier kurz Zeit: sauberes Mapping spart dir später viel Nacharbeit bei Bereinigung, Teams und Verteilung. Ziel ist ein stabiler Datensatz, auf dem die Team-Zuordnung sauber aufbauen kann.
                        </p>
                      </>
                    )}
                    {index === 2 && (
                      <>
                        <p>
                          Stelle Zweierteams zusammen und achte dabei auf sinnvolle Paarungen. Diese Teams bilden die zentrale
                          Einheit für alle folgenden Schritte.
                        </p>
                      </>
                    )}
                    {index === 3 && (
                      <>
                        <p>
                          Erzeuge die automatische Verteilung. Danach siehst du je Gang, welches Team kocht, welche Gäste
                          zugeordnet sind und wie die Wege durch den Abend verlaufen.
                        </p>
                        <p className="mt-2">
                          Prüfe die Übersicht und den Flow auf Plausibilität; bei Änderungen an Teams kannst du die Verteilung
                          erneut erstellen.
                        </p>
                      </>
                    )}
                    {index === 4 && (
                      <>
                        <p>
                          Nutze die finalen Ergebnisse, um Einladungen bzw. Nachrichten für alle Teams vorzubereiten. Hier
                          solltest du alle Infos für Gastgeber- und Gastrollen kompakt vorfinden.
                        </p>
                        <p className="mt-2">
                          Wenn etwas nicht passt, kannst du jederzeit zu früheren Schritten zurückspringen, anpassen und die
                          Ergebnisse neu erzeugen.
                        </p>
                      </>
                    )}
                  </ExplanationAccordionItem>
                );
              })}
            </div>
          </div>
        )}

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

        <footer className="mt-8 border-t pt-4 text-sm text-muted-foreground">
          <p>
            <a
              href="https://github.com/juwCoding/Kochabend"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              https://github.com/juwCoding/Kochabend
            </a>
          </p>
          <p className="mt-1">Copyright © juwCoding</p>
          <p className="mt-1">
            Dies ist ein Sideprojekt und kann Fehler enthalten. Über den Link oben kannst du Probleme melden; dort würden dann auch neue Versionen bereitgestellt.
          </p>
        </footer>
      </div>
    </div>
  );
}

function ExplanationAccordionItem({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section>
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/50"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span className="font-medium">{title}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && <div className="px-4 pb-4 text-sm text-muted-foreground">{children}</div>}
    </section>
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
