import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface WizardProps {
  currentStep: number;
  totalSteps: number;
  onStepChange: (step: number) => void;
  children: ReactNode;
  canProceed?: boolean; // Whether the current step can proceed
}

export function Wizard({ currentStep, totalSteps, onStepChange, children, canProceed = true }: WizardProps) {
  const canGoBack = currentStep > 0;
  const canGoForward = currentStep < totalSteps - 1 && canProceed;

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Array.from({ length: totalSteps }).map((_, index) => (
            <div key={index} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  index === currentStep
                    ? "bg-primary text-primary-foreground"
                    : index < currentStep
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {index + 1}
              </div>
              {index < totalSteps - 1 && (
                <div
                  className={`w-12 h-1 ${
                    index < currentStep ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <div className="text-sm text-muted-foreground">
          Schritt {currentStep + 1} von {totalSteps}
        </div>
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

