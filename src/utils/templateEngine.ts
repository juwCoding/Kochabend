import type { Person, Team, Distribution } from "@/types/models";
import { formatCookSnapshotUnd } from "@/utils/distributionDisplay";
import { getTeamKitchenOptions, getTeamPreference } from "@/utils/teamDerived";
import {
  formatCourseLabel,
  formatFoodPreferenceLabel,
  formatKitchenLabel,
} from "@/utils/valueResolution";

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
  addIfMapped("partner", "Gruppe"); // Rückwärtskompatibilität
  addIfMapped("partner", "Partner");
  addIfMapped("kitchen", "Küche");
  addIfMapped("coursePreference", "Gericht-Präferenz");

  // Team-/Verteilungsfelder bleiben verfügbar.
  placeholders.push(
    "TeamPartner",
    "TeamKüche",
    "TeamPräferenz",
    "KochtGang",
    "KochtKüche",
    "IsstBei1",
    "IsstBei1Gang",
    "IsstBei2",
    "IsstBei2Gang"
  );

  for (const fieldId of mappedFields) {
    if (!fieldId.startsWith("custom_")) continue;
    const fieldName = customFields[fieldId]?.trim();
    if (fieldName) placeholders.push(fieldName);
  }

  return placeholders;
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
  result = result.replace(/\{\{Name\}\}/g, person.name);
  result = result.replace(/\{\{Ernährungsform\}\}/g, formatFoodPreferenceLabel(person.preference ?? ""));
  result = result.replace(/\{\{Präferenz\}\}/g, formatFoodPreferenceLabel(person.preference ?? "")); // Rückwärtskompatibilität
  result = result.replace(/\{\{Unverträglichkeiten\}\}/g, person.intolerances || "");
  result = result.replace(/\{\{Adresse\}\}/g, person.kitchenAddress);
  // Partner: aus Team oder person.partner
  let partnerName = person.partner || "";
  if (!partnerName && team) {
    const partnerId = team.person1Id === person.id ? team.person2Id : team.person1Id;
    const partner = allPersons.find((p) => p.id === partnerId);
    partnerName = partner?.name || "";
  }
  result = result.replace(/\{\{Gruppe\}\}/g, partnerName); // Rückwärtskompatibilität
  result = result.replace(/\{\{Partner\}\}/g, partnerName);
  result = result.replace(/\{\{Küche\}\}/g, formatKitchenLabel(person.kitchen ?? ""));
  result = result.replace(/\{\{Gericht-Präferenz\}\}/g, formatCourseLabel(person.coursePreference || ""));

  // Team fields
  if (team) {
    const partnerId = team.person1Id === person.id ? team.person2Id : team.person1Id;
    const partner = allPersons.find((p) => p.id === partnerId);
    const teamKitchenLabel = getTeamKitchenOptions(team, allPersons).join(" / ");
    const teamPreference = getTeamPreference(team, allPersons);
    
    result = result.replace(/\{\{TeamPartner\}\}/g, partner?.name || "");
    result = result.replace(/\{\{TeamKüche\}\}/g, teamKitchenLabel);
    result = result.replace(/\{\{TeamPräferenz\}\}/g, formatFoodPreferenceLabel(teamPreference));
  } else {
    result = result.replace(/\{\{TeamPartner\}\}/g, "");
    result = result.replace(/\{\{TeamKüche\}\}/g, "");
    result = result.replace(/\{\{TeamPräferenz\}\}/g, "");
  }

  // Distribution fields
  if (distribution) {
    result = result.replace(/\{\{KochtGang\}\}/g, distribution.course);
    result = result.replace(/\{\{KochtKüche\}\}/g, distribution.kitchenId);

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
      result = result.replace(/\{\{IsstBei1\}\}/g, hostNames1);
      result = result.replace(/\{\{IsstBei1Gang\}\}/g, host1.course);
    } else {
      result = result.replace(/\{\{IsstBei1\}\}/g, "");
      result = result.replace(/\{\{IsstBei1Gang\}\}/g, "");
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
      result = result.replace(/\{\{IsstBei2\}\}/g, hostNames2);
      result = result.replace(/\{\{IsstBei2Gang\}\}/g, host2.course);
    } else {
      result = result.replace(/\{\{IsstBei2\}\}/g, "");
      result = result.replace(/\{\{IsstBei2Gang\}\}/g, "");
    }
  } else {
    result = result.replace(/\{\{KochtGang\}\}/g, "");
    result = result.replace(/\{\{KochtKüche\}\}/g, "");
    result = result.replace(/\{\{IsstBei1\}\}/g, "");
    result = result.replace(/\{\{IsstBei1Gang\}\}/g, "");
    result = result.replace(/\{\{IsstBei2\}\}/g, "");
    result = result.replace(/\{\{IsstBei2Gang\}\}/g, "");
  }

  const mappedFields = new Set(Object.values(columnMapping));
  for (const fieldId of mappedFields) {
    if (!fieldId.startsWith("custom_")) continue;
    const fieldName = customFields[fieldId]?.trim();
    if (!fieldName) continue;
    const value = person.customFieldValues?.[fieldId] ?? "";
    result = result.replaceAll(`{{${fieldName}}}`, value);
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

