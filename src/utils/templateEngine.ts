import type { Person, Team, Distribution } from "@/types/models";
import { getTeamPreference, getTeamPersons, hostsAtOwnKitchen } from "@/utils/teamDerived";
import {
  formatCourseLabel,
  formatFoodPreferenceLabel,
  formatKitchenLabel,
} from "@/utils/valueResolution";

const PERSON_FIELD_TOKENS: Record<string, string> = {
  name: "Name",
  preference: "Ernährungsform",
  intolerances: "Unverträglichkeiten",
  partner: "Partner",
  kitchen: "Küche",
  kitchenAddress: "Adresse",
  phoneNumber: "Telefonnummer",
  coursePreference: "Gericht-Präferenz",
};

const TEAM_PLACEHOLDER_IDS = [
  "team.Gang",
  "team.Adresse",
  "team.Ernährungsform",
  "team.Unverträglichkeiten",
  "team.Gäste",
] as const;

const GASTGEBER_SLOT_SUFFIXES = ["Gang", "Ernährungsform"] as const;

export interface GastgeberPlaceholderGroup {
  slot: string[];
  personMitKueche: string[];
  personOhneKueche: string[];
}

export interface PlaceholderGroups {
  person: string[];
  partner: string[];
  team: string[];
  gastgeber1: GastgeberPlaceholderGroup;
  gastgeber2: GastgeberPlaceholderGroup;
}

function replaceLiteralSafely(input: string, token: string, value: string): string {
  return input.split(token).join(value);
}

export function getPersonScopePlaceholderIds(
  scopePrefix: string,
  columnMapping: Record<string, string>,
  customFields: Record<string, string>
): string[] {
  const mappedFields = new Set(Object.values(columnMapping));
  const ids: string[] = [];

  for (const [fieldId, suffix] of Object.entries(PERSON_FIELD_TOKENS)) {
    if (mappedFields.has(fieldId)) {
      ids.push(`${scopePrefix}.${suffix}`);
    }
  }

  for (const fieldId of mappedFields) {
    if (!fieldId.startsWith("custom_")) continue;
    const fieldName = customFields[fieldId]?.trim();
    if (fieldName) ids.push(`${scopePrefix}.${fieldName}`);
  }

  return ids.sort((a, b) => a.localeCompare(b, "de", { sensitivity: "base" }));
}

function gastgeberSlotIds(slot: "Gastgeber1" | "Gastgeber2"): string[] {
  return GASTGEBER_SLOT_SUFFIXES.map((suffix) => `${slot}.${suffix}`);
}

export function getPlaceholderGroups(
  columnMapping: Record<string, string>,
  customFields: Record<string, string>
): PlaceholderGroups {
  return {
    person: getPersonScopePlaceholderIds("Person", columnMapping, customFields),
    partner: getPersonScopePlaceholderIds("Partner", columnMapping, customFields),
    team: [...TEAM_PLACEHOLDER_IDS],
    gastgeber1: {
      slot: gastgeberSlotIds("Gastgeber1"),
      personMitKueche: getPersonScopePlaceholderIds(
        "Gastgeber1.PersonMitKüche",
        columnMapping,
        customFields
      ),
      personOhneKueche: getPersonScopePlaceholderIds(
        "Gastgeber1.PersonOhneKüche",
        columnMapping,
        customFields
      ),
    },
    gastgeber2: {
      slot: gastgeberSlotIds("Gastgeber2"),
      personMitKueche: getPersonScopePlaceholderIds(
        "Gastgeber2.PersonMitKüche",
        columnMapping,
        customFields
      ),
      personOhneKueche: getPersonScopePlaceholderIds(
        "Gastgeber2.PersonOhneKüche",
        columnMapping,
        customFields
      ),
    },
  };
}

