import { useState, useRef, useEffect, useMemo } from "react";
import { useAppState } from "@/context/AppStateContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { parseCSVFile } from "@/utils/csvParser";
import { COLUMN_FIELDS, type ColumnField } from "@/types/models";
import { Upload, Plus, X } from "lucide-react";

const REQUIRED_FIELDS: ColumnField[] = ["name", "preference", "intolerances", "kitchen", "kitchenAddress"];

export function Step1CSVImport() {
  const { state, dispatch } = useAppState();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCustomFieldName, setNewCustomFieldName] = useState("");
  const [isCustomFieldDialogOpen, setIsCustomFieldDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use state data if available, otherwise use local state
  const previewData = state.csvRawData.length > 0 ? state.csvRawData : [];
  const hasHeader = state.hasHeader;

  // Load data from state on mount
  useEffect(() => {
    if (state.csvRawData.length > 0) {
      // Data already loaded from state
    }
  }, []);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    let nextHasHeader = hasHeader;
    if (state.csvRawData.length > 0) {
      const shouldOverride = window.confirm(
        "Es ist bereits eine CSV-Datei geladen. Wenn Sie fortfahren, werden alle bisherigen Daten überschrieben. Möchten Sie fortfahren?"
      );

      if (!shouldOverride) {
        event.target.value = "";
        return;
      }

      dispatch({ type: "RESET" });
      nextHasHeader = false;
    }

    setError(null);
    setIsProcessing(true);

    parseCSVFile(file, {
      hasHeader: false,
      onComplete: (data) => {
        dispatch({
          type: "SET_CSV_DATA",
          payload: {
            csvData: nextHasHeader && data.length > 0 ? data.slice(1) : data,
            csvRawData: data,
            hasHeader: nextHasHeader,
          },
        });
        setIsProcessing(false);
        event.target.value = "";
      },
      onError: (err) => {
        setError(err.message);
        setIsProcessing(false);
        event.target.value = "";
      },
    });
  };

  const handleHeaderToggle = (checked: boolean) => {
    if (previewData.length === 0) return;
    
    const newHasHeader = checked;
    dispatch({
      type: "SET_CSV_DATA",
      payload: {
        csvData: newHasHeader && previewData.length > 0 ? previewData.slice(1) : previewData,
        csvRawData: previewData,
        hasHeader: newHasHeader,
      },
    });
  };
  const handleColumnMappingChange = (csvColumnIndex: number, field: string) => {
    const columnKey = `column_${csvColumnIndex}`;
    const newMapping = { ...state.columnMapping };
    
    if (field === "__none__") {
      // Remove mapping if "none" is selected
      delete newMapping[columnKey];
    } else {
      newMapping[columnKey] = field;
    }
    
    dispatch({
      type: "SET_COLUMN_MAPPING",
      payload: newMapping,
    });
  };

  const getColumnMapping = (csvColumnIndex: number): string => {
    const columnKey = `column_${csvColumnIndex}`;
    const mapping = state.columnMapping[columnKey];
    return mapping || "__none__";
  };

  // Get all assigned fields (excluding current column)
  const getAssignedFields = (currentColumnIndex: number): Set<string> => {
    const assigned = new Set<string>();
    for (const [columnKey, field] of Object.entries(state.columnMapping)) {
      const columnIndex = parseInt(columnKey.replace("column_", ""));
      if (columnIndex !== currentColumnIndex && field !== "__none__") {
        assigned.add(field);
      }
    }
    return assigned;
  };

  const handleAddCustomField = () => {
    if (!newCustomFieldName.trim()) return;
    
    const fieldId = `custom_${Date.now()}`;
    dispatch({
      type: "ADD_CUSTOM_FIELD",
      payload: {
        fieldId,
        fieldName: newCustomFieldName.trim(),
      },
    });
    
    setNewCustomFieldName("");
    setIsCustomFieldDialogOpen(false);
  };

  const handleDeleteCustomField = (fieldId: string) => {
    const newCustomFields = { ...state.customFields };
    delete newCustomFields[fieldId];
    dispatch({
      type: "SET_CUSTOM_FIELDS",
      payload: newCustomFields,
    });
    
    // Remove mappings that used this custom field
    const newMapping = { ...state.columnMapping };
    for (const [columnKey, field] of Object.entries(newMapping)) {
      if (field === fieldId) {
        delete newMapping[columnKey];
      }
    }
    dispatch({
      type: "SET_COLUMN_MAPPING",
      payload: newMapping,
    });
  };

  const displayData = hasHeader && previewData.length > 0 ? previewData.slice(1) : previewData;
  const headerRow = hasHeader && previewData.length > 0 ? previewData[0] : null;
  const columnCount = previewData.length > 0 ? previewData[0].length : 0;

  // Check if all required fields are mapped
  const requiredFieldsMapped = useMemo(() => {
    const mappedFields = new Set(Object.values(state.columnMapping));
    return REQUIRED_FIELDS.every((field) => mappedFields.has(field));
  }, [state.columnMapping]);

  // Get missing required fields
  const missingRequiredFields = useMemo(() => {
    const mappedFields = new Set(Object.values(state.columnMapping));
    return REQUIRED_FIELDS.filter((field) => !mappedFields.has(field));
  }, [state.columnMapping]);

  // Get all available fields (standard + custom)
  const getAllAvailableFields = () => {
    const fields: Array<{ id: string; label: string }> = [];
    
    // Standard fields
    for (const [key, label] of Object.entries(COLUMN_FIELDS)) {
      fields.push({ id: key, label });
    }
    
    // Custom fields
    for (const [fieldId, fieldName] of Object.entries(state.customFields)) {
      fields.push({ id: fieldId, label: fieldName });
    }
    
    return fields;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Schritt 1: CSV Import</h2>
        <p className="text-muted-foreground">
          Laden Sie eine CSV-Datei hoch und wählen Sie die entsprechenden Spalten aus.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
          >
            <Upload className="mr-2 h-4 w-4" />
            CSV-Datei auswählen
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={hasHeader}
              onChange={(e) => handleHeaderToggle(e.target.checked)}
              disabled={previewData.length === 0}
            />
            <span>Erste Zeile ist Header</span>
          </label>
        </div>

        {error && (
          <div className="p-4 bg-destructive/10 text-destructive rounded-md">
            Fehler: {error}
          </div>
        )}

        {previewData.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Spalten-Mapping</h3>
                <details className="text-sm text-muted-foreground">
                  <summary className="cursor-pointer select-none">Erklärung der Felder anzeigen</summary>
                  <div className="mt-2 space-y-3">
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">Verpflichtend</p>
                      <p><strong>Name:</strong> Name der teilnehmenden Person.</p>
                      <p><strong>Ernährungsform:</strong> z. B. vegan, vegetarisch oder egal.</p>
                      <p><strong>Unverträglichkeiten:</strong> Allergien oder Unverträglichkeiten als Freitext.</p>
                      <p><strong>Küche:</strong> Gibt an, ob in der eigenen Küche gekocht werden kann, beim Partner gekocht wird oder nicht.</p>
                      <p><strong>Küchen-Adresse:</strong> Adresse der Küche, die für das Hosting verwendet wird.</p>
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">Optional</p>
                      <p><strong>Partner:</strong> Name der Partnerperson, damit ein gemeinsames Team gebildet werden kann.</p>
                      <p><strong>Gericht-Präferenz:</strong> Wunschgang (Vorspeise, Hauptgang, Nachspeise oder keine Präferenz).</p>
                      <p><strong>Freifelder:</strong> Zusätzliche CSV-Spalten ohne feste Funktion; werden als Zusatzinfos übernommen.</p>
                    </div>
                  </div>
                </details>
              </div>
              <Dialog open={isCustomFieldDialogOpen} onOpenChange={setIsCustomFieldDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Freifeld hinzufügen
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Neues Freifeld erstellen</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Feldname</label>
                      <Input
                        value={newCustomFieldName}
                        onChange={(e) => setNewCustomFieldName(e.target.value)}
                        placeholder="z.B. Notizen"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleAddCustomField();
                          }
                        }}
                      />
                    </div>
                    <DialogFooter>
                      <Button onClick={handleAddCustomField} disabled={!newCustomFieldName.trim()}>
                        Erstellen
                      </Button>
                    </DialogFooter>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {Object.keys(state.customFields).length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-sm font-semibold text-foreground">Freifelder:</span>
                {Object.entries(state.customFields).map(([fieldId, fieldName]) => (
                  <div
                    key={fieldId}
                    className="flex items-center gap-2 px-3 py-1 bg-secondary rounded-md text-sm"
                  >
                    <span>{fieldName}</span>
                    <button
                      onClick={() => handleDeleteCustomField(fieldId)}
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="border rounded-md overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {Array.from({ length: columnCount }).map((_, index) => (
                      <TableHead key={index} className="relative py-2">
                          <div className="text-xs font-medium">
                            Spalte {index + 1}
                            {headerRow && (
                              <div className="text-muted-foreground font-normal mt-1">
                                {headerRow[index]}
                              </div>
                            )}
                          </div>
                          <Select
                            value={getColumnMapping(index)}
                            onValueChange={(value) =>
                              handleColumnMappingChange(index, value)
                            }
                          >
                            <SelectTrigger className="w-full bg-background">
                              <SelectValue placeholder="Feld auswählen" />
                            </SelectTrigger>
                            <SelectContent className="bg-popover">
                              <SelectItem value="__none__">Keine Zuordnung</SelectItem>
                              {getAllAvailableFields()
                                .filter((field) => {
                                  const assigned = getAssignedFields(index);
                                  return !assigned.has(field.id) || getColumnMapping(index) === field.id;
                                })
                                .map((field) => (
                                  <SelectItem key={field.id} value={field.id}>
                                    {field.label}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayData.slice(0, 10).map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <TableCell key={cellIndex}>{cell}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {displayData.length > 10 && (
                <div className="p-2 text-sm text-muted-foreground text-center">
                  ... und {displayData.length - 10} weitere Zeilen
                </div>
              )}
            </div>

            {!requiredFieldsMapped && (
              <div className="p-4 border-2 border-orange-500 rounded-md">
                <p className="text-sm font-semibold text-foreground mb-2">
                  Noch zuordnen:
                </p>
                <div className="flex flex-wrap gap-2">
                  {missingRequiredFields.map((field) => (
                    <span
                      key={field}
                      className="px-2 py-1 rounded text-sm font-semibold border border-orange-500 text-foreground"
                    >
                      {COLUMN_FIELDS[field]}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
