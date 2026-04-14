import type { Person, Team, Distribution } from "@/types/models";
import { formatCookSnapshotUnd } from "@/utils/distributionDisplay";
import { getTeamPreference } from "@/utils/teamDerived";
import {
  formatCourseLabel,
  formatFoodPreferenceLabel,
  formatKitchenLabel,
} from "@/utils/valueResolution";

function replaceTokenSafely(input: string, pattern: RegExp, value: string): string {
  return input.replace(pattern, () => value);
}

function replaceLiteralSafely(input: string, token: string, value: string): string {
  return input.split(token).join(value);
}

// Get all available placeholders from a person and their team/distribution data
export function getAvailablePlaceholders(
  columnMapping: Record<string, string>,
  customFields: Record<string, string>
): string[] {
  const mappedFields = new Set(Object.values(columnMapping));
  const placeholders: string[] = [];
  const addIfMapped = (fieldId: string, placeholder: string) => {
    if (mappedFields.has(fieldId)) placeholders.push(placeholder);
  };

  addIfMapped("name", "Name");
  addIfMapped("preference", "Ernährungsform");
  addIfMapped("intolerances", "Unverträglichkeiten");
  addIfMapped("kitchenAddress", "Adresse");
  addIfMapped("partner", "Partner");
  addIfMapped("kitchen", "Küche");
  addIfMapped("coursePreference", "Gericht-Präferenz");

  // Team-/Verteilungsfelder bleiben verfügbar.
  placeholders.push(
    "TeamPartner",
    "TeamErnährungsform",
    "KochtGang",
    "KochtAdresse",
    "KochtErnährungsform",
    "KochtUnverträglichkeiten",
    "KochtGäste",
    "IsstBei1Team",
    "IsstBei1Gang",
    "IsstBei1Adresse",
    "IsstBei1Ernährungsform",
    "IsstBei2Team",
    "IsstBei2Gang",
    "IsstBei2Adresse",
    "IsstBei2Ernährungsform"
  );

  for (const fieldId of mappedFields) {
    if (!fieldId.startsWith("custom_")) continue;
    const fieldName = customFields[fieldId]?.trim();
    if (fieldName) placeholders.push(fieldName);
  }

  return placeholders;
}

function getDistributionGuestTeamIds(distribution: Distribution): string[] {
  if (Array.isArray(distribution.guestTeamIds)) return distribution.guestTeamIds;
  return [distribution.guestTeam1Id, distribution.guestTeam2Id].filter(
    (id): id is string => typeof id === "string" && id.length > 0
  );
}

function getTeamDisplayName(team: Team | undefined, allPersons: Person[]): string {
  if (!team) return "";
  const p1 = allPersons.find((p) => p.id === team.person1Id);
  const p2 = allPersons.find((p) => p.id === team.person2Id);
  if (p1?.name && p2?.name) return `${p1.name} und ${p2.name}`;
  return p1?.name || p2?.name || "";
}

