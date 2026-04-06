import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface WizardProps {
  currentStep: number;
  totalSteps: number;
  /** Höchster Schrittindex (0-basiert), zu dem navigiert werden darf. */
  maxReachableStep: number;
  onStepChange: (step: number) => void;
  children: ReactNode;
  canProceed?: boolean; // Whether the current step can proceed
}

export function Wizard({
  currentStep,
  totalSteps,
  maxReachableStep,
  onStepChange,
  children,
  canProceed = true,
}: WizardProps) {
  const canGoBack = currentStep > 0;
  const canGoForward = currentStep < totalSteps - 1 && canProceed;

  return (
    <div className="space-y-6">
      {/* Step indicator + seitliche Navigation */}
      <div className="flex items-center justify-center gap-3 sm:gap-4">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0 cursor-pointer"
          onClick={() => onStepChange(currentStep - 1)}
          disabled={!canGoBack}
          aria-label="Vorheriger Schritt"
        >
          <span aria-hidden className="text-lg leading-none">
            &lt;
          </span>
        </Button>

        <div className="flex items-center justify-center min-w-0 overflow-x-auto p-1">
          {Array.from({ length: totalSteps }).map((_, index) => {
            const unlocked = index <= maxReachableStep;
            const isCurrent = index === currentStep;
            const isPast = index < currentStep;

            return (
              <div key={index} className="flex items-center">
                <button
                  type="button"
                  disabled={!unlocked}
                  onClick={() => unlocked && onStepChange(index)}
                  title={unlocked ? `Schritt ${index + 1}` : "Schritt noch nicht freigeschaltet"}
                  className={cn(
                    "w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                    !unlocked &&
                      "bg-muted text-muted-foreground opacity-45 cursor-not-allowed",
                    unlocked &&
                      isCurrent &&
                      "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
                    unlocked &&
                      !isCurrent &&
                      isPast &&
                      "bg-primary/20 text-primary hover:bg-primary/30 cursor-pointer",
                    unlocked &&
                      !isCurrent &&
                      !isPast &&
                      "bg-muted text-foreground ring-2 ring-primary/35 hover:bg-muted/80"
                  )}
                >
                  {index + 1}
                </button>
                {index < totalSteps - 1 && (
                  <div
                    className={cn(
                      "w-8 sm:w-12 h-1 shrink-0 mx-0.5 rounded-full",
                      index < currentStep ? "bg-primary" : "bg-muted"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0 cursor-pointer"
          onClick={() => onStepChange(currentStep + 1)}
          disabled={!canGoForward}
          aria-label="Nächster Schritt"
        >
          <span aria-hidden className="text-lg leading-none">
            &gt;
          </span>
        </Button>
      </div>

      {/* Step content */}
      <div className="min-h-[400px]">{children}</div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button
          variant="outline"
          onClick={() => onStepChange(currentStep - 1)}
          disabled={!canGoBack}
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Zurück
        </Button>
        <Button
          onClick={() => onStepChange(currentStep + 1)}
          disabled={!canGoForward}
        >
          Weiter
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
