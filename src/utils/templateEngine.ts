import type { Person, Team, Distribution } from "@/types/models";

// Get all available placeholders from a person and their team/distribution data
export function getAvailablePlaceholders(): string[] {
  return [
    "Name",
    "Ernährungsform",
    "Unverträglichkeiten",
    "Adresse",
    "Gruppe", // Rückwärtskompatibilität
    "Partner",
    "Küche",
    "Gericht-Präferenz",
    "TeamPartner",
    "TeamKüche",
    "TeamPräferenz",
    "KochtGang",
    "KochtKüche",
    "IsstBei1",
    "IsstBei1Gang",
    "IsstBei2",
    "IsstBei2Gang",
  ];
}

// Replace placeholders in template
export function replacePlaceholders(
  template: string,
  person: Person,
  team: Team | undefined,
  distribution: Distribution | undefined,
  allPersons: Person[],
  allTeams: Team[]
): string {
  let result = template;

  // Basic person fields
  result = result.replace(/\{\{Name\}\}/g, person.name);
  result = result.replace(/\{\{Ernährungsform\}\}/g, person.preference ?? "");
  result = result.replace(/\{\{Präferenz\}\}/g, person.preference ?? ""); // Rückwärtskompatibilität
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
  result = result.replace(/\{\{Küche\}\}/g, person.kitchen ?? "");
  result = result.replace(/\{\{Gericht-Präferenz\}\}/g, person.coursePreference || "");

  // Team fields
  if (team) {
    const partnerId = team.person1Id === person.id ? team.person2Id : team.person1Id;
    const partner = allPersons.find((p) => p.id === partnerId);
    const teamKitchenLabel = team.secondaryKitchenId
      ? `${team.kitchenId} / ${team.secondaryKitchenId}`
      : team.kitchenId;
    
    result = result.replace(/\{\{TeamPartner\}\}/g, partner?.name || "");
    result = result.replace(/\{\{TeamKüche\}\}/g, teamKitchenLabel);
    result = result.replace(/\{\{TeamPräferenz\}\}/g, team.preference);
  } else {
    result = result.replace(/\{\{TeamPartner\}\}/g, "");
    result = result.replace(/\{\{TeamKüche\}\}/g, "");
    result = result.replace(/\{\{TeamPräferenz\}\}/g, "");
  }

  // Distribution fields
  if (distribution) {
    result = result.replace(/\{\{KochtGang\}\}/g, distribution.course);
    result = result.replace(/\{\{KochtKüche\}\}/g, distribution.kitchenId);

    // Guest relations
    if (distribution.guestRelations.length > 0) {
      const relation1 = distribution.guestRelations[0];
      const hostTeam1 = allTeams.find((t) => t.id === relation1.hostTeamId);
      const hostPerson1_1 = hostTeam1
        ? allPersons.find((p) => p.id === hostTeam1.person1Id)
        : null;
      const hostPerson1_2 = hostTeam1
        ? allPersons.find((p) => p.id === hostTeam1.person2Id)
        : null;
      const hostNames1 = hostPerson1_1 && hostPerson1_2
        ? `${hostPerson1_1.name} und ${hostPerson1_2.name}`
        : "";

      result = result.replace(/\{\{IsstBei1\}\}/g, hostNames1);
      result = result.replace(/\{\{IsstBei1Gang\}\}/g, relation1.course);
    } else {
      result = result.replace(/\{\{IsstBei1\}\}/g, "");
      result = result.replace(/\{\{IsstBei1Gang\}\}/g, "");
    }

    if (distribution.guestRelations.length > 1) {
      const relation2 = distribution.guestRelations[1];
      const hostTeam2 = allTeams.find((t) => t.id === relation2.hostTeamId);
      const hostPerson2_1 = hostTeam2
        ? allPersons.find((p) => p.id === hostTeam2.person1Id)
        : null;
      const hostPerson2_2 = hostTeam2
        ? allPersons.find((p) => p.id === hostTeam2.person2Id)
        : null;
      const hostNames2 = hostPerson2_1 && hostPerson2_2
        ? `${hostPerson2_1.name} und ${hostPerson2_2.name}`
        : "";

      result = result.replace(/\{\{IsstBei2\}\}/g, hostNames2);
      result = result.replace(/\{\{IsstBei2Gang\}\}/g, relation2.course);
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

  return result;
}

// Generate all invitations
export function generateAllInvitations(
  template: string,
  persons: Person[],
  teams: Team[],
  distributions: Distribution[]
): Record<string, string> {
  const invitations: Record<string, string> = {};

  for (const person of persons) {
    const team = teams.find(
      (t) => t.person1Id === person.id || t.person2Id === person.id
    );
    const distribution = distributions.find((d) => d.teamId === team?.id);

    invitations[person.id] = replacePlaceholders(
      template,
      person,
      team,
      distribution,
      persons,
      teams
    );
  }

  return invitations;
}