// Replace placeholders in template
export function replacePlaceholders(
  template: string,
  person: Person,
  team: Team | undefined,
  distribution: Distribution | undefined,
  allDistributions: Distribution[],
  allPersons: Person[],
  allTeams: Team[],
  customFields: Record<string, string>,
  columnMapping: Record<string, string>
): string {
  let result = template;

  // Basic person fields
  result = replaceTokenSafely(result, /\{\{Name\}\}/g, person.name);
  result = replaceTokenSafely(result, /\{\{Ernährungsform\}\}/g, formatFoodPreferenceLabel(person.preference ?? ""));
  result = replaceTokenSafely(result, /\{\{Präferenz\}\}/g, formatFoodPreferenceLabel(person.preference ?? "")); // Rückwärtskompatibilität
  result = replaceTokenSafely(result, /\{\{Unverträglichkeiten\}\}/g, person.intolerances || "");
  result = replaceTokenSafely(result, /\{\{Adresse\}\}/g, person.kitchenAddress);
  // Partner: aus Team oder person.partner
  let partnerName = person.partner || "";
  if (!partnerName && team) {
    const partnerId = team.person1Id === person.id ? team.person2Id : team.person1Id;
    const partner = allPersons.find((p) => p.id === partnerId);
    partnerName = partner?.name || "";
  }
  result = replaceTokenSafely(result, /\{\{Gruppe\}\}/g, partnerName); // Rückwärtskompatibilität
  result = replaceTokenSafely(result, /\{\{Partner\}\}/g, partnerName);
  result = replaceTokenSafely(result, /\{\{Küche\}\}/g, formatKitchenLabel(person.kitchen ?? ""));
  result = replaceTokenSafely(result, /\{\{Gericht-Präferenz\}\}/g, formatCourseLabel(person.coursePreference || ""));

  // Team fields
  if (team) {
    const partnerId = team.person1Id === person.id ? team.person2Id : team.person1Id;
    const partner = allPersons.find((p) => p.id === partnerId);
    const teamPreference = getTeamPreference(team, allPersons);
    
    result = replaceTokenSafely(result, /\{\{TeamPartner\}\}/g, partner?.name || "");
    result = replaceTokenSafely(result, /\{\{TeamErnährungsform\}\}/g, formatFoodPreferenceLabel(teamPreference));
    // Rückwärtskompatibilität
    result = replaceTokenSafely(result, /\{\{TeamPräferenz\}\}/g, formatFoodPreferenceLabel(teamPreference));
  } else {
    result = replaceTokenSafely(result, /\{\{TeamPartner\}\}/g, "");
    result = replaceTokenSafely(result, /\{\{TeamErnährungsform\}\}/g, "");
    // Rückwärtskompatibilität
    result = replaceTokenSafely(result, /\{\{TeamPräferenz\}\}/g, "");
  }

  // Distribution fields
  if (distribution) {
    const cookingTeam = allTeams.find((t) => t.id === distribution.cookTeamId);
    const cookingTeamPreference = cookingTeam
      ? formatFoodPreferenceLabel(getTeamPreference(cookingTeam, allPersons))
      : "";

    result = replaceTokenSafely(result, /\{\{KochtGang\}\}/g, distribution.course);
    result = replaceTokenSafely(result, /\{\{KochtAdresse\}\}/g, distribution.kitchenId);
    result = replaceTokenSafely(result, /\{\{KochtErnährungsform\}\}/g, cookingTeamPreference);
    const cookingGuestTeamIds = getDistributionGuestTeamIds(distribution);
    const cookingGuestTeams = cookingGuestTeamIds
      .map((teamId) => allTeams.find((t) => t.id === teamId))
      .filter((entry): entry is Team => Boolean(entry));
    const kochtGaeste = cookingGuestTeams
      .map((guestTeam) => getTeamDisplayName(guestTeam, allPersons))
      .filter((name) => name.trim().length > 0)
      .join(", ");
    result = replaceTokenSafely(result, /\{\{KochtGäste\}\}/g, kochtGaeste);

    const guestPersons = cookingGuestTeams.flatMap((guestTeam) => {
      const guestPerson1 = allPersons.find((p) => p.id === guestTeam.person1Id);
      const guestPerson2 = allPersons.find((p) => p.id === guestTeam.person2Id);
      return [guestPerson1, guestPerson2].filter((entry): entry is Person => Boolean(entry));
    });
    const intoleranceEntries = guestPersons
      .map((guest) => ({ name: guest.name, intolerance: guest.intolerances?.trim() || "" }))
      .filter((entry) => entry.intolerance.length > 0)
      .map((entry) => `${entry.intolerance} (${entry.name})`);
    result = replaceTokenSafely(
      result,
      /\{\{KochtUnverträglichkeiten\}\}/g,
      intoleranceEntries.length > 0 ? intoleranceEntries.join(", ") : "Keine Unverträglichkeiten"
    );
    // Rückwärtskompatibilität
    result = replaceTokenSafely(result, /\{\{KochtKüche\}\}/g, distribution.kitchenId);

    const courseOrder: Record<Distribution["course"], number> = {
      Vorspeise: 0,
      Hauptgang: 1,
      Nachspeise: 2,
    };
    const hostVisits = allDistributions
      .filter((d) => {
        const guestTeamIds = Array.isArray(d.guestTeamIds)
          ? d.guestTeamIds
          : [d.guestTeam1Id, d.guestTeam2Id].filter(
              (id): id is string => typeof id === "string" && id.length > 0
            );
        return guestTeamIds.includes(distribution.cookTeamId);
      })
      .sort((a, b) => courseOrder[a.course] - courseOrder[b.course]);

    const host1 = hostVisits[0];
    if (host1) {
      const hostTeam1 = allTeams.find((t) => t.id === host1.cookTeamId);
      const hostPerson1_1 = hostTeam1
        ? allPersons.find((p) => p.id === hostTeam1.person1Id)
        : null;
      const hostPerson1_2 = hostTeam1
        ? allPersons.find((p) => p.id === hostTeam1.person2Id)
        : null;
      let hostNames1 =
        hostPerson1_1 && hostPerson1_2
          ? `${hostPerson1_1.name} und ${hostPerson1_2.name}`
          : "";
      if (!hostNames1) {
        const fromSnap = formatCookSnapshotUnd(host1);
        if (fromSnap) hostNames1 = fromSnap;
      }
      const hostTeamPreference1 = hostTeam1
        ? formatFoodPreferenceLabel(getTeamPreference(hostTeam1, allPersons))
        : "";
      result = replaceTokenSafely(result, /\{\{IsstBei1Team\}\}/g, hostNames1);
      result = replaceTokenSafely(result, /\{\{IsstBei1Gang\}\}/g, host1.course);
      result = replaceTokenSafely(result, /\{\{IsstBei1Adresse\}\}/g, host1.kitchenId);
      result = replaceTokenSafely(result, /\{\{IsstBei1Ernährungsform\}\}/g, hostTeamPreference1);
      // Rückwärtskompatibilität
      result = replaceTokenSafely(result, /\{\{IsstBei1\}\}/g, hostNames1);
    } else {
      result = replaceTokenSafely(result, /\{\{IsstBei1Team\}\}/g, "");
      result = replaceTokenSafely(result, /\{\{IsstBei1Gang\}\}/g, "");
      result = replaceTokenSafely(result, /\{\{IsstBei1Adresse\}\}/g, "");
      result = replaceTokenSafely(result, /\{\{IsstBei1Ernährungsform\}\}/g, "");
      // Rückwärtskompatibilität
      result = replaceTokenSafely(result, /\{\{IsstBei1\}\}/g, "");
    }

    const host2 = hostVisits[1];
    if (host2) {
      const hostTeam2 = allTeams.find((t) => t.id === host2.cookTeamId);
      const hostPerson2_1 = hostTeam2
        ? allPersons.find((p) => p.id === hostTeam2.person1Id)
        : null;
      const hostPerson2_2 = hostTeam2
        ? allPersons.find((p) => p.id === hostTeam2.person2Id)
        : null;
      let hostNames2 =
        hostPerson2_1 && hostPerson2_2
          ? `${hostPerson2_1.name} und ${hostPerson2_2.name}`
          : "";
      if (!hostNames2) {
        const fromSnap = formatCookSnapshotUnd(host2);
        if (fromSnap) hostNames2 = fromSnap;
      }
      const hostTeamPreference2 = hostTeam2
        ? formatFoodPreferenceLabel(getTeamPreference(hostTeam2, allPersons))
        : "";
      result = replaceTokenSafely(result, /\{\{IsstBei2Team\}\}/g, hostNames2);
      result = replaceTokenSafely(result, /\{\{IsstBei2Gang\}\}/g, host2.course);
      result = replaceTokenSafely(result, /\{\{IsstBei2Adresse\}\}/g, host2.kitchenId);
      result = replaceTokenSafely(result, /\{\{IsstBei2Ernährungsform\}\}/g, hostTeamPreference2);
      // Rückwärtskompatibilität
      result = replaceTokenSafely(result, /\{\{IsstBei2\}\}/g, hostNames2);
    } else {
      result = replaceTokenSafely(result, /\{\{IsstBei2Team\}\}/g, "");
      result = replaceTokenSafely(result, /\{\{IsstBei2Gang\}\}/g, "");
      result = replaceTokenSafely(result, /\{\{IsstBei2Adresse\}\}/g, "");
      result = replaceTokenSafely(result, /\{\{IsstBei2Ernährungsform\}\}/g, "");
      // Rückwärtskompatibilität
      result = replaceTokenSafely(result, /\{\{IsstBei2\}\}/g, "");
    }
  } else {
    result = replaceTokenSafely(result, /\{\{KochtGang\}\}/g, "");
    result = replaceTokenSafely(result, /\{\{KochtAdresse\}\}/g, "");
    result = replaceTokenSafely(result, /\{\{KochtErnährungsform\}\}/g, "");
    result = replaceTokenSafely(result, /\{\{KochtUnverträglichkeiten\}\}/g, "Keine Unverträglichkeiten");
    result = replaceTokenSafely(result, /\{\{KochtGäste\}\}/g, "");
    result = replaceTokenSafely(result, /\{\{IsstBei1Team\}\}/g, "");
    result = replaceTokenSafely(result, /\{\{KochtKüche\}\}/g, "");
    result = replaceTokenSafely(result, /\{\{IsstBei1Gang\}\}/g, "");
    result = replaceTokenSafely(result, /\{\{IsstBei1Adresse\}\}/g, "");
    result = replaceTokenSafely(result, /\{\{IsstBei1Ernährungsform\}\}/g, "");
    result = replaceTokenSafely(result, /\{\{IsstBei2Team\}\}/g, "");
    result = replaceTokenSafely(result, /\{\{IsstBei2Gang\}\}/g, "");
    result = replaceTokenSafely(result, /\{\{IsstBei2Adresse\}\}/g, "");
    result = replaceTokenSafely(result, /\{\{IsstBei2Ernährungsform\}\}/g, "");
    // Rückwärtskompatibilität
    result = replaceTokenSafely(result, /\{\{IsstBei1\}\}/g, "");
    result = replaceTokenSafely(result, /\{\{IsstBei2\}\}/g, "");
  }

  const mappedFields = new Set(Object.values(columnMapping));
  for (const fieldId of mappedFields) {
    if (!fieldId.startsWith("custom_")) continue;
    const fieldName = customFields[fieldId]?.trim();
    if (!fieldName) continue;
    const value = person.customFieldValues?.[fieldId] ?? "";
    result = replaceLiteralSafely(result, `{{${fieldName}}}`, value);
  }

  return result;
}

// Generate all invitations
export function generateAllInvitations(
  template: string,
  persons: Person[],
  teams: Team[],
  distributions: Distribution[],
  customFields: Record<string, string>,
  columnMapping: Record<string, string>
): Record<string, string> {
  const invitations: Record<string, string> = {};

  for (const person of persons) {
    const team = teams.find(
      (t) => t.person1Id === person.id || t.person2Id === person.id
    );
    const distribution = distributions.find((d) => d.cookTeamId === team?.id);
    if (!distribution) continue;

    invitations[person.id] = replacePlaceholders(
      template,
      person,
      team,
      distribution,
      distributions,
      persons,
      teams,
      customFields,
      columnMapping
    );
  }

  return invitations;
}

