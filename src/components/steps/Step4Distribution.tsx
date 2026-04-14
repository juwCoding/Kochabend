import { useState, useMemo } from "react";
import { useAppState } from "@/context/AppStateContext";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Course, Distribution, Team } from "@/types/models";
import { createDistribution } from "@/utils/distribution";
import { DistributionFlowVisualization } from "@/components/DistributionFlowVisualization";
import { formatCookSnapshotLine, formatGuestSnapshotLine } from "@/utils/distributionDisplay";
import { getTeamPreference } from "@/utils/teamDerived";
import { Sparkles, AlertCircle, Users } from "lucide-react";
import { cn } from "@/lib/utils";

function teamMemberLine(team: Team, persons: { id: string; name: string }[]): string {
  const p1 = persons.find((p) => p.id === team.person1Id);
  const p2 = persons.find((p) => p.id === team.person2Id);
  return [p1?.name, p2?.name].filter(Boolean).join(" + ") || "Unbekanntes Team";
}

function aggregateMealPreference(preferences: string[]): string {
  if (preferences.some((preference) => preference === "vegan")) return "vegan";
  if (preferences.some((preference) => preference === "vegetarisch")) return "vegetarisch";
  return "egal";
}

export function Step4Distribution() {
  const { state, dispatch } = useAppState();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teamPreferenceById = useMemo(() => {
    const byId = new Map<string, string>();
    for (const team of state.teams) {
      byId.set(team.id, getTeamPreference(team, state.persons));
    }
    return byId;
  }, [state.teams, state.persons]);

  const distributedTeamIds = useMemo(
    () => new Set(state.distribution.map((d) => d.cookTeamId)),
    [state.distribution]
  );

  const undistributedTeams = useMemo(
    () => state.teams.filter((t) => !distributedTeamIds.has(t.id)),
    [state.teams, distributedTeamIds]
  );

  const hasOrphanDistributionTeam = useMemo(
    () =>
      state.distribution.some(
        (d) => !state.teams.some((t) => t.id === d.cookTeamId)
      ),
    [state.distribution, state.teams]
  );

  /** Jeder Eintrag aus der gespeicherten Verteilung pro Gang; fehlendes Team = nicht mehr in Schritt 3. */
  const cookingRowsByCourse = useMemo(() => {
    const byCourse: Record<Course, { dist: Distribution; team: Team | null }[]> = {
      Vorspeise: [],
      Hauptgang: [],
      Nachspeise: [],
    };
    for (const dist of state.distribution) {
      const team = state.teams.find((t) => t.id === dist.cookTeamId) ?? null;
      byCourse[dist.course].push({ dist, team });
    }
    return byCourse;
  }, [state.distribution, state.teams]);

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
    const team = state.teams.find((t) => t.id === dist.cookTeamId);
    const person1 = team
      ? state.persons.find((p) => p.id === team.person1Id)
      : null;
    const person2 = team
      ? state.persons.find((p) => p.id === team.person2Id)
      : null;

    const guestTeamIds = Array.isArray(dist.guestTeamIds)
      ? dist.guestTeamIds
      : [dist.guestTeam1Id, dist.guestTeam2Id].filter(
          (guestTeamId): guestTeamId is string => typeof guestTeamId === "string" && guestTeamId.length > 0
        );

    const guestDetails = guestTeamIds
      .map((guestTeamId, idx) => ({
        guestTeamId,
        snapshotLabel: formatGuestSnapshotLine(dist, idx + 1),
      }))
      .map((guest) => {
        const guestTeam = state.teams.find((t) => t.id === guest.guestTeamId);
        const guestPerson1 = guestTeam
          ? state.persons.find((p) => p.id === guestTeam.person1Id)
          : null;
        const guestPerson2 = guestTeam
          ? state.persons.find((p) => p.id === guestTeam.person2Id)
          : null;
        return {
          ...guest,
          guestTeam,
          guestPerson1,
          guestPerson2,
          guestPreference: guestTeam
            ? teamPreferenceById.get(guestTeam.id) ?? "egal"
            : null,
        };
      });

    const mealPreferences = [
      team ? teamPreferenceById.get(team.id) ?? "egal" : null,
      ...guestDetails.map((guest) => guest.guestPreference),
    ].filter((value): value is string => typeof value === "string" && value.length > 0);

    return {
      dist,
      team,
      person1,
      person2,
      guestDetails,
      mealPreference: aggregateMealPreference(mealPreferences),
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

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Aktuelle Verteilung</h3>

        {state.distribution.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-md border p-4">
            Es liegt noch keine Verteilung vor. Nach dem Erzeugen sehen Sie hier, welches Team welchen Gang kocht.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {(Object.keys(courseLabels) as Course[]).map((course) => {
              const rowsHere = cookingRowsByCourse[course];
              return (
                <div key={course} className="rounded-md border p-4 space-y-2">
                  <div className="font-medium">{courseLabels[course]}</div>
                  <p className="text-sm text-muted-foreground">
                    {rowsHere.length} {rowsHere.length === 1 ? "Eintrag" : "Einträge"} in der Verteilung
                  </p>
                  <ul className="text-sm space-y-1.5 list-disc list-inside">
                    {rowsHere.map(({ dist, team }) => (
                      <li
                        key={dist.cookTeamId}
                        className={cn(
                          "rounded-md px-2 py-1.5 -mx-2",
                          team
                            ? ""
                            : "list-none bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100 border border-amber-300/80 dark:border-amber-700/80"
                        )}
                      >
                        {team ? (
                          teamMemberLine(team, state.persons)
                        ) : (
                          <span>
                            <span className="font-medium">Team nicht mehr in Schritt 3</span>
                            <span className="block text-sm mt-0.5">{formatCookSnapshotLine(dist)}</span>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {undistributedTeams.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" />
            Noch nicht verteilt
          </h3>
          <p className="text-sm text-muted-foreground">
            Diese Teams fehlen in der aktuellen Verteilung (z. B. nach nachträglich hinzugefügten Teams). Erstellen Sie die
            Verteilung erneut, um alle Teams einzubeziehen.
          </p>
          <ul className="rounded-md border divide-y">
            {undistributedTeams.map((team) => (
              <li key={team.id} className="px-4 py-2 text-sm">
                {teamMemberLine(team, state.persons)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.distribution.length > 0 &&
        undistributedTeams.length === 0 &&
        !hasOrphanDistributionTeam && (
        <p className="text-sm text-muted-foreground">
          Alle {state.teams.length} Teams sind in der Verteilung enthalten.
        </p>
      )}

      {state.distribution.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Abend-Routen</h3>
          <DistributionFlowVisualization
            distribution={state.distribution}
            teams={state.teams}
            persons={state.persons}
          />
        </div>
      )}

      {state.distribution.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Detailansicht</h3>
          <div className="border rounded-md overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Team</TableHead>
                  <TableHead>Kocht</TableHead>
                  <TableHead>Küche</TableHead>
                  <TableHead>Ernährungsform</TableHead>
                  <TableHead>Gäste</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {distributionWithDetails.map(({ dist, team, person1, person2, guestDetails, mealPreference }) => (
                  <TableRow
                    key={dist.cookTeamId}
                    className={cn(!team && "bg-amber-100/80 dark:bg-amber-950/30")}
                  >
                    <TableCell>
                      {team ? (
                        <div className="space-y-0.5">
                          <div>{person1?.name}</div>
                          <div>{person2?.name}</div>
                        </div>
                      ) : (
                        <div className="rounded-md border border-amber-300/80 dark:border-amber-700/80 bg-amber-100 dark:bg-amber-950/40 px-2 py-1.5 text-sm">
                          <div className="font-medium text-amber-950 dark:text-amber-100">
                            Team nicht mehr in Schritt 3
                          </div>
                          <div className="text-amber-900/90 dark:text-amber-200/95 mt-0.5">
                            {formatCookSnapshotLine(dist)}
                          </div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{courseLabels[dist.course]}</span>
                    </TableCell>
                    <TableCell>{dist.kitchenId}</TableCell>
                    <TableCell>
                      <span className="font-medium">{mealPreference}</span>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {guestDetails.map(({ guestTeam, guestPerson1, guestPerson2, snapshotLabel, guestPreference }, idx) => (
                          <div
                            key={idx}
                            className={cn(
                              "text-sm rounded-md px-2 py-1 -mx-2",
                              !guestTeam &&
                                "bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100 border border-amber-300/80 dark:border-amber-700/80"
                            )}
                          >
                            {guestTeam ? (
                              <>
                                <span className="font-medium">
                                  {guestPerson1?.name} + {guestPerson2?.name}
                                </span>
                                <span className="ml-2 text-xs text-muted-foreground">
                                  ({guestPreference ?? "egal"})
                                </span>
                              </>
                            ) : (
                              <span>
                                <span className="font-medium">
                                  Gast-Team nicht mehr in Schritt 3
                                </span>
                                <span className="block text-sm mt-0.5">{snapshotLabel}</span>
                              </span>
                            )}
                          </div>
                        ))}
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

