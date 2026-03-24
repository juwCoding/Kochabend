import { useState, useEffect } from "react";
import { useAppState } from "@/context/AppStateContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Person } from "@/types/models";
import { findSimilarNames, findDuplicateAddresses, validatePreferences } from "@/utils/matching";
import { AlertCircle, CheckCircle2, Settings } from "lucide-react";
import type { FoodPreference, KitchenStatus, CoursePreference } from "@/types/models";

interface DataIssue {
  type: "similar_names" | "duplicate_address" | "validation";
  description: string;
  persons: Person[];
  severity: "warning" | "error";
  field?: string; // Feld, das den Fehler verursacht
  personId?: string; // Person, die den Fehler hat
}

export function Step2DataCleaning() {
  const { state, dispatch } = useAppState();
  const [persons, setPersons] = useState<Person[]>([]);
  const [issues, setIssues] = useState<DataIssue[]>([]);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [isMappingDialogOpen, setIsMappingDialogOpen] = useState(false);
  const [mappingField, setMappingField] = useState<"kitchen" | "preference" | "coursePreference">("kitchen");
  const [newMappingRaw, setNewMappingRaw] = useState("");
  const [newMappingValue, setNewMappingValue] = useState("");

  // Apply value mappings to raw CSV values
  const applyValueMapping = (field: "kitchen" | "preference" | "coursePreference", rawValue: string): string => {
    const mapping = state.valueMappings.find(
      (m) => m.field === field && m.rawValue.toLowerCase() === rawValue.toLowerCase()
    );
    return mapping ? mapping.mappedValue : rawValue;
  };

  // Check if a raw value has been mapped
  const hasMapping = (field: "kitchen" | "preference" | "coursePreference", rawValue: string): boolean => {
    if (!rawValue) return false;
    return state.valueMappings.some(
      (m) => m.field === field && m.rawValue.toLowerCase() === rawValue.toLowerCase()
    );
  };

  // Load persons from state if they exist, otherwise convert from CSV
  useEffect(() => {
    // If persons already exist in state, use them (but only if local state is empty or different)
    if (state.persons.length > 0) {
      // Only update if the state has changed (e.g., from import or external update)
      // Don't overwrite if we're currently editing
      if (persons.length === 0 || JSON.stringify(persons) !== JSON.stringify(state.persons)) {
        setPersons(state.persons);
      }
      return;
    }

    if (state.csvData.length === 0) return;

    const newPersons: Person[] = [];

    for (let i = 0; i < state.csvData.length; i++) {
      const row = state.csvData[i];
      const person: Partial<Person> = {
        id: `person_${i}`,
        _rawValues: {},
      };

      // Map CSV columns to person fields
      for (const [columnKey, field] of Object.entries(state.columnMapping)) {
        if (field === "__none__") continue;
        
        const columnIndex = parseInt(columnKey.replace("column_", ""));
        if (columnIndex >= 0 && columnIndex < row.length) {
          const rawValue = row[columnIndex]?.trim() || "";
          let value = rawValue;
          
          if (field.startsWith("custom_")) continue;
          
          switch (field) {
            case "name":
              person.name = value;
              break;
            case "preference":
              // Speichere ursprünglichen Wert
              person._rawValues!.preference = rawValue;
              // Wende Mapping an
              value = applyValueMapping("preference", rawValue);
              // Nur setzen wenn Mapping existiert oder Wert bereits gültig ist
              if (["vegan", "vegetarisch", "egal"].includes(value)) {
                person.preference = value as FoodPreference;
              } else {
                person.preference = "egal" as FoodPreference; // Fallback
              }
              break;
            case "intolerances":
              person.intolerances = value;
              break;
            case "partner":
              person.partner = value || undefined;
              break;
            case "kitchen":
              // Speichere ursprünglichen Wert
              person._rawValues!.kitchen = rawValue;
              // Wende Mapping an
              value = applyValueMapping("kitchen", rawValue);
              // Nur setzen wenn Mapping existiert oder Wert bereits gültig ist
              if (["kann_gekocht_werden", "partner_kocht", "kann_nicht_gekocht_werden"].includes(value)) {
                person.kitchen = value as KitchenStatus;
              } else {
                person.kitchen = "kann_nicht_gekocht_werden" as KitchenStatus; // Fallback
              }
              // Wenn kitchenAddress noch nicht gesetzt ist, setze einen Standardwert
              if (!person.kitchenAddress) {
                person.kitchenAddress = "";
              }
              break;
            case "kitchenAddress":
              person.kitchenAddress = value;
              break;
            case "coursePreference":
              // Speichere ursprünglichen Wert
              person._rawValues!.coursePreference = rawValue;
              // Wende Mapping an
              value = applyValueMapping("coursePreference", rawValue);
              // Nur setzen wenn Mapping existiert oder Wert bereits gültig ist
              if (["keine", "Vorspeise", "Hauptgang", "Nachspeise"].includes(value)) {
                person.coursePreference = value as CoursePreference;
              }
              break;
          }
        }
      }

      // Füge Person hinzu, auch wenn Felder fehlen (werden als Fehler markiert)
      newPersons.push(person as Person);
    }

    setPersons(newPersons);
  }, [state.csvData, state.columnMapping, state.valueMappings]);

  // Detect issues
  useEffect(() => {
    if (persons.length === 0) return;

    const detectedIssues: DataIssue[] = [];

    // Similar names
    const similarNames = findSimilarNames(persons, 0.7);
    for (const { person1, person2, similarity } of similarNames) {
      detectedIssues.push({
        type: "similar_names",
        description: `Ähnliche Namen gefunden (${Math.round(similarity * 100)}% Übereinstimmung)`,
        persons: [person1, person2],
        severity: "warning",
      });
    }

    // Duplicate addresses
    const duplicateAddresses = findDuplicateAddresses(persons);
    for (const { address, persons: addressPersons } of duplicateAddresses) {
      detectedIssues.push({
        type: "duplicate_address",
        description: `Gleiche Küchen-Adresse: ${address}`,
        persons: addressPersons,
        severity: "warning",
        field: "kitchenAddress",
      });
    }

    // Validation issues
    const validationIssues = validatePreferences(persons);
    for (const { person, issue } of validationIssues) {
      let field: string | undefined;
      if (issue.includes("Ernährungsform")) field = "preference";
      else if (issue.includes("Küche")) field = "kitchen";
      else if (issue.includes("Gericht-Präferenz")) field = "coursePreference";

      detectedIssues.push({
        type: "validation",
        description: issue,
        persons: [person],
        severity: "error",
        field,
        personId: person.id,
      });
    }

    setIssues(detectedIssues);
  }, [persons]);

  const handleConfirm = () => {
    dispatch({
      type: "SET_PERSONS",
      payload: persons,
    });
  };

  const handleUpdatePerson = (personId: string, field: keyof Person, value: any) => {
    // Update local state immediately
    const updatedPersons = persons.map((p) => (p.id === personId ? { ...p, [field]: value } : p));
    setPersons(updatedPersons);
    
    // Update global state
    dispatch({
      type: "UPDATE_PERSON",
      payload: {
        id: personId,
        updates: { [field]: value },
      },
    });
    
    // Also update the full persons array in state to ensure consistency
    dispatch({
      type: "SET_PERSONS",
      payload: updatedPersons,
    });
  };

  const handleAddMapping = () => {
    if (!newMappingRaw.trim() || !newMappingValue.trim()) return;

    const newMappings = [...state.valueMappings];
    const existingIndex = newMappings.findIndex(
      (m) => m.field === mappingField && m.rawValue.toLowerCase() === newMappingRaw.toLowerCase()
    );

    if (existingIndex >= 0) {
      newMappings[existingIndex].mappedValue = newMappingValue;
    } else {
      newMappings.push({
        field: mappingField,
        rawValue: newMappingRaw,
        mappedValue: newMappingValue,
      });
    }

    dispatch({
      type: "SET_VALUE_MAPPINGS",
      payload: newMappings,
    });

    setNewMappingRaw("");
    setNewMappingValue("");
  };

  const handleDeleteMapping = (index: number) => {
    const newMappings = [...state.valueMappings];
    newMappings.splice(index, 1);
    dispatch({
      type: "SET_VALUE_MAPPINGS",
      payload: newMappings,
    });
  };

  const getFieldIssues = (personId: string, field: string): DataIssue[] => {
    return issues.filter((issue) => issue.personId === personId && issue.field === field);
  };

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  const kitchenOptions: KitchenStatus[] = ["kann_gekocht_werden", "partner_kocht", "kann_nicht_gekocht_werden"];
  const preferenceOptions: FoodPreference[] = ["vegan", "vegetarisch", "egal"];
  const courseOptions: CoursePreference[] = ["keine", "Vorspeise", "Hauptgang", "Nachspeise"];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Schritt 2: Daten-Cleaning</h2>
        <p className="text-muted-foreground">
          Überprüfen Sie die Daten auf Duplikate, ähnliche Einträge und Validierungsfehler. Sie können Werte direkt in der Tabelle bearbeiten.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 border rounded-md">
          <div className="text-2xl font-bold">{persons.length}</div>
          <div className="text-sm text-muted-foreground">Personen</div>
        </div>
        <div className="p-4 border rounded-md">
          <div className="text-2xl font-bold text-destructive">{errorCount}</div>
          <div className="text-sm text-muted-foreground">Fehler</div>
        </div>
        <div className="p-4 border rounded-md">
          <div className="text-2xl font-bold text-yellow-600">{warningCount}</div>
          <div className="text-sm text-muted-foreground">Warnungen</div>
        </div>
      </div>

      {/* Value Mapping Dialog */}
      <Dialog open={isMappingDialogOpen} onOpenChange={setIsMappingDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">
            <Settings className="mr-2 h-4 w-4" />
            Wert-Mappings verwalten
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Wert-Mappings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Feld</label>
              <Select value={mappingField} onValueChange={(v) => setMappingField(v as typeof mappingField)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kitchen">Küche</SelectItem>
                  <SelectItem value="preference">Ernährungsform</SelectItem>
                  <SelectItem value="coursePreference">Gericht-Präferenz</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Rohwert (aus CSV)</label>
                <Input
                  value={newMappingRaw}
                  onChange={(e) => setNewMappingRaw(e.target.value)}
                  placeholder="z.B. ja"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Zugeordneter Wert</label>
                <Select value={newMappingValue} onValueChange={setNewMappingValue}>
                  <SelectTrigger>
                    <SelectValue placeholder="Wert auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {mappingField === "kitchen" &&
                      kitchenOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt === "kann_gekocht_werden" ? "bei mir" : opt === "partner_kocht" ? "bei partner" : "nicht"}
                        </SelectItem>
                      ))}
                    {mappingField === "preference" &&
                      preferenceOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    {mappingField === "coursePreference" &&
                      courseOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleAddMapping} disabled={!newMappingRaw.trim() || !newMappingValue.trim()}>
              Mapping hinzufügen
            </Button>
            <div className="space-y-2">
              <h4 className="font-medium">Aktuelle Mappings für {mappingField}</h4>
              <div className="space-y-1 max-h-48 overflow-auto">
                {state.valueMappings
                  .filter((m) => m.field === mappingField)
                  .map((mapping, index) => (
                    <div key={index} className="flex items-center justify-between p-2 border rounded">
                      <span className="text-sm">
                        "{mapping.rawValue}" → {mapping.mappedValue}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const globalIndex = state.valueMappings.findIndex(
                            (m) => m.field === mapping.field && m.rawValue === mapping.rawValue
                          );
                          if (globalIndex >= 0) handleDeleteMapping(globalIndex);
                        }}
                      >
                        Löschen
                      </Button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {issues.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Gefundene Probleme</h3>
          <div className="space-y-2">
            {issues.map((issue, index) => (
              <div
                key={index}
                className={`p-4 border rounded-md ${
                  issue.severity === "error" ? "border-destructive" : "border-yellow-500"
                }`}
              >
                <div className="flex items-start gap-2">
                  {issue.severity === "error" ? (
                    <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <div className="font-medium">{issue.description}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Betroffene Personen: {issue.persons.map((p) => p.name).join(", ")}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {persons.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Daten-Übersicht</h3>
          <div className="border rounded-md overflow-auto max-h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Ernährungsform</TableHead>
                  <TableHead>Unverträglichkeiten</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Küche</TableHead>
                  <TableHead>Küchen-Adresse</TableHead>
                  <TableHead>Gericht-Präferenz</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {persons.map((person) => {
                  const nameIssues = getFieldIssues(person.id, "name");
                  const preferenceIssues = getFieldIssues(person.id, "preference");
                  const kitchenIssues = getFieldIssues(person.id, "kitchen");
                  const kitchenAddressIssues = getFieldIssues(person.id, "kitchenAddress");
                  const courseIssues = getFieldIssues(person.id, "coursePreference");

                  return (
                    <TableRow key={person.id}>
                      <TableCell>
                        {editingPersonId === person.id ? (
                          <Input
                            value={person.name}
                            onChange={(e) => handleUpdatePerson(person.id, "name", e.target.value)}
                            onBlur={() => setEditingPersonId(null)}
                            className={nameIssues.some((i) => i.severity === "error") ? "border-destructive" : ""}
                          />
                        ) : (
                          <span
                            className={nameIssues.some((i) => i.severity === "error") ? "text-destructive font-medium" : ""}
                            onClick={() => setEditingPersonId(person.id)}
                            style={{ cursor: "pointer" }}
                          >
                            {person.name}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingPersonId === person.id ? (
                          <Select
                            value={person.preference}
                            onValueChange={(v) => handleUpdatePerson(person.id, "preference", v)}
                            onOpenChange={(open) => !open && setEditingPersonId(null)}
                          >
                            <SelectTrigger className={preferenceIssues.some((i) => i.severity === "error") ? "border-destructive" : ""}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {preferenceOptions.map((opt) => (
                                <SelectItem key={opt} value={opt}>
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span
                            className={preferenceIssues.some((i) => i.severity === "error") ? "text-destructive font-medium" : ""}
                            onClick={() => setEditingPersonId(person.id)}
                            style={{ cursor: "pointer" }}
                            title={person._rawValues?.preference && person._rawValues.preference !== person.preference ? `Ursprünglich: ${person._rawValues.preference}` : ""}
                          >
                            {person._rawValues?.preference && !hasMapping("preference", person._rawValues.preference)
                             ? person._rawValues.preference 
                             : person.preference}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingPersonId === person.id ? (
                          <Input
                            value={person.intolerances}
                            onChange={(e) => handleUpdatePerson(person.id, "intolerances", e.target.value)}
                            onBlur={() => setEditingPersonId(null)}
                          />
                        ) : (
                          <span
                            onClick={() => setEditingPersonId(person.id)}
                            style={{ cursor: "pointer" }}
                          >
                            {person.intolerances}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          // Finde Partner aus Teams
                          const team = state.teams.find(
                            (t) => t.person1Id === person.id || t.person2Id === person.id
                          );
                          const partnerId = team
                            ? team.person1Id === person.id
                              ? team.person2Id
                              : team.person1Id
                            : null;
                          const partner = partnerId
                            ? state.persons.find((p) => p.id === partnerId)
                            : null;
                          const partnerName = partner?.name || person.partner || "-";

                          return editingPersonId === person.id ? (
                            <Input
                              value={person.partner || ""}
                              onChange={(e) => handleUpdatePerson(person.id, "partner", e.target.value || undefined)}
                              onBlur={() => setEditingPersonId(null)}
                              placeholder="Partner-Name"
                            />
                          ) : (
                            <span
                              onClick={() => setEditingPersonId(person.id)}
                              style={{ cursor: "pointer" }}
                            >
                              {partnerName}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        {editingPersonId === person.id ? (
                          <Select
                            value={person.kitchen}
                            onValueChange={(v) => handleUpdatePerson(person.id, "kitchen", v)}
                            onOpenChange={(open) => !open && setEditingPersonId(null)}
                          >
                            <SelectTrigger className={kitchenIssues.some((i) => i.severity === "error") ? "border-destructive" : ""}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {kitchenOptions.map((opt) => (
                                <SelectItem key={opt} value={opt}>
                                  {opt === "kann_gekocht_werden" ? "bei mir" : opt === "partner_kocht" ? "bei partner" : "nicht"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span
                            className={kitchenIssues.some((i) => i.severity === "error") ? "text-destructive font-medium" : ""}
                            onClick={() => setEditingPersonId(person.id)}
                            style={{ cursor: "pointer" }}
                            title={person._rawValues?.kitchen && person._rawValues.kitchen !== person.kitchen ? `Ursprünglich: ${person._rawValues.kitchen}` : ""}
                          >
                            {person._rawValues?.kitchen && !hasMapping("kitchen", person._rawValues.kitchen)
                             ? person._rawValues.kitchen 
                             : person.kitchen === "kann_gekocht_werden" ? "bei mir" : person.kitchen === "partner_kocht" ? "bei partner" : "nicht"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingPersonId === person.id ? (
                          <Input
                            value={person.kitchenAddress}
                            onChange={(e) => handleUpdatePerson(person.id, "kitchenAddress", e.target.value)}
                            onBlur={() => setEditingPersonId(null)}
                            className={kitchenAddressIssues.some((i) => i.severity === "error") ? "border-destructive" : ""}
                          />
                        ) : (
                          <span
                            className={kitchenAddressIssues.some((i) => i.severity === "error") ? "text-destructive font-medium" : ""}
                            onClick={() => setEditingPersonId(person.id)}
                            style={{ cursor: "pointer" }}
                          >
                            {person.kitchenAddress}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingPersonId === person.id ? (
                          <Select
                            value={person.coursePreference || "keine"}
                            onValueChange={(v) => handleUpdatePerson(person.id, "coursePreference", v === "keine" ? undefined : v)}
                            onOpenChange={(open) => !open && setEditingPersonId(null)}
                          >
                            <SelectTrigger className={courseIssues.some((i) => i.severity === "error") ? "border-destructive" : ""}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {courseOptions.map((opt) => (
                                <SelectItem key={opt} value={opt}>
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span
                            className={courseIssues.some((i) => i.severity === "error") ? "text-destructive font-medium" : ""}
                            onClick={() => setEditingPersonId(person.id)}
                            style={{ cursor: "pointer" }}
                            title={person._rawValues?.coursePreference && person._rawValues.coursePreference !== person.coursePreference ? `Ursprünglich: ${person._rawValues.coursePreference}` : ""}
                          >
                            {person._rawValues?.coursePreference && !hasMapping("coursePreference", person._rawValues.coursePreference)
                             ? person._rawValues.coursePreference 
                             : person.coursePreference || "-"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {errorCount === 0 ? (
            <>
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="text-sm text-muted-foreground">
                Keine Fehler gefunden. Daten können bestätigt werden.
              </span>
            </>
          ) : (
            <span className="text-sm text-destructive">
              Bitte beheben Sie die Fehler vor dem Fortfahren.
            </span>
          )}
        </div>
        <Button
          onClick={handleConfirm}
          disabled={errorCount > 0 || persons.length === 0}
        >
          Daten bestätigen und weiter
        </Button>
      </div>
    </div>
  );
}