/** Flat list of all placeholder ids (for pruning favorites, etc.). */
export function getAllPlaceholderIds(
  columnMapping: Record<string, string>,
  customFields: Record<string, string>
): string[] {
  const groups = getPlaceholderGroups(columnMapping, customFields);
  return [
    ...groups.person,
    ...groups.partner,
    ...groups.team,
    ...groups.gastgeber1.slot,
    ...groups.gastgeber1.personMitKueche,
    ...groups.gastgeber1.personOhneKueche,
    ...groups.gastgeber2.slot,
    ...groups.gastgeber2.personMitKueche,
    ...groups.gastgeber2.personOhneKueche,
  ];
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

function resolvePersonPartnerName(
  person: Person,
  team: Team | undefined,
  allPersons: Person[]
): string {
  let partnerName = person.partner || "";
  if (!partnerName && team) {
    const partnerId = team.person1Id === person.id ? team.person2Id : team.person1Id;
    const partner = allPersons.find((p) => p.id === partnerId);
    partnerName = partner?.name || "";
  }
  return partnerName;
}

export function resolveHostTeamPersons(
  hostTeam: Team | undefined,
  kitchenId: string,
  allPersons: Person[]
): { mitKueche?: Person; ohneKueche?: Person } {
  if (!hostTeam) return {};
  const { person1, person2 } = getTeamPersons(hostTeam, allPersons);
  const normKitchen = kitchenId.trim();
  const candidates = [person1, person2].filter((p): p is Person => Boolean(p));

  let mitKueche = candidates.find(
    (p) =>
      hostsAtOwnKitchen(p.kitchen) &&
      (p.kitchenAddress?.trim() ?? "") === normKitchen &&
      normKitchen.length > 0
  );

  if (!mitKueche && candidates.length === 1) {
    mitKueche = candidates[0];
  }

  const ohneKueche = candidates.find((p) => p.id !== mitKueche?.id);
  return { mitKueche, ohneKueche };
}

function applyPersonScope(
  result: string,
  scopePrefix: string,
  person: Person | undefined,
  team: Team | undefined,
  allPersons: Person[],
  customFields: Record<string, string>,
  columnMapping: Record<string, string>
): string {
  const empty = "";
  if (!person) {
    for (const id of getPersonScopePlaceholderIds(scopePrefix, columnMapping, customFields)) {
      result = replaceLiteralSafely(result, `{{${id}}}`, empty);
    }
    return result;
  }

  const mappedFields = new Set(Object.values(columnMapping));
  const partnerName = resolvePersonPartnerName(person, team, allPersons);

  if (mappedFields.has("name")) {
    result = replaceLiteralSafely(result, `{{${scopePrefix}.Name}}`, person.name);
  }
  if (mappedFields.has("preference")) {
    result = replaceLiteralSafely(
      result,
      `{{${scopePrefix}.Ernährungsform}}`,
      formatFoodPreferenceLabel(person.preference ?? "")
    );
  }
  if (mappedFields.has("intolerances")) {
    result = replaceLiteralSafely(
      result,
      `{{${scopePrefix}.Unverträglichkeiten}}`,
      person.intolerances || ""
    );
  }
  if (mappedFields.has("partner")) {
    result = replaceLiteralSafely(result, `{{${scopePrefix}.Partner}}`, partnerName);
  }
  if (mappedFields.has("kitchen")) {
    result = replaceLiteralSafely(
      result,
      `{{${scopePrefix}.Küche}}`,
      formatKitchenLabel(person.kitchen ?? "")
    );
  }
  if (mappedFields.has("kitchenAddress")) {
    result = replaceLiteralSafely(result, `{{${scopePrefix}.Adresse}}`, person.kitchenAddress);
  }
  if (mappedFields.has("phoneNumber")) {
    result = replaceLiteralSafely(result, `{{${scopePrefix}.Telefonnummer}}`, person.phoneNumber ?? "");
  }
  if (mappedFields.has("coursePreference")) {
    result = replaceLiteralSafely(
      result,
      `{{${scopePrefix}.Gericht-Präferenz}}`,
      formatCourseLabel(person.coursePreference || "")
    );
  }

  for (const fieldId of mappedFields) {
    if (!fieldId.startsWith("custom_")) continue;
    const fieldName = customFields[fieldId]?.trim();
    if (!fieldName) continue;
    const value = person.customFieldValues?.[fieldId] ?? "";
    result = replaceLiteralSafely(result, `{{${scopePrefix}.${fieldName}}}`, value);
  }

  return result;
}

function applyGastgeberSlot(
  result: string,
  slot: "Gastgeber1" | "Gastgeber2",
  hostVisit: Distribution | undefined,
  allTeams: Team[],
  allPersons: Person[]
): string {
  const empty = "";
  if (!hostVisit) {
    for (const suffix of GASTGEBER_SLOT_SUFFIXES) {
      result = replaceLiteralSafely(result, `{{${slot}.${suffix}}}`, empty);
    }
    return result;
  }

  const hostTeam = allTeams.find((t) => t.id === hostVisit.cookTeamId);
  const hostTeamPreference = hostTeam
    ? formatFoodPreferenceLabel(getTeamPreference(hostTeam, allPersons))
    : "";

  result = replaceLiteralSafely(result, `{{${slot}.Gang}}`, hostVisit.course);
  result = replaceLiteralSafely(result, `{{${slot}.Ernährungsform}}`, hostTeamPreference);

  return result;
}

function getHostVisits(
  cookTeamId: string,
  allDistributions: Distribution[]
): Distribution[] {
  const courseOrder: Record<Distribution["course"], number> = {
    Vorspeise: 0,
    Hauptspeise: 1,
    Nachspeise: 2,
  };
  return allDistributions
    .filter((d) => getDistributionGuestTeamIds(d).includes(cookTeamId))
    .sort((a, b) => courseOrder[a.course] - courseOrder[b.course]);
}

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

  const partnerId = team
    ? team.person1Id === person.id
      ? team.person2Id
      : team.person1Id
    : undefined;
  const partnerPerson = partnerId
    ? allPersons.find((p) => p.id === partnerId)
    : undefined;

  result = applyPersonScope(
    result,
    "Person",
    person,
    team,
    allPersons,
    customFields,
    columnMapping
  );
  result = applyPersonScope(
    result,
    "Partner",
    partnerPerson,
    team,
    allPersons,
    customFields,
    columnMapping
  );

  if (distribution) {
    const cookingTeam = allTeams.find((t) => t.id === distribution.cookTeamId);
    const cookingTeamPreference = cookingTeam
      ? formatFoodPreferenceLabel(getTeamPreference(cookingTeam, allPersons))
      : "";

    result = replaceLiteralSafely(result, "{{team.Gang}}", distribution.course);
    result = replaceLiteralSafely(result, "{{team.Adresse}}", distribution.kitchenId);
    result = replaceLiteralSafely(result, "{{team.Ernährungsform}}", cookingTeamPreference);

    const cookingGuestTeamIds = getDistributionGuestTeamIds(distribution);
    const cookingGuestTeams = cookingGuestTeamIds
      .map((teamId) => allTeams.find((t) => t.id === teamId))
      .filter((entry): entry is Team => Boolean(entry));
    const kochtGaeste = cookingGuestTeams
      .map((guestTeam) => getTeamDisplayName(guestTeam, allPersons))
      .filter((name) => name.trim().length > 0)
      .join(", ");
    result = replaceLiteralSafely(result, "{{team.Gäste}}", kochtGaeste);

    const guestPersons = cookingGuestTeams.flatMap((guestTeam) => {
      const guestPerson1 = allPersons.find((p) => p.id === guestTeam.person1Id);
      const guestPerson2 = allPersons.find((p) => p.id === guestTeam.person2Id);
      return [guestPerson1, guestPerson2].filter((entry): entry is Person => Boolean(entry));
    });
    const intoleranceTexts = guestPersons
      .map((guest) => guest.intolerances?.trim() || "")
      .filter((text) => text.length > 0);
    result = replaceLiteralSafely(
      result,
      "{{team.Unverträglichkeiten}}",
      intoleranceTexts.length > 0 ? intoleranceTexts.join(", ") : "Keine Unverträglichkeiten"
    );

    const hostVisits = getHostVisits(distribution.cookTeamId, allDistributions);
    const hostSlots: Array<["Gastgeber1" | "Gastgeber2", Distribution | undefined]> = [
      ["Gastgeber1", hostVisits[0]],
      ["Gastgeber2", hostVisits[1]],
    ];

    for (const [slot, hostVisit] of hostSlots) {
      result = applyGastgeberSlot(result, slot, hostVisit, allTeams, allPersons);
      if (hostVisit) {
        const hostTeam = allTeams.find((t) => t.id === hostVisit.cookTeamId);
        const { mitKueche, ohneKueche } = resolveHostTeamPersons(
          hostTeam,
          hostVisit.kitchenId,
          allPersons
        );
        result = applyPersonScope(
          result,
          `${slot}.PersonMitKüche`,
          mitKueche,
          hostTeam,
          allPersons,
          customFields,
          columnMapping
        );
        result = applyPersonScope(
          result,
          `${slot}.PersonOhneKüche`,
          ohneKueche,
          hostTeam,
          allPersons,
          customFields,
          columnMapping
        );
      } else {
        result = applyPersonScope(
          result,
          `${slot}.PersonMitKüche`,
          undefined,
          undefined,
          allPersons,
          customFields,
          columnMapping
        );
        result = applyPersonScope(
          result,
          `${slot}.PersonOhneKüche`,
          undefined,
          undefined,
          allPersons,
          customFields,
          columnMapping
        );
      }
    }
  } else {
    for (const id of TEAM_PLACEHOLDER_IDS) {
      const value = id === "team.Unverträglichkeiten" ? "Keine Unverträglichkeiten" : "";
      result = replaceLiteralSafely(result, `{{${id}}}`, value);
    }
    for (const slot of ["Gastgeber1", "Gastgeber2"] as const) {
      result = applyGastgeberSlot(result, slot, undefined, allTeams, allPersons);
      result = applyPersonScope(
        result,
        `${slot}.PersonMitKüche`,
        undefined,
        undefined,
        allPersons,
        customFields,
        columnMapping
      );
      result = applyPersonScope(
        result,
        `${slot}.PersonOhneKüche`,
        undefined,
        undefined,
        allPersons,
        customFields,
        columnMapping
      );
    }
  }

  return result;
}

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
