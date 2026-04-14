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
      // Keep the canonical Team shape and drop legacy/transient keys
      // (e.g. old persisted `preference`, `kitchen`, ...).
      newTeams.push({
        id: canonical,
        person1Id: t.person1Id,
        person2Id: t.person2Id,
      });
    }
  }

  const remap = (id: string) => idMap.get(id) ?? id;

  const toSnapshotString = (raw: unknown): string | undefined => {
    if (Array.isArray(raw)) {
      const parts = raw
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter(Boolean);
      return parts.length > 0 ? parts.join(",") : undefined;
    }
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    return undefined;
  };

  const hasLegacyShape = distribution.some((rawDist) => {
    const d = rawDist as unknown as Distribution & {
      teamId?: string;
      guestRelations?: unknown;
    };
    return typeof d.teamId === "string" || Array.isArray(d.guestRelations);
  });

  if (!hasLegacyShape) {
    const newDist = distribution.map((d) => ({
      ...d,
      guestTeamIds: (Array.isArray(d.guestTeamIds)
        ? d.guestTeamIds
        : [d.guestTeam1Id, d.guestTeam2Id].filter(
            (id): id is string => typeof id === "string" && id.length > 0
          )
      ).map(remap),
      cookTeamId: remap(d.cookTeamId),
      guestTeam1Id: d.guestTeam1Id ? remap(d.guestTeam1Id) : undefined,
      guestTeam2Id: d.guestTeam2Id ? remap(d.guestTeam2Id) : undefined,
    }));
    return { teams: newTeams, distribution: newDist };
  }

  const legacy = distribution as unknown as Array<{
    teamId: string;
    course: Distribution["course"];
    kitchenId: string;
    cookMemberNamesSnapshot?: unknown;
    guestRelations?: Array<{
      hostTeamId?: string;
      guestTeamId?: string;
      course?: Distribution["course"];
      hostMemberNamesSnapshot?: unknown;
    }>;
  }>;

  const cookSnapshotByTeamId = new Map<string, string>();
  for (const d of legacy) {
    const snap = toSnapshotString(d.cookMemberNamesSnapshot);
    if (snap) cookSnapshotByTeamId.set(remap(d.teamId), snap);
  }

  const guestsByHostAndCourse = new Map<
    string,
    Array<{ guestTeamId: string; guestSnapshot?: string }>
  >();
  const keyOf = (course: Distribution["course"], hostTeamId: string) =>
    `${course}::${hostTeamId}`;

  for (const d of legacy) {
    for (const relation of d.guestRelations ?? []) {
      if (!relation.course || !relation.hostTeamId || !relation.guestTeamId) continue;
      const hostTeamId = remap(relation.hostTeamId);
      const guestTeamId = remap(relation.guestTeamId);
      const key = keyOf(relation.course, hostTeamId);
      const list = guestsByHostAndCourse.get(key) ?? [];
      list.push({
        guestTeamId,
        guestSnapshot: cookSnapshotByTeamId.get(guestTeamId),
      });
      guestsByHostAndCourse.set(key, list);
    }
  }

  const newDist: Distribution[] = legacy.map((d) => {
    const cookTeamId = remap(d.teamId);
    const guests = guestsByHostAndCourse.get(keyOf(d.course, cookTeamId)) ?? [];
    const guestTeamIds = guests.map((guest) => guest.guestTeamId);
    const guestTeamNamesSnapshots = guests
      .map((guest) => guest.guestSnapshot)
      .filter((snapshot): snapshot is string => typeof snapshot === "string" && snapshot.length > 0);
    return {
      course: d.course,
      kitchenId: d.kitchenId,
      cookTeamId,
      guestTeamIds,
      guestTeam1Id: guestTeamIds[0],
      guestTeam2Id: guestTeamIds[1],
      cookTeamNamesSnapshot: toSnapshotString(d.cookMemberNamesSnapshot),
      guestTeamNamesSnapshots,
      guestTeam1NamesSnapshot: guestTeamNamesSnapshots[0],
      guestTeam2NamesSnapshot: guestTeamNamesSnapshots[1],
    };
  });

  return { teams: newTeams, distribution: newDist };
}
