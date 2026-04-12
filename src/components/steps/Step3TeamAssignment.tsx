import { useState, useMemo, useEffect } from "react";
import { useAppState } from "@/context/AppStateContext";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Team, FoodPreference, Person, KitchenStatus } from "@/types/models";
import { formatKitchenLabel } from "@/utils/valueResolution";
import { Users, Trash2, ChevronDown, ChevronUp, Wand2 } from "lucide-react";
import { categorizePartnerFields } from "@/utils/partnerSuggestions";
import {
  computeAutoTeamAssignment,
  type AutoTeamAssignmentResult,
} from "@/utils/autoTeamAssignment";
import {
  combinePreference,
  preferenceRank,
  getTeamKitchenOptions,
  countWastedTeamSlots,
  getPersonIdsWithDuplicateTeamAssignments,
  orphanTeamPersonIds,
} from "@/utils/teamDerived";
import { stableTeamId } from "@/utils/stableTeamId";

const KITCHEN_OPTIONS_ORDER: KitchenStatus[] = [
  "kann_gekocht_werden",
  "partner_kocht",
  "kann_nicht_gekocht_werden",
];

function kitchenCountsByOption(persons: Person[]): {
  rows: { status: KitchenStatus; count: number }[];
  unset: number;
} {
  const counts = new Map<KitchenStatus, number>();
  for (const k of KITCHEN_OPTIONS_ORDER) counts.set(k, 0);
  let unset = 0;
  for (const p of persons) {
    const k = p.kitchen;
    if (
      k === "kann_gekocht_werden" ||
      k === "partner_kocht" ||
      k === "kann_nicht_gekocht_werden"
    ) {
      counts.set(k, (counts.get(k) ?? 0) + 1);
    } else {
      unset++;
    }
  }
  return {
    rows: KITCHEN_OPTIONS_ORDER.map((status) => ({ status, count: counts.get(status) ?? 0 })),
    unset,
  };
}

function kitchenRoleLabel(kitchen: string | undefined): string {
  if (kitchen === "kann_gekocht_werden") return "mit eigener Küche";
  if (kitchen === "partner_kocht") return "Küche beim Partner";
  return "ohne Küche";
}

/** Wenn nicht null, darf der einseitige Vorschlag nicht übernommen werden (Grund für die UI). */
function explainOneWayTeamBlock(
  seeker: { id: string; name: string },
  target: { id: string; name: string },
  teamPersonIds: Set<string>
): string | null {
  const seekerBusy = teamPersonIds.has(seeker.id);
  const targetBusy = teamPersonIds.has(target.id);
  if (!seekerBusy && !targetBusy) return null;
  if (seekerBusy && targetBusy) {
    return `${seeker.name} und ${target.name} sind bereits jeweils einem Team zugeordnet.`;
  }
  if (seekerBusy) {
    return `${seeker.name} ist bereits in einem Team.`;
  }
  return `${target.name} ist bereits in einem Team. Zum Übernehmen das bestehende Team zuerst auflösen oder die Zuordnung manuell anpassen.`;
}

function teamPersonIdSet(teams: { person1Id: string; person2Id: string }[]): Set<string> {
  return new Set(teams.flatMap((t) => [t.person1Id, t.person2Id]));
}

type TeamTableSortKey = "person1" | "person2" | "kitchen" | "preference";
type TeamSortSpec = { key: TeamTableSortKey; dir: "asc" | "desc" };

interface TeamWithDetails {
  team: Team;
  person1?: { name?: string };
  person2?: { name?: string };
  kitchenOptions: string[];
  chosenPreference: FoodPreference;
  preferenceNote: string | null;
}

function sortComparableForTeamColumn(team: TeamWithDetails, key: TeamTableSortKey): string {
  switch (key) {
    case "person1":
      return (team.person1?.name ?? "").trim();
    case "person2":
      return (team.person2?.name ?? "").trim();
    case "kitchen":
      return team.kitchenOptions.join(" ");
    case "preference":
      return `${team.chosenPreference} ${team.preferenceNote ?? ""}`.trim();
    default:
      return "";
  }
}

function compareTeamsBySortSpecs(a: TeamWithDetails, b: TeamWithDetails, specs: TeamSortSpec[]): number {
  for (const { key, dir } of specs) {
    const va = sortComparableForTeamColumn(a, key);
    const vb = sortComparableForTeamColumn(b, key);
    const cmp = va.localeCompare(vb, "de", { numeric: true, sensitivity: "base" });
    if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
  }
  return 0;
}

