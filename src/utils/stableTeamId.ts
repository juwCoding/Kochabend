import type { Distribution, Team } from "@/types/models";

/**
 * Deterministische Team-ID aus zwei Personen-IDs. Reihenfolge von Person 1 / 2 ist egal.
 */
export function stableTeamId(personAId: string, personBId: string): string {
  const sorted = [personAId, personBId].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "accent", numeric: true })
  );
  return `team:${JSON.stringify(sorted)}`;
}

/**
 * Ersetzt Team-IDs durch {@link stableTeamId} und gleicht die Verteilung an.
 * Entfernt doppelte Teams mit demselben Personenpaar (behält die erste Zeile).
 */
export function normalizeTeamsAndDistribution(
  teams: Team[],
  distribution: Distribution[]
): { teams: Team[]; distribution: Distribution[] } {
  if (teams.length === 0 && distribution.length === 0) {
    return { teams, distribution };
  }

  const idMap = new Map<string, string>();
  const seenCanonical = new Set<string>();
  const newTeams: Team[] = [];

  for (const t of teams) {
    const canonical = stableTeamId(t.person1Id, t.person2Id);
    idMap.set(t.id, canonical);
    if (!seenCanonical.has(canonical)) {
      seenCanonical.add(canonical);
      newTeams.push({ ...t, id: canonical });
    }
  }

  const remap = (id: string) => idMap.get(id) ?? id;

  const newDist = distribution.map((d) => ({
    ...d,
    teamId: remap(d.teamId),
    guestRelations: d.guestRelations.map((r) => ({
      ...r,
      guestTeamId: remap(r.guestTeamId),
      hostTeamId: remap(r.hostTeamId),
    })),
  }));

  return { teams: newTeams, distribution: newDist };
}
