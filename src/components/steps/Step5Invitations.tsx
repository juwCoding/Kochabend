import { useState, useMemo } from "react";
import { useAppState } from "@/context/AppStateContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getPlaceholderGroups,
  generateAllInvitations,
  replacePlaceholders,
  type GastgeberPlaceholderGroup,
} from "@/utils/templateEngine";
import { downloadTeamInvitationsPdf } from "@/utils/invitationPdf";
import { FileText, Download, FileDown, Star } from "lucide-react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

function sanitizeDownloadFilePart(value: string): string {
  const collapsedWhitespace = value.trim().replace(/\s+/g, "_");
  const safe = collapsedWhitespace.replace(/[^a-zA-Z0-9._-]/g, "");
  return safe.length > 0 ? safe : "person";
}

function PlaceholderRow({
  placeholderId,
  isFavorite,
  showStar,
  onInsert,
  onToggleFavorite,
}: {
  placeholderId: string;
  isFavorite: boolean;
  showStar: boolean;
  onInsert: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={onInsert}
        className="min-w-0 flex-1 justify-start truncate"
        title={placeholderId}
      >
        {`{{${placeholderId}}}`}
      </Button>
      {showStar && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 px-0"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          aria-label={isFavorite ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen"}
        >
          <Star
            className={cn(
              "h-4 w-4",
              isFavorite ? "fill-amber-400 text-amber-500" : "text-muted-foreground"
            )}
          />
        </Button>
      )}
    </div>
  );
}

function PlaceholderGrid({
  ids,
  favoritesOnly,
  favoriteSet,
  showStars,
  onInsert,
  onToggleFavorite,
}: {
  ids: string[];
  favoritesOnly: boolean;
  favoriteSet: Set<string>;
  showStars: boolean;
  onInsert: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}) {
  const visible = favoritesOnly ? ids.filter((id) => favoriteSet.has(id)) : ids;
  if (visible.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-1">
      {visible.map((id) => (
        <PlaceholderRow
          key={id}
          placeholderId={id}
          isFavorite={favoriteSet.has(id)}
          showStar={showStars}
          onInsert={() => onInsert(id)}
          onToggleFavorite={() => onToggleFavorite(id)}
        />
      ))}
    </div>
  );
}

function GastgeberSection({
  title,
  group,
  favoritesOnly,
  favoriteSet,
  showStars,
  onInsert,
  onToggleFavorite,
}: {
  title: string;
  group: GastgeberPlaceholderGroup;
  favoritesOnly: boolean;
  favoriteSet: Set<string>;
  showStars: boolean;
  onInsert: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}) {
  const hasSlot = group.slot.some((id) => !favoritesOnly || favoriteSet.has(id));
  const hasMit = group.personMitKueche.some((id) => !favoritesOnly || favoriteSet.has(id));
  const hasOhne = group.personOhneKueche.some((id) => !favoritesOnly || favoriteSet.has(id));

  if (!hasSlot && !hasMit && !hasOhne) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {hasSlot && (
        <div className="space-y-1">
          <PlaceholderGrid
            ids={group.slot}
            favoritesOnly={favoritesOnly}
            favoriteSet={favoriteSet}
            showStars={showStars}
            onInsert={onInsert}
            onToggleFavorite={onToggleFavorite}
          />
        </div>
      )}
      {hasMit && (
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">PersonMitKüche</p>
          <PlaceholderGrid
            ids={group.personMitKueche}
            favoritesOnly={favoritesOnly}
            favoriteSet={favoriteSet}
            showStars={showStars}
            onInsert={onInsert}
            onToggleFavorite={onToggleFavorite}
          />
        </div>
      )}
      {hasOhne && (
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">PersonOhneKüche</p>
          <PlaceholderGrid
            ids={group.personOhneKueche}
            favoritesOnly={favoritesOnly}
            favoriteSet={favoriteSet}
            showStars={showStars}
            onInsert={onInsert}
            onToggleFavorite={onToggleFavorite}
          />
        </div>
      )}
    </div>
  );
}