function TeamTableSortHead({
  label,
  columnKey,
  sortSpecs,
  onToggle,
  onPromote,
}: {
  label: string;
  columnKey: TeamTableSortKey;
  sortSpecs: TeamSortSpec[];
  onToggle: (key: TeamTableSortKey) => void;
  onPromote: (key: TeamTableSortKey) => void;
}) {
  const specIndex = sortSpecs.findIndex((s) => s.key === columnKey);
  const spec = specIndex >= 0 ? sortSpecs[specIndex] : undefined;
  const showPriorityIndex = sortSpecs.length > 1 && spec !== undefined && specIndex >= 0;
  return (
    <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => onToggle(columnKey)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {spec?.dir === "asc" && <ChevronUp className="h-4 w-4 shrink-0 opacity-70" aria-hidden />}
        {spec?.dir === "desc" && <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />}
        {showPriorityIndex && (
          <button
            type="button"
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-medium text-muted-foreground tabular-nums leading-none hover:bg-muted"
            aria-label={`Sortierpriorität ${specIndex + 1} von ${sortSpecs.length}`}
            title={specIndex > 0 ? `#${specIndex + 1}: eins nach vorne schieben` : `#${specIndex + 1}: bereits zuerst`}
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

export function Step3TeamAssignment() {
  const { state, dispatch } = useAppState();
  const [selectedPerson1, setSelectedPerson1] = useState<string>("");
  const [selectedPerson2, setSelectedPerson2] = useState<string>("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [autoAssignment, setAutoAssignment] = useState<AutoTeamAssignmentResult | null>(null);
  const teamSortSpecs = useMemo(
    () =>
      state.step3SortSpecs.filter(
        (s): s is TeamSortSpec => typeof s?.key === "string" && (s.dir === "asc" || s.dir === "desc")
      ),
    [state.step3SortSpecs]
  );

  const teamPersonIds = useMemo(() => teamPersonIdSet(state.teams), [state.teams]);

  const availablePersons = useMemo(() => {
    return state.persons.filter((p) => !teamPersonIds.has(p.id));
  }, [state.persons, teamPersonIds]);

  const wastedTeamSlots = useMemo(() => countWastedTeamSlots(state.teams), [state.teams]);
  const duplicateTeamPersonIds = useMemo(
    () => getPersonIdsWithDuplicateTeamAssignments(state.teams),
    [state.teams]
  );
  const orphanTeamRefs = useMemo(
    () => orphanTeamPersonIds(state.teams, state.persons),
    [state.teams, state.persons]
  );
  const personsAssignedToTeams = state.persons.length - availablePersons.length;

  const kitchenStats = useMemo(() => kitchenCountsByOption(state.persons), [state.persons]);

  const teamsWithDetails = useMemo(() => {
    return state.teams.map((team) => {
      const person1 = state.persons.find((p) => p.id === team.person1Id);
      const person2 = state.persons.find((p) => p.id === team.person2Id);
      const kitchenOptions = getTeamKitchenOptions(team, state.persons);

      const person1Preference = person1?.preference ?? "egal";
      const person2Preference = person2?.preference ?? "egal";
      const chosenPreference = combinePreference(person1Preference, person2Preference);
      const preferenceNote =
        person1Preference !== person2Preference
          ? preferenceRank(person1Preference) >= preferenceRank(person2Preference)
            ? `(${person2?.name ?? "?"}: ${person2Preference})`
            : `(${person1?.name ?? "?"}: ${person1Preference})`
          : null;

      return {
        team,
        person1,
        person2,
        kitchenOptions,
        chosenPreference,
        preferenceNote,
      };
    });
  }, [state.teams, state.persons]);

  const sortedTeamsWithDetails = useMemo(() => {
    if (teamSortSpecs.length === 0) return teamsWithDetails;
    const indexed = teamsWithDetails.map((t, i) => ({ t, i }));
    indexed.sort((a, b) => {
      const cmp = compareTeamsBySortSpecs(a.t, b.t, teamSortSpecs);
      if (cmp !== 0) return cmp;
      return a.i - b.i;
    });
    return indexed.map((x) => x.t);
  }, [teamsWithDetails, teamSortSpecs]);

  const setStep3SortSpecs = (next: TeamSortSpec[]) => {
    dispatch({ type: "SET_STEP3_SORT_SPECS", payload: next });
  };

  const toggleTeamColumnSort = (key: TeamTableSortKey) => {
    const i = teamSortSpecs.findIndex((s) => s.key === key);
    if (i === -1) return setStep3SortSpecs([...teamSortSpecs, { key, dir: "asc" }]);
    if (teamSortSpecs[i].dir === "asc") {
      return setStep3SortSpecs(
        teamSortSpecs.map((s, j) => (j === i ? { ...s, dir: "desc" as const } : s))
      );
    }
    setStep3SortSpecs(teamSortSpecs.filter((_, j) => j !== i));
  };

  const promoteTeamColumnSort = (key: TeamTableSortKey) => {
    const i = teamSortSpecs.findIndex((s) => s.key === key);
    if (i <= 0) return;
    const next = [...teamSortSpecs];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    setStep3SortSpecs(next);
  };

  const partnerBuckets = useMemo(() => categorizePartnerFields(state.persons), [state.persons]);

  const mutualPairsVisible = useMemo(() => {
    return partnerBuckets.mutualPairs.filter(
      ({ person1, person2 }) => !teamPersonIds.has(person1.id) && !teamPersonIds.has(person2.id)
    );
  }, [partnerBuckets.mutualPairs, teamPersonIds]);

  const oneWayVisible = useMemo(() => {
    return partnerBuckets.oneWayPairs.filter(({ seeker }) => !teamPersonIds.has(seeker.id));
  }, [partnerBuckets.oneWayPairs, teamPersonIds]);

  const unmatchedVisible = useMemo(() => {
    return partnerBuckets.unmatchedPartnerText.filter(({ person }) => !teamPersonIds.has(person.id));
  }, [partnerBuckets.unmatchedPartnerText, teamPersonIds]);

  const restVisible = useMemo(() => {
    return partnerBuckets.personsWithEmptyPartner.filter((p) => !teamPersonIds.has(p.id));
  }, [partnerBuckets.personsWithEmptyPartner, teamPersonIds]);

  const [teamPairFeedback, setTeamPairFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (teamPairFeedback === null) return;
    const id = window.setTimeout(() => setTeamPairFeedback(null), 7000);
    return () => window.clearTimeout(id);
  }, [teamPairFeedback]);

  /** @returns true wenn ein neues Team angelegt wurde */
  const tryCreateTeamForPair = (person1Id: string, person2Id: string): boolean => {
    if (!person1Id || !person2Id || person1Id === person2Id) {
      setTeamPairFeedback("Bitte zwei verschiedene Personen wählen.");
      return false;
    }

    const person1 = state.persons.find((p) => p.id === person1Id);
    const person2 = state.persons.find((p) => p.id === person2Id);

    if (!person1 || !person2) {
      setTeamPairFeedback("Eine Person wurde nicht gefunden. Bitte Daten in Schritt 2 prüfen.");
      return false;
    }

    if (teamPersonIds.has(person1Id) || teamPersonIds.has(person2Id)) {
      const blocked: string[] = [];
      if (teamPersonIds.has(person1Id)) blocked.push(person1.name);
      if (teamPersonIds.has(person2Id)) blocked.push(person2.name);
      const list = blocked.join(" und ");
      setTeamPairFeedback(
        blocked.length === 1
          ? `${list} ist bereits in einem Team.`
          : `${list} sind bereits in einem Team.`
      );
      return false;
    }

    const newTeam: Team = {
      id: stableTeamId(person1.id, person2.id),
      person1Id: person1.id,
      person2Id: person2.id,
    };

    dispatch({
      type: "SET_TEAMS",
      payload: [...state.teams, newTeam],
    });

    setTeamPairFeedback(null);
    setSelectedPerson1("");
    setSelectedPerson2("");
    setIsDialogOpen(false);
    return true;
  };

  const handleCreateTeam = () => {
    tryCreateTeamForPair(selectedPerson1, selectedPerson2);
  };

  const runAutoTeamAssignment = () => {
    setAutoAssignment(computeAutoTeamAssignment(availablePersons));
  };

  const acceptAutoPair = (a: Person, b: Person) => {
    const ok = tryCreateTeamForPair(a.id, b.id);
    if (!ok) return;
    setAutoAssignment((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        pairs: prev.pairs.filter(
          ([x, y]) =>
            !(
              (x.id === a.id && y.id === b.id) ||
              (x.id === b.id && y.id === a.id)
            )
        ),
      };
    });
  };

  const handleDeleteTeam = (teamId: string) => {
    dispatch({
      type: "SET_TEAMS",
      payload: state.teams.filter((t) => t.id !== teamId),
    });
  };

  const suggestionRowClass =
    "p-3 border rounded-md flex flex-wrap items-center justify-between gap-3 bg-card";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">Schritt 3: Team-Zuordnung</h2>
        <p className="text-muted-foreground">
          Partner-Angaben aus der Liste werden ausgewertet. Bereits erstellte Teams stehen oben; darunter
          folgen Vorschläge und Personen ohne Partner-Eintrag.
        </p>
      </div>

      {teamPairFeedback && !isDialogOpen && (
        <div
          role="status"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {teamPairFeedback}
        </div>
      )}

      {(wastedTeamSlots > 0 || orphanTeamRefs.length > 0) && (
        <div className="space-y-2 rounded-md border border-destructive/60 bg-destructive/10 p-4 text-sm">
          {wastedTeamSlots > 0 && (
            <p className="text-destructive">
              <span className="font-medium">Doppelte Team-Zuordnung:</span> In den Teams kommen insgesamt{" "}
              {wastedTeamSlots} Platz{wastedTeamSlots === 1 ? "" : "e"} mehrfach vor – dieselbe Person ist in
              mehreren Teams (oder zweimal im selben Team) eingetragen. Dadurch wirkt die Zahl „Noch nicht in
              einem Team“ höher als 84 − 2 × Anzahl Teams.
            </p>
          )}
          {duplicateTeamPersonIds.length > 0 && (
            <p className="text-muted-foreground">
              Betroffene Personen:{" "}
              {duplicateTeamPersonIds
                .map((id) => state.persons.find((p) => p.id === id)?.name ?? id)
                .join(", ")}
            </p>
          )}
          {orphanTeamRefs.length > 0 && (
            <p className="text-destructive">
              <span className="font-medium">Hinweis:</span> {orphanTeamRefs.length} Team-Verweis
              {orphanTeamRefs.length === 1 ? "" : "e"} zeigt auf Person-IDs, die in der aktuellen Liste nicht
              vorkommen (häufig nach erneutem CSV-Import). Betroffene Teams zeigen „?“ in der Tabelle.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 border rounded-md">
          <div className="text-2xl font-bold">{state.persons.length}</div>
          <div className="text-sm text-muted-foreground">Personen gesamt</div>
          <div className="mt-2 space-y-0.5 border-t pt-2 text-xs text-muted-foreground">
            {kitchenStats.rows.map(({ status, count }) => (
              <div key={status} className="flex justify-between gap-3">
                <span>{formatKitchenLabel(status)}</span>
                <span className="tabular-nums font-medium text-foreground">{count}</span>
              </div>
            ))}
            {kitchenStats.unset > 0 && (
              <div className="flex justify-between gap-3">
                <span>nicht gesetzt</span>
                <span className="tabular-nums font-medium text-foreground">{kitchenStats.unset}</span>
              </div>
            )}
          </div>
        </div>
        <div className="p-4 border rounded-md">
          <div className="text-2xl font-bold">{availablePersons.length}</div>
          <div className="text-sm text-muted-foreground">Noch nicht in einem Team</div>
          <div className="text-xs text-muted-foreground mt-1">
            {personsAssignedToTeams} eindeutig zugeordnet · {state.teams.length * 2} Plätze in {state.teams.length}{" "}
            Teams
          </div>
        </div>
        <div className="p-4 border rounded-md">
          <div className="text-2xl font-bold">{state.teams.length}</div>
          <div className="text-sm text-muted-foreground">Erstellte Teams</div>
        </div>
      </div>

      {/* 1. Feste Teams (bereits erstellt) */}
      <section className="space-y-2">
        <h3 className="text-lg font-semibold">Feste Teams</h3>
        <p className="text-sm text-muted-foreground">
          Teams, die Sie bereits angelegt haben.
        </p>
        {teamsWithDetails.length === 0 ? (
          <p className="text-sm text-muted-foreground border rounded-md p-4">Noch keine Teams erstellt.</p>
        ) : (
          <div className="border rounded-md overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TeamTableSortHead
                    label="Person 1"
                    columnKey="person1"
                    sortSpecs={teamSortSpecs}
                    onToggle={toggleTeamColumnSort}
                    onPromote={promoteTeamColumnSort}
                  />
                  <TeamTableSortHead
                    label="Person 2"
                    columnKey="person2"
                    sortSpecs={teamSortSpecs}
                    onToggle={toggleTeamColumnSort}
                    onPromote={promoteTeamColumnSort}
                  />
                  <TeamTableSortHead
                    label="Küche"
                    columnKey="kitchen"
                    sortSpecs={teamSortSpecs}
                    onToggle={toggleTeamColumnSort}
                    onPromote={promoteTeamColumnSort}
                  />
                  <TeamTableSortHead
                    label="Ernährungsform"
                    columnKey="preference"
                    sortSpecs={teamSortSpecs}
                    onToggle={toggleTeamColumnSort}
                    onPromote={promoteTeamColumnSort}
                  />
                  <TableHead className="w-20">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTeamsWithDetails.map(
                  ({ team, person1, person2, kitchenOptions, chosenPreference, preferenceNote }) => (
                  <TableRow key={team.id}>
                    <TableCell>{person1?.name ?? "?"}</TableCell>
                    <TableCell>{person2?.name ?? "?"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        {kitchenOptions.length > 0 ? (
                          kitchenOptions.map((addr, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium"
                            >
                              {addr}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-destructive italic">Keine Küche vorhanden</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span>{chosenPreference}</span>
                      {preferenceNote && (
                        <span className="ml-2 text-muted-foreground">{preferenceNote}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteTeam(team.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* 2. Gegenseitige Partner-Vorschläge */}
      <section className="space-y-2">
        <h3 className="text-lg font-semibold">Gegenseitige Partner-Vorschläge</h3>
        <p className="text-sm text-muted-foreground">
          Beide Personen nennen sich im Partner-Feld gegenseitig (Name passt zur anderen Person).
        </p>
        {mutualPairsVisible.length === 0 ? (
          <p className="text-sm text-muted-foreground border rounded-md p-4">Keine Treffer.</p>
        ) : (
          <div className="grid gap-2">
            {mutualPairsVisible.map(({ person1, person2 }) => (
              <div key={`${person1.id}-${person2.id}`} className={suggestionRowClass}>
                <div>
                  <span className="font-medium">{person1.name}</span>
                  {" · "}
                  <span className="font-medium">{person2.name}</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => tryCreateTeamForPair(person1.id, person2.id)}
                >
                  Als Team übernehmen
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. Einseitige Partner-Vorschläge */}
      <section className="space-y-2">
        <h3 className="text-lg font-semibold">Einseitige Partner-Vorschläge</h3>
        <p className="text-sm text-muted-foreground">
          Eine Person nennt eine andere, die andere Person nennt diese nicht (oder jemand anderen).
        </p>
        {oneWayVisible.length === 0 ? (
          <p className="text-sm text-muted-foreground border rounded-md p-4">Keine Treffer.</p>
        ) : (
          <div className="grid gap-2">
            {oneWayVisible.map(({ seeker, target }) => {
              const seekerChoice = seeker.partner?.trim() ?? "";
              const targetPartner = target.partner?.trim();
              const blockReason = explainOneWayTeamBlock(seeker, target, teamPersonIds);
              return (
              <div key={`${seeker.id}-${target.id}`} className={suggestionRowClass}>
                <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0 min-w-0 flex-1">
                  <span className="font-medium">{seeker.name}</span>
                  <span className="text-foreground"> -&gt; </span>
                  <span className="text-foreground/55 dark:text-foreground/60">
                    {seekerChoice}
                  </span>
                  <span className="text-foreground"> ~ </span>
                  <span className="font-medium">{target.name}</span>
                  {targetPartner ? (
                    <span className="text-foreground/55 dark:text-foreground/60">
                      {` (-> ${targetPartner})`}
                    </span>
                  ) : null}
                </div>
                {blockReason ? (
                  <p className="text-sm text-muted-foreground max-w-xs sm:max-w-md text-right leading-snug shrink-0">
                    {blockReason}
                  </p>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => tryCreateTeamForPair(seeker.id, target.id)}
                  >
                    Übernehmen
                  </Button>
                )}
              </div>
            );
            })}
          </div>
        )}
      </section>

      {/* 4. Partner-Eintrag ohne passende Person */}
      <section className="space-y-2">
        <h3 className="text-lg font-semibold">Partner-Eintrag ohne passende Person</h3>
        <p className="text-sm text-muted-foreground">
          Im Partner-Feld steht Text, der keiner Person in der Liste zugeordnet werden konnte.
        </p>
        {unmatchedVisible.length === 0 ? (
          <p className="text-sm text-muted-foreground border rounded-md p-4">Keine Treffer.</p>
        ) : (
          <div className="border rounded-md divide-y">
            {unmatchedVisible.map(({ person, partnerText }) => (
              <div key={person.id} className="p-3 flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{person.name}</span>
                <span className="text-sm text-muted-foreground">
                  Partner-Feld: „{partnerText}“
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 5. Rest (ohne Partner-Angabe) */}
      <section className="space-y-2">
        <h3 className="text-lg font-semibold">Ohne Partner-Angabe</h3>
        <p className="text-sm text-muted-foreground">
          Personen ohne Eintrag im Partner-Feld (und noch keinem Team), für manuelle Zuordnung.
        </p>
        {restVisible.length === 0 ? (
          <p className="text-sm text-muted-foreground border rounded-md p-4">Keine Personen in dieser Kategorie.</p>
        ) : (
          <ul className="border rounded-md divide-y">
            {restVisible.map((p) => (
              <li key={p.id} className="px-3 py-2 text-sm">
                {p.name}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (open) setTeamPairFeedback(null);
          }}
        >
          <DialogTrigger asChild>
            <Button type="button">
              <Users className="mr-2 h-4 w-4" />
              Neues Team erstellen
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Neues Team erstellen</DialogTitle>
            </DialogHeader>
            {teamPairFeedback && (
              <div
                role="status"
                className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {teamPairFeedback}
              </div>
            )}
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Person 1</label>
                <Select value={selectedPerson1} onValueChange={setSelectedPerson1}>
                  <SelectTrigger>
                    <SelectValue placeholder="Person auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePersons.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.name} ({kitchenRoleLabel(person.kitchen)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Person 2</label>
                <Select value={selectedPerson2} onValueChange={setSelectedPerson2}>
                  <SelectTrigger>
                    <SelectValue placeholder="Person auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePersons
                      .filter((p) => p.id !== selectedPerson1)
                      .map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.name} ({kitchenRoleLabel(person.kitchen)})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                onClick={handleCreateTeam}
                disabled={!selectedPerson1 || !selectedPerson2}
                className="w-full"
              >
                Team erstellen
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Button type="button" variant="outline" onClick={runAutoTeamAssignment}>
          <Wand2 className="mr-2 h-4 w-4" />
          Automatisch zuordnen
        </Button>
      </div>

      {autoAssignment !== null && (
        <section className="space-y-2">
          <h3 className="text-lg font-semibold">Automatisch vorgeschlagene Teams</h3>
          <p className="text-sm text-muted-foreground">
            Vorschlag nur aus Personen ohne Team. Erneut auf „Automatisch zuordnen“ klicken, um neu zu
            mischen. „Übernehmen“ legt das jeweilige Paar als Team an.
          </p>
          {autoAssignment.pairs.length === 0 && autoAssignment.unmatched.length === 0 ? (
            <p className="text-sm text-muted-foreground border rounded-md p-4">
              Keine freien Personen — alle sind bereits Teams zugeordnet.
            </p>
          ) : (
            <div className="grid gap-2">
              {autoAssignment.pairs.map(([p1, p2], idx) => (
                <div
                  key={`${p1.id}-${p2.id}-${idx}`}
                  className={suggestionRowClass}
                >
                  <div>
                    <span className="font-medium">{p1.name}</span>
                    {" · "}
                    <span className="font-medium">{p2.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({kitchenRoleLabel(p1.kitchen)} / {kitchenRoleLabel(p2.kitchen)})
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => acceptAutoPair(p1, p2)}
                  >
                    Übernehmen
                  </Button>
                </div>
              ))}
              {autoAssignment.unmatched.map(({ person, reason }) => (
                <div
                  key={person.id}
                  className={`${suggestionRowClass} border-destructive/50 bg-destructive/5`}
                >
                  <span className="font-medium text-destructive">{person.name}</span>
                  <p className="text-sm text-destructive text-right max-w-md leading-snug shrink-0">
                    {reason}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
