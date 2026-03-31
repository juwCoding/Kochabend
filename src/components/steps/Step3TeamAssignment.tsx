import { useState, useMemo } from "react";
import { useAppState } from "@/context/AppStateContext";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Team, FoodPreference } from "@/types/models";
import { Users, Trash2 } from "lucide-react";
import { categorizePartnerFields } from "@/utils/partnerSuggestions";

function teamPersonIdSet(teams: { person1Id: string; person2Id: string }[]): Set<string> {
  return new Set(teams.flatMap((t) => [t.person1Id, t.person2Id]));
}

export function Step3TeamAssignment() {
  const { state, dispatch } = useAppState();
  const [selectedPerson1, setSelectedPerson1] = useState<string>("");
  const [selectedPerson2, setSelectedPerson2] = useState<string>("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

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
      return {
        team,
        person1,
        person2,
        kitchen,
      };
    });
  }, [state.teams, state.persons, kitchens]);

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

    let kitchenId: string;
    if (person1.kitchen === "kann_gekocht_werden" || person1.kitchen === "partner_kocht") {
      kitchenId = person1.kitchenAddress;
    } else if (person2.kitchen === "kann_gekocht_werden" || person2.kitchen === "partner_kocht") {
      kitchenId = person2.kitchenAddress;
    } else {
      kitchenId = person1.kitchenAddress;
    }

    let preference: FoodPreference;
    if (person1.preference === "vegan" || person2.preference === "vegan") {
      preference = "vegan";
    } else if (person1.preference === "vegetarisch" || person2.preference === "vegetarisch") {
      preference = "vegetarisch";
    } else {
      preference = "egal";
    }

    const newTeam: Team = {
      id: `team_${Date.now()}`,
      person1Id: person1.id,
      person2Id: person2.id,
      kitchenId,
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
                  <TableHead>Person 1</TableHead>
                  <TableHead>Person 2</TableHead>
                  <TableHead>Küche</TableHead>
                  <TableHead>Ernährungsform</TableHead>
                  <TableHead className="w-[80px]">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamsWithDetails.map(({ team, person1, person2, kitchen }) => (
                  <TableRow key={team.id}>
                    <TableCell>{person1?.name ?? "?"}</TableCell>
                    <TableCell>{person2?.name ?? "?"}</TableCell>
                    <TableCell>{kitchen?.address ?? "?"}</TableCell>
                    <TableCell>{team.preference}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteTeam(team.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
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
                      {person.kitchen === "kann_gekocht_werden" || person.kitchen === "partner_kocht"
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
                        {person.kitchen === "kann_gekocht_werden" || person.kitchen === "partner_kocht"
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