export function Step5Invitations() {
  const { state, dispatch } = useAppState();
  const [template, setTemplate] = useState(state.invitationTemplate || "");
  const [previewPersonId, setPreviewPersonId] = useState<string>("");
  const [generatedInvitations, setGeneratedInvitations] = useState<Record<string, string>>(
    state.generatedInvitations
  );
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const placeholderGroups = useMemo(
    () => getPlaceholderGroups(state.columnMapping, state.customFields),
    [state.columnMapping, state.customFields]
  );

  const favoriteSet = useMemo(
    () => new Set(state.favoritePlaceholders),
    [state.favoritePlaceholders]
  );

  const previewPerson = useMemo(() => {
    if (!previewPersonId) return null;
    return state.persons.find((p) => p.id === previewPersonId);
  }, [previewPersonId, state.persons]);

  const sortedPersons = useMemo(
    () => [...state.persons].sort((a, b) => a.name.localeCompare(b.name, "de", { sensitivity: "base" })),
    [state.persons]
  );

  const personsWithoutDistribution = useMemo(() => {
    return [...state.persons]
      .filter((person) => {
        const team = state.teams.find(
          (entry) => entry.person1Id === person.id || entry.person2Id === person.id
        );
        if (!team) return true;
        return !state.distribution.some((entry) => entry.cookTeamId === team.id);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "de", { sensitivity: "base" }));
  }, [state.persons, state.teams, state.distribution]);

  const previewText = useMemo(() => {
    if (!previewPerson) return "";

    const team = state.teams.find(
      (t) => t.person1Id === previewPerson.id || t.person2Id === previewPerson.id
    );
    const distribution = state.distribution.find((d) => d.cookTeamId === team?.id);

    return replacePlaceholders(
      template,
      previewPerson,
      team,
      distribution,
      state.distribution,
      state.persons,
      state.teams,
      state.customFields,
      state.columnMapping
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
      state.distribution,
      state.customFields,
      state.columnMapping
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
    const safeNamePart = sanitizeDownloadFilePart(person?.name || personId);
    const blob = new Blob([invitation], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `einladung_${safeNamePart}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = () => {
    downloadTeamInvitationsPdf(
      state.teams,
      state.persons,
      generatedInvitations,
      "einladungen_teams.pdf"
    );
  };

  const insertPlaceholder = (placeholderId: string) => {
    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = template.substring(0, start);
      const after = template.substring(end);
      const token = `{{${placeholderId}}}`;
      handleTemplateChange(`${before}${token}${after}`);

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + token.length, start + token.length);
      }, 0);
    } else {
      handleTemplateChange(template + `{{${placeholderId}}}`);
    }
  };

  const toggleFavorite = (placeholderId: string) => {
    dispatch({ type: "TOGGLE_FAVORITE_PLACEHOLDER", payload: placeholderId });
  };

  const showStars = !favoritesOnly;

  const scopeSections = [
    { title: "Person", ids: placeholderGroups.person },
    { title: "Partner", ids: placeholderGroups.partner },
    { title: "Team", ids: placeholderGroups.team },
  ] as const;

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
            <div className="mb-2 flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold">Verfügbare Platzhalter</h3>
              <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={favoritesOnly}
                  onChange={(e) => setFavoritesOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                Nur Favoriten
              </label>
            </div>
            <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
              {scopeSections.map(({ title, ids }) => {
                const visible = favoritesOnly ? ids.filter((id) => favoriteSet.has(id)) : ids;
                if (visible.length === 0) return null;
                return (
                  <div key={title} className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {title}
                    </p>
                    <PlaceholderGrid
                      ids={ids}
                      favoritesOnly={favoritesOnly}
                      favoriteSet={favoriteSet}
                      showStars={showStars}
                      onInsert={insertPlaceholder}
                      onToggleFavorite={toggleFavorite}
                    />
                  </div>
                );
              })}

              <GastgeberSection
                title="Gastgeber 1"
                group={placeholderGroups.gastgeber1}
                favoritesOnly={favoritesOnly}
                favoriteSet={favoriteSet}
                showStars={showStars}
                onInsert={insertPlaceholder}
                onToggleFavorite={toggleFavorite}
              />
              <GastgeberSection
                title="Gastgeber 2"
                group={placeholderGroups.gastgeber2}
                favoritesOnly={favoritesOnly}
                favoriteSet={favoriteSet}
                showStars={showStars}
                onInsert={insertPlaceholder}
                onToggleFavorite={toggleFavorite}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Vorschau für Person</label>
            <Select value={previewPersonId} onValueChange={setPreviewPersonId}>
              <SelectTrigger>
                <SelectValue placeholder="Person auswählen" />
              </SelectTrigger>
              <SelectContent>
                {sortedPersons.map((person) => (
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
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadPdf}
                  disabled={state.teams.length === 0}
                  title={state.teams.length === 0 ? "Keine Teams vorhanden" : undefined}
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  PDF
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadAll}>
                  <Download className="mr-2 h-4 w-4" />
                  Alle herunterladen
                </Button>
              </div>
            )}
          </div>

          {Object.keys(generatedInvitations).length === 0 ? (
            <div className="p-4 border rounded-md text-center text-muted-foreground">
              Klicken Sie auf &quot;Alle Einladungen generieren&quot;, um die Einladungen zu erstellen.
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
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">{invitation}</p>
                  </div>
                );
              })}
            </div>
          )}

          {personsWithoutDistribution.length > 0 && (
            <div className="rounded-md border border-amber-300/80 dark:border-amber-700/80 bg-amber-100 dark:bg-amber-950/40 px-3 py-2.5 text-sm">
              <div className="font-medium text-amber-950 dark:text-amber-100">
                Keine Einladung generiert (nicht in Verteilung)
              </div>
              <div className="mt-1 text-amber-900/90 dark:text-amber-200/95">
                {personsWithoutDistribution.map((person) => person.name).join(", ")}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
