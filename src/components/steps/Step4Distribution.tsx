import { useState } from "react";
import { useAppState } from "@/context/AppStateContext";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Course } from "@/types/models";
import { createDistribution } from "@/utils/distribution";
import { Sparkles, AlertCircle } from "lucide-react";

export function Step4Distribution() {
  const { state, dispatch } = useAppState();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateDistribution = () => {
    setIsGenerating(true);
    setError(null);

    try {
      const distribution = createDistribution(state.teams, state.persons);
      dispatch({
        type: "SET_DISTRIBUTION",
        payload: distribution,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler bei der Verteilung");
    } finally {
      setIsGenerating(false);
    }
  };

  // Get team and person details for display
  const distributionWithDetails = state.distribution.map((dist) => {
    const team = state.teams.find((t) => t.id === dist.teamId);
    const person1 = team
      ? state.persons.find((p) => p.id === team.person1Id)
      : null;
    const person2 = team
      ? state.persons.find((p) => p.id === team.person2Id)
      : null;

    const guestDetails = dist.guestRelations.map((relation) => {
      const hostTeam = state.teams.find((t) => t.id === relation.hostTeamId);
      const hostPerson1 = hostTeam
        ? state.persons.find((p) => p.id === hostTeam.person1Id)
        : null;
      const hostPerson2 = hostTeam
        ? state.persons.find((p) => p.id === hostTeam.person2Id)
        : null;
      return {
        relation,
        hostTeam,
        hostPerson1,
        hostPerson2,
      };
    });

    return {
      dist,
      team,
      person1,
      person2,
      guestDetails,
    };
  });

  const courseLabels: Record<Course, string> = {
    Vorspeise: "Vorspeise",
    Hauptgang: "Hauptgang",
    Nachspeise: "Nachspeise",
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Schritt 4: Verteilung</h2>
        <p className="text-muted-foreground">
          Erstellen Sie automatisch die Verteilung der Teams auf die Gänge und Gastgeber-Verhältnisse.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {state.teams.length} Teams verfügbar
          </p>
        </div>
        <Button
          onClick={handleGenerateDistribution}
          disabled={isGenerating || state.teams.length < 3}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          {isGenerating ? "Erstelle Verteilung..." : "Verteilung erstellen"}
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-md flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {state.distribution.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Verteilung</h3>
          <div className="border rounded-md overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Team</TableHead>
                  <TableHead>Kocht</TableHead>
                  <TableHead>Küche</TableHead>
                  <TableHead>Isst bei</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {distributionWithDetails.map(({ dist, person1, person2, guestDetails }) => (
                  <TableRow key={dist.teamId}>
                    <TableCell>
                      <div>
                        <div>{person1?.name}</div>
                        <div className="text-sm text-muted-foreground">{person2?.name}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{courseLabels[dist.course]}</span>
                    </TableCell>
                    <TableCell>{dist.kitchenId}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {guestDetails.map(({ relation, hostPerson1, hostPerson2 }, idx) => (
                          <div key={idx} className="text-sm">
                            <span className="font-medium">
                              {hostPerson1?.name} + {hostPerson2?.name}
                            </span>
                            <span className="text-muted-foreground ml-2">
                              ({courseLabels[relation.course]})
                            </span>
                          </div>
                        ))}
                        {guestDetails.length < 2 && (
                          <div className="text-sm text-destructive">
                            Fehlt: {2 - guestDetails.length} Gastgeber
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {state.distribution.length === 0 && state.teams.length >= 3 && (
        <div className="p-4 border rounded-md text-center text-muted-foreground">
          Klicken Sie auf "Verteilung erstellen", um die automatische Verteilung zu generieren.
        </div>
      )}

      {state.teams.length < 3 && (
        <div className="p-4 border rounded-md text-center text-muted-foreground">
          Mindestens 3 Teams benötigt für die Verteilung.
        </div>
      )}
    </div>
  );
}

