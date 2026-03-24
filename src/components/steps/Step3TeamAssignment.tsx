import { useState, useMemo } from "react";
import { useAppState } from "@/context/AppStateContext";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Person, Team, FoodPreference, Kitchen } from "@/types/models";
import { Users, Trash2 } from "lucide-react";

export function Step3TeamAssignment() {
  const { state, dispatch } = useAppState();
  const [selectedPerson1, setSelectedPerson1] = useState<string>("");
  const [selectedPerson2, setSelectedPerson2] = useState<string>("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Get available persons (not yet in a team)
  const availablePersons = useMemo(() => {
    const teamPersonIds = new Set(
      state.teams.flatMap((team) => [team.person1Id, team.person2Id])
    );
    return state.persons.filter((p) => !teamPersonIds.has(p.id));
  }, [state.persons, state.teams]);

  // Get kitchens from persons
  const kitchens = useMemo(() => {
    const kitchenMap = new Map<string, Kitchen>();
    for (const person of state.persons) {
      if (!kitchenMap.has(person.kitchenAddress)) {
        kitchenMap.set(person.kitchenAddress, {
          id: person.kitchenAddress,
          address: person.kitchenAddress,
          capacity: 1,
          availableSlots: ["Vorspeise", "Hauptgang", "Nachspeise"],
        });
      }
    }
    return Array.from(kitchenMap.values());
  }, [state.persons]);

  // Get teams with person details
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

  // Suggest matches: person without kitchen + person with kitchen
  const suggestedMatches = useMemo(() => {
    const withoutKitchen = availablePersons.filter(
      (p) => p.kitchen === "kann_nicht_gekocht_werden"
    );
    const withKitchen = availablePersons.filter(
      (p) => p.kitchen === "kann_gekocht_werden" || p.kitchen === "partner_kocht"
    );

    const suggestions: Array<{ person1: Person; person2: Person; reason: string }> = [];

    for (const p1 of withoutKitchen) {
      for (const p2 of withKitchen) {
        // Prefer matching by preference
        let reason = "Küche-Matching";
        if (p1.preference === p2.preference && p1.preference !== "egal") {
          reason = `Küche + ${p1.preference}`;
        }
        suggestions.push({ person1: p1, person2: p2, reason });
      }
    }

    return suggestions.slice(0, 5); // Show top 5 suggestions
  }, [availablePersons]);

  const handleCreateTeam = () => {
    if (!selectedPerson1 || !selectedPerson2 || selectedPerson1 === selectedPerson2) {
      return;
    }

    const person1 = state.persons.find((p) => p.id === selectedPerson1);
    const person2 = state.persons.find((p) => p.id === selectedPerson2);

    if (!person1 || !person2) return;

    // Determine kitchen (prefer person with kitchen)
    let kitchenId: string;
    if (person1.kitchen === "kann_gekocht_werden" || person1.kitchen === "partner_kocht") {
      kitchenId = person1.kitchenAddress;
    } else if (person2.kitchen === "kann_gekocht_werden" || person2.kitchen === "partner_kocht") {
      kitchenId = person2.kitchenAddress;
    } else {
      // Both don't have kitchen, use person1's kitchen address
      kitchenId = person1.kitchenAddress;
    }

    // Determine combined preference
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

  const handleDeleteTeam = (teamId: string) => {
    dispatch({
      type: "SET_TEAMS",
      payload: state.teams.filter((t) => t.id !== teamId),
    });
  };

  const handleSuggestionClick = (person1Id: string, person2Id: string) => {
    setSelectedPerson1(person1Id);
    setSelectedPerson2(person2Id);
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Schritt 3: Team-Zuordnung</h2>
        <p className="text-muted-foreground">
          Erstellen Sie Teams aus zwei Personen. Personen ohne Küche sollten mit Personen mit Küche gematched werden.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 border rounded-md">
          <div className="text-2xl font-bold">{state.persons.length}</div>
          <div className="text-sm text-muted-foreground">Gesamt Personen</div>
        </div>
        <div className="p-4 border rounded-md">
          <div className="text-2xl font-bold">{availablePersons.length}</div>
          <div className="text-sm text-muted-foreground">Verfügbare Personen</div>
        </div>
        <div className="p-4 border rounded-md">
          <div className="text-2xl font-bold">{state.teams.length}</div>
          <div className="text-sm text-muted-foreground">Teams</div>
        </div>
      </div>

      {suggestedMatches.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Vorschläge</h3>
          <div className="grid grid-cols-1 gap-2">
            {suggestedMatches.map((suggestion, index) => (
              <div
                key={index}
                className="p-3 border rounded-md hover:bg-accent cursor-pointer"
                onClick={() =>
                  handleSuggestionClick(suggestion.person1.id, suggestion.person2.id)
                }
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{suggestion.person1.name}</span>
                    {" + "}
                    <span className="font-medium">{suggestion.person2.name}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">{suggestion.reason}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                      {person.name} ({person.kitchen === "kann_gekocht_werden" || person.kitchen === "partner_kocht" ? "mit Küche" : "ohne Küche"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Person 2</label>
              <Select
                value={selectedPerson2}
                onValueChange={setSelectedPerson2}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Person auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {availablePersons
                    .filter((p) => p.id !== selectedPerson1)
                    .map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.name} ({person.kitchen === "kann_gekocht_werden" || person.kitchen === "partner_kocht" ? "mit Küche" : "ohne Küche"})
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

      {teamsWithDetails.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Erstellte Teams</h3>
          <div className="border rounded-md overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person 1</TableHead>
                  <TableHead>Person 2</TableHead>
                  <TableHead>Küche</TableHead>
                  <TableHead>Ernährungsform</TableHead>
                  <TableHead>Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamsWithDetails.map(({ team, person1, person2, kitchen }) => (
                  <TableRow key={team.id}>
                    <TableCell>{person1?.name || "?"}</TableCell>
                    <TableCell>{person2?.name || "?"}</TableCell>
                    <TableCell>{kitchen?.address || "?"}</TableCell>
                    <TableCell>{team.preference}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteTeam(team.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

