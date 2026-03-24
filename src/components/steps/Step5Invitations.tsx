import { useState, useMemo } from "react";
import { useAppState } from "@/context/AppStateContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAvailablePlaceholders, generateAllInvitations, replacePlaceholders } from "@/utils/templateEngine";
import { FileText, Download } from "lucide-react";

// Textarea component
function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

export function Step5Invitations() {
  const { state, dispatch } = useAppState();
  const [template, setTemplate] = useState(state.invitationTemplate || "");
  const [previewPersonId, setPreviewPersonId] = useState<string>("");
  const [generatedInvitations, setGeneratedInvitations] = useState<Record<string, string>>(state.generatedInvitations);

  const availablePlaceholders = getAvailablePlaceholders();

  const previewPerson = useMemo(() => {
    if (!previewPersonId) return null;
    return state.persons.find((p) => p.id === previewPersonId);
  }, [previewPersonId, state.persons]);

  const previewText = useMemo(() => {
    if (!previewPerson) return "";
    
    const team = state.teams.find(
      (t) => t.person1Id === previewPerson.id || t.person2Id === previewPerson.id
    );
    const distribution = state.distribution.find((d) => d.teamId === team?.id);

    return replacePlaceholders(
      template,
      previewPerson,
      team,
      distribution,
      state.persons,
      state.teams
    );
  }, [template, previewPerson, state]);

  const handleTemplateChange = (newTemplate: string) => {
    setTemplate(newTemplate);
    dispatch({
      type: "SET_INVITATION_TEMPLATE",
      payload: newTemplate,
    });
  };

  const handleGenerate = () => {
    const invitations = generateAllInvitations(
      template,
      state.persons,
      state.teams,
      state.distribution
    );
    setGeneratedInvitations(invitations);
    dispatch({
      type: "SET_GENERATED_INVITATIONS",
      payload: invitations,
    });
  };

  const handleDownloadAll = () => {
    const content = Object.entries(generatedInvitations)
      .map(([personId, invitation]) => {
        const person = state.persons.find((p) => p.id === personId);
        return `=== ${person?.name || personId} ===\n\n${invitation}\n\n`;
      })
      .join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "einladungen.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadSingle = (personId: string) => {
    const invitation = generatedInvitations[personId];
    if (!invitation) return;

    const person = state.persons.find((p) => p.id === personId);
    const blob = new Blob([invitation], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `einladung_${person?.name || personId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const insertPlaceholder = (placeholder: string) => {
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = template;
      const before = text.substring(0, start);
      const after = text.substring(end);
      const newText = `${before}{{${placeholder}}}${after}`;
      handleTemplateChange(newText);
      
      // Restore cursor position
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + placeholder.length + 4, start + placeholder.length + 4);
      }, 0);
    } else {
      handleTemplateChange(template + `{{${placeholder}}}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Schritt 5: Einladungen</h2>
        <p className="text-muted-foreground">
          Erstellen Sie ein Template für die Einladungen und generieren Sie alle Einladungen.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-2">Template</h3>
            <Textarea
              value={template}
              onChange={(e) => handleTemplateChange(e.target.value)}
              placeholder="Geben Sie hier Ihr Template ein. Verwenden Sie {{Platzhalter}} für dynamische Inhalte."
              className="min-h-[300px] font-mono text-sm"
            />
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">Verfügbare Platzhalter</h3>
            <div className="grid grid-cols-2 gap-2">
              {availablePlaceholders.map((placeholder) => (
                <Button
                  key={placeholder}
                  variant="outline"
                  size="sm"
                  onClick={() => insertPlaceholder(placeholder)}
                  className="justify-start"
                >
                  {`{{${placeholder}}}`}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Vorschau für Person</label>
            <Select value={previewPersonId} onValueChange={setPreviewPersonId}>
              <SelectTrigger>
                <SelectValue placeholder="Person auswählen" />
              </SelectTrigger>
              <SelectContent>
                {state.persons.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {previewText && (
              <div className="p-4 border rounded-md bg-muted min-h-[200px] whitespace-pre-wrap">
                {previewText}
              </div>
            )}
          </div>

          <Button onClick={handleGenerate} className="w-full">
            <FileText className="mr-2 h-4 w-4" />
            Alle Einladungen generieren
          </Button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Generierte Einladungen</h3>
            {Object.keys(generatedInvitations).length > 0 && (
              <Button variant="outline" size="sm" onClick={handleDownloadAll}>
                <Download className="mr-2 h-4 w-4" />
                Alle herunterladen
              </Button>
            )}
          </div>

          {Object.keys(generatedInvitations).length === 0 ? (
            <div className="p-4 border rounded-md text-center text-muted-foreground">
              Klicken Sie auf "Alle Einladungen generieren", um die Einladungen zu erstellen.
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-auto">
              {Object.entries(generatedInvitations).map(([personId, invitation]) => {
                const person = state.persons.find((p) => p.id === personId);
                return (
                  <div key={personId} className="p-4 border rounded-md">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold">{person?.name || personId}</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownloadSingle(personId)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="text-sm whitespace-pre-wrap text-muted-foreground">
                      {invitation}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

