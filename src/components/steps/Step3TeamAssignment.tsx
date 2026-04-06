import { useState, useMemo } from "react";
import { useAppState } from "@/context/AppStateContext";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Team, FoodPreference } from "@/types/models";
import { Users, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { categorizePartnerFields } from "@/utils/partnerSuggestions";

function hasUsableKitchen(personKitchen?: string): boolean {
  return personKitchen === "kann_gekocht_werden" || personKitchen === "partner_kocht";
}

function preferenceRank(preference?: FoodPreference): number {
  if (preference === "vegan") return 3;
  if (preference === "vegetarisch") return 2;
  return 1; // egal oder fehlend
}

function combinePreference(person1Preference?: FoodPreference, person2Preference?: FoodPreference): FoodPreference {
  const p1 = person1Preference ?? "egal";
  const p2 = person2Preference ?? "egal";
  return preferenceRank(p1) >= preferenceRank(p2) ? p1 : p2;
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
  kitchen?: { address: string };
  secondaryKitchen?: { address: string };
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
      return `${team.kitchen?.address ?? team.team.kitchenId ?? ""} ${team.secondaryKitchen?.address ?? ""}`
        .trim();
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

  const kitchens = useMemo(() => {
    const kitchenMap = new Map<string, { id: string; address: string }>();
    for (const person of state.persons) {
      if (!kitchenMap.has(person.kitchenAddress)) {
        kitchenMap.set(person.kitchenAddress, {
          id: person.kitchenAddress,
          address: person.kitchenAddress,
        });
      }
    }
    return Array.from(kitchenMap.values());
  }, [state.persons]);

  const teamsWithDetails = useMemo(() => {
    return state.teams.map((team) => {
      const person1 = state.persons.find((p) => p.id === team.person1Id);
      const person2 = state.persons.find((p) => p.id === team.person2Id);
      const kitchen = kitchens.find((k) => k.id === team.kitchenId);
      const secondaryKitchen = team.secondaryKitchenId
        ? kitchens.find((k) => k.id === team.secondaryKitchenId)
        : undefined;

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
        kitchen,
        secondaryKitchen,
        chosenPreference,
        preferenceNote,
      };
    });
  }, [state.teams, state.persons, kitchens]);

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

  const createTeamForPair = (person1Id: string, person2Id: string) => {
    if (!person1Id || !person2Id || person1Id === person2Id) return;

    const person1 = state.persons.find((p) => p.id === person1Id);
    const person2 = state.persons.find((p) => p.id === person2Id);

    if (!person1 || !person2) return;

    const availableKitchenIds: string[] = [];
    if (hasUsableKitchen(person1.kitchen) && person1.kitchenAddress) {
      availableKitchenIds.push(person1.kitchenAddress);
    }
    if (hasUsableKitchen(person2.kitchen) && person2.kitchenAddress) {
      availableKitchenIds.push(person2.kitchenAddress);
    }
    const uniqueKitchenIds = Array.from(new Set(availableKitchenIds));
    const kitchenId = uniqueKitchenIds[0] ?? person1.kitchenAddress ?? person2.kitchenAddress ?? "";
    const secondaryKitchenId = uniqueKitchenIds[1];

    const preference = combinePreference(person1.preference, person2.preference);

    const newTeam: Team = {
      id: `team_${Date.now()}`,
      person1Id: person1.id,
      person2Id: person2.id,
      kitchenId,
      secondaryKitchenId,
      preference,
    };

    dispatch({
      type: "SET_TEAMS",
      payload: [...state.teams, newTeam],
    });

    setSelectedPerson1("");
    setSelectedPerson2("");
    setIsDialogOpen(false);
  };

  const handleCreateTeam = () => {
    createTeamForPair(selectedPerson1, selectedPerson2);
  };

  const handleDeleteTeam = (teamId: string) => {
    dispatch({
      type: "SET_TEAMS",
      payload: state.teams.filter((t) => t.id !== teamId),
    });
  };

  const suggestionRowClass =
    "p-3 border rounded-md hover:bg-accent cursor-pointer flex items-center justify-between gap-3";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">Schritt 3: Team-Zuordnung</h2>
        <p className="text-muted-foreground">
          Partner-Angaben aus der Liste werden ausgewertet. Bereits erstellte Teams stehen oben; darunter
          folgen Vorschläge und Personen ohne Partner-Eintrag.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 border rounded-md">
          <div className="text-2xl font-bold">{state.persons.length}</div>
          <div className="text-sm text-muted-foreground">Personen gesamt</div>
        </div>
        <div className="p-4 border rounded-md">
          <div className="text-2xl font-bold">{availablePersons.length}</div>
          <div className="text-sm text-muted-foreground">Noch nicht in einem Team</div>
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
                  ({ team, person1, person2, kitchen, secondaryKitchen, chosenPreference, preferenceNote }) => (
                  <TableRow key={team.id}>
                    <TableCell>{person1?.name ?? "?"}</TableCell>
                    <TableCell>{person2?.name ?? "?"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium">
                          {kitchen?.address ?? team.kitchenId ?? "?"}
                        </span>
                        {secondaryKitchen && (
                          <span className="inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium">
                            {secondaryKitchen.address}
                          </span>
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
              <div
                key={`${person1.id}-${person2.id}`}
                className={suggestionRowClass}
                onClick={() => createTeamForPair(person1.id, person2.id)}
              >
                <div>
                  <span className="font-medium">{person1.name}</span>
                  {" · "}
                  <span className="font-medium">{person2.name}</span>
                </div>
                <span className="text-sm text-muted-foreground shrink-0">Als Team übernehmen</span>
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
              return (
              <div
                key={`${seeker.id}-${target.id}`}
                className={suggestionRowClass}
                onClick={() => createTeamForPair(seeker.id, target.id)}
              >
                <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0">
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
                <span className="text-sm text-muted-foreground shrink-0">Übernehmen</span>
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button>
            <Users className="mr-2 h-4 w-4" />
            Neues Team erstellen
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neues Team erstellen</DialogTitle>
          </DialogHeader>
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
                      {person.name} (
                      {hasUsableKitchen(person.kitchen)
                        ? "mit Küche"
                        : "ohne Küche"}
                      )
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
                        {person.name} (
                        {hasUsableKitchen(person.kitchen)
                          ? "mit Küche"
                          : "ohne Küche"}
                        )
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleCreateTeam}
              disabled={!selectedPerson1 || !selectedPerson2}
              className="w-full"
            >
              Team erstellen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
