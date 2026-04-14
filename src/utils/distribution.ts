import type { Team, Distribution, Course, Person } from "@/types/models";
import { getTeamKitchenOptions, getTeamPreference, getTeamCoursePreferences } from "@/utils/teamDerived";
import type { FoodPreference } from "@/types/models";

// ---------------------------------------------------------------------------
// Types local to the algorithm
// ---------------------------------------------------------------------------

type TeamInfo = {
  team: Team;
  kitchens: string[];
  coursePreferences: Course[];
  foodPreference: FoodPreference;
};

type CourseSlot = { teamId: string; course: Course; kitchenId: string };
type GuestVisit = { guestTeamId: string; hostTeamId: string; course: Course };

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const ALL_COURSES: Course[] = ["Vorspeise", "Hauptgang", "Nachspeise"];
const MAX_ATTEMPTS = 50;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function memberNamesSnapshot(
  team: Team,
  persons: Person[]
): string {
  const p1 = persons.find((p) => p.id === team.person1Id);
  const p2 = persons.find((p) => p.id === team.person2Id);
  const names = [p1?.name?.trim(), p2?.name?.trim()].filter(Boolean);
  return names.join(",");
}

/** Higher = more compatible (2 = same restriction, 1 = one flexible, 0 = mismatch). */
function dietaryScore(a: FoodPreference, b: FoodPreference): number {
  if (a === b && a !== "egal") return 2;
  if (a === "egal" || b === "egal") return 1;
  return 0;
}

/**
 * Balanced target sizes for 3 courses.
 * Remainder is distributed Vorspeise → Hauptgang → Nachspeise.
 */
function courseTargetSizes(teamCount: number): Record<Course, number> {
  const base = Math.floor(teamCount / 3);
  const rem = teamCount % 3;
  return {
    Vorspeise: base + (rem >= 1 ? 1 : 0),
    Hauptgang: base + (rem >= 2 ? 1 : 0),
    Nachspeise: base,
  };
}

function guestTeamIdsOf(dist: Distribution): string[] {
  if (Array.isArray(dist.guestTeamIds)) {
    return dist.guestTeamIds.filter((id): id is string => typeof id === "string" && id.length > 0);
  }
  return [dist.guestTeam1Id, dist.guestTeam2Id].filter(
    (id): id is string => typeof id === "string" && id.length > 0
  );
}

// ---------------------------------------------------------------------------
// Step 1 + 2 – Assign course AND kitchen in one pass
// ---------------------------------------------------------------------------

function assignCoursesAndKitchens(infos: TeamInfo[]): CourseSlot[] {
  const targets = courseTargetSizes(infos.length);
  const slots: CourseSlot[] = [];
  const remaining = new Set(infos.map((i) => i.team.id));
  const filled: Record<Course, number> = { Vorspeise: 0, Hauptgang: 0, Nachspeise: 0 };
  const kitchenUsed = new Map<string, Set<Course>>();

  function isKitchenFree(kitchenId: string, course: Course): boolean {
    return !kitchenUsed.get(kitchenId)?.has(course);
  }

  function canAssign(info: TeamInfo, course: Course): boolean {
    if (filled[course] >= targets[course]) return false;
    return info.kitchens.some((k) => isKitchenFree(k, course));
  }

  function assign(info: TeamInfo, course: Course) {
    const kitchen = info.kitchens.find((k) => isKitchenFree(k, course))!;
    if (!kitchenUsed.has(kitchen)) kitchenUsed.set(kitchen, new Set());
    kitchenUsed.get(kitchen)!.add(course);
    slots.push({ teamId: info.team.id, course, kitchenId: kitchen });
    filled[course]++;
    remaining.delete(info.team.id);
  }

  function mostRoom(courses: Course[]): Course {
    return courses.reduce((best, c) =>
      targets[c] - filled[c] > targets[best] - filled[best] ? c : best
    );
  }

  // Pass 1 – teams with exactly one feasible preferred course (most constrained)
  for (const info of shuffle([...infos])) {
    if (!remaining.has(info.team.id)) continue;
    const feasible = info.coursePreferences.filter((c) => canAssign(info, c));
    if (feasible.length === 1) assign(info, feasible[0]);
  }

  // Pass 2 – remaining teams with preferences (pick course with most room)
  for (const info of shuffle([...infos])) {
    if (!remaining.has(info.team.id)) continue;
    const feasible = info.coursePreferences.filter((c) => canAssign(info, c));
    if (feasible.length > 0) assign(info, mostRoom(feasible));
  }

  // Pass 3 – teams without preference or whose preference is full
  for (const info of shuffle([...infos])) {
    if (!remaining.has(info.team.id)) continue;
    const feasible = ALL_COURSES.filter((c) => canAssign(info, c));
    if (feasible.length === 0) {
      throw new Error(
        `Keine verfügbare Küche/Gang-Kombination für Team ${info.team.id}.`
      );
    }
    assign(info, mostRoom(feasible));
  }

  return slots;
}

// ---------------------------------------------------------------------------
// Step 3 – Guest relations
// ---------------------------------------------------------------------------

/**
 * For each course, every non-cooking team is seated at a cooking team's table.
 *
 * Host capacity is dynamic: `floor(guestCount / hostCount)` for most hosts,
 * `ceil(…)` for the remainder – so the distribution is as even as possible
 * even when the team count is not divisible by 3.
 */
function assignGuestRelations(
  slots: CourseSlot[],
  infos: TeamInfo[]
): Map<string, GuestVisit[]> {
  const infoById = new Map(infos.map((i) => [i.team.id, i]));
  const allTeamIds = infos.map((i) => i.team.id);

  const relations = new Map<string, GuestVisit[]>(
    allTeamIds.map((id) => [id, []])
  );

  // Track which teams have already met across courses (soft constraint)
  const met = new Set<string>();

  function pairKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }
  function haveMet(a: string, b: string): boolean {
    return met.has(pairKey(a, b));
  }
  function markMet(ids: string[]) {
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        met.add(pairKey(ids[i], ids[j]));
  }

  for (const course of ALL_COURSES) {
    const hosts = slots.filter((s) => s.course === course);
    const guestIds = allTeamIds.filter(
      (id) => !hosts.some((h) => h.teamId === id)
    );
    if (hosts.length === 0) continue;

    // --- dynamic capacity per host ---
    const guestCount = guestIds.length;
    const hostCount = hosts.length;
    const base = Math.floor(guestCount / hostCount);
    const extra = guestCount % hostCount;

    const hostCapacity = new Map<string, number>();
    const shuffledHosts = shuffle([...hosts]);
    for (let i = 0; i < shuffledHosts.length; i++) {
      hostCapacity.set(
        shuffledHosts[i].teamId,
        base + (i < extra ? 1 : 0)
      );
    }

    // Track who sits at which host during this course's assignment loop
    const seatedAt = new Map<string, string[]>(
      hosts.map((h) => [h.teamId, []])
    );

    // Cost for placing a guest at a host (lower = better)
    function seatCost(guestId: string, hostId: string): number {
      let cost = 0;
      const gInfo = infoById.get(guestId)!;
      const hInfo = infoById.get(hostId)!;

      // Penalise re-meeting the host
      if (haveMet(guestId, hostId)) cost += 100;

      // Penalise re-meeting other guests already seated at this host
      for (const otherId of seatedAt.get(hostId) ?? []) {
        if (haveMet(guestId, otherId)) cost += 100;
      }

      // Reward dietary compatibility with the cook
      cost -= dietaryScore(gInfo.foodPreference, hInfo.foodPreference);

      return cost;
    }

    // Assign most-constrained guests first (fewest viable hosts)
    const guestPool = shuffle([...guestIds]);
    guestPool.sort((a, b) => {
      const viableA = hosts.filter(
        (h) => (hostCapacity.get(h.teamId) ?? 0) > 0 && !haveMet(a, h.teamId)
      ).length;
      const viableB = hosts.filter(
        (h) => (hostCapacity.get(h.teamId) ?? 0) > 0 && !haveMet(b, h.teamId)
      ).length;
      return viableA - viableB;
    });

    for (const guestId of guestPool) {
      const candidates = hosts
        .filter((h) => (hostCapacity.get(h.teamId) ?? 0) > 0)
        .map((h) => ({ host: h, cost: seatCost(guestId, h.teamId) }))
        .sort((a, b) => a.cost - b.cost);

      if (candidates.length === 0) {
        throw new Error(
          `Gast-Zuordnung fehlgeschlagen: Kein freier Gastgeber für Team ${guestId} bei ${course}.`
        );
      }

      const chosen = candidates[0].host;
      hostCapacity.set(chosen.teamId, hostCapacity.get(chosen.teamId)! - 1);
      seatedAt.get(chosen.teamId)!.push(guestId);

      relations.get(guestId)!.push({
        guestTeamId: guestId,
        hostTeamId: chosen.teamId,
        course,
      });
    }

    // Mark all encounters for this course
    for (const host of hosts) {
      markMet([host.teamId, ...(seatedAt.get(host.teamId) ?? [])]);
    }
  }

  return relations;
}

// ---------------------------------------------------------------------------
// Hard-constraint validation
// ---------------------------------------------------------------------------

function validateHardConstraints(
  distribution: Distribution[],
  teamCount: number
): string[] {
  const errors: string[] = [];
  const targets = courseTargetSizes(teamCount);

  // 1) Each team cooks exactly one course
  const cookCounts = new Map<string, number>();
  for (const d of distribution) {
    cookCounts.set(d.cookTeamId, (cookCounts.get(d.cookTeamId) ?? 0) + 1);
  }
  for (const [id, count] of cookCounts) {
    if (count !== 1) errors.push(`Team ${id} kocht ${count}× statt 1×`);
  }

  // 2) Balanced course sizes
  const courseCounts: Record<Course, number> = {
    Vorspeise: 0,
    Hauptgang: 0,
    Nachspeise: 0,
  };
  for (const d of distribution) courseCounts[d.course]++;
  for (const course of ALL_COURSES) {
    if (courseCounts[course] !== targets[course]) {
      errors.push(
        `${course}: ${courseCounts[course]} Teams statt ${targets[course]}`
      );
    }
  }

  // 3) Each team eats at exactly 2 other teams
  const eatCounts = new Map<string, number>();
  for (const d of distribution) {
    for (const guestTeamId of guestTeamIdsOf(d)) {
      eatCounts.set(guestTeamId, (eatCounts.get(guestTeamId) ?? 0) + 1);
    }
  }
  for (const teamId of cookCounts.keys()) {
    if (!eatCounts.has(teamId)) eatCounts.set(teamId, 0);
  }
  for (const [id, count] of eatCounts) {
    if (count !== 2) errors.push(`Team ${id} isst bei ${count} statt 2 Teams`);
  }

  // 4) Kitchen used at most once per course
  const kitchenUse = new Map<string, Map<Course, number>>();
  for (const d of distribution) {
    if (!kitchenUse.has(d.kitchenId))
      kitchenUse.set(d.kitchenId, new Map());
    const m = kitchenUse.get(d.kitchenId)!;
    m.set(d.course, (m.get(d.course) ?? 0) + 1);
  }
  for (const [kitchenId, cm] of kitchenUse) {
    for (const [course, count] of cm) {
      if (count > 1)
        errors.push(`Küche ${kitchenId}: ${count}× bei ${course}`);
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Soft-constraint logging
// ---------------------------------------------------------------------------

function logSoftConstraintWarnings(distribution: Distribution[]): void {
  const warnings: string[] = [];

  const meetCount = new Map<string, number>();
  for (const d of distribution) {
    for (const guestTeamId of guestTeamIdsOf(d)) {
      const key = [guestTeamId, d.cookTeamId].sort().join("|");
      meetCount.set(key, (meetCount.get(key) ?? 0) + 1);
    }
  }
  let doubleMeetings = 0;
  for (const [, count] of meetCount) {
    if (count > 1) doubleMeetings++;
  }
  if (doubleMeetings > 0) {
    warnings.push(`${doubleMeetings} Doppeltreffen`);
  }

  if (warnings.length > 0) {
    console.warn("Verteilung (Soft-Constraints):", warnings);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createDistribution(
  teams: Team[],
  persons: Person[]
): Distribution[] {
  if (teams.length < 3) {
    throw new Error("Mindestens 3 Teams benötigt für die Verteilung");
  }

  const hasCoursePreferenceColumn = persons.some(
    (p) => p.coursePreference && p.coursePreference !== "keine"
  );

  const infos: TeamInfo[] = teams.map((team) => ({
    team,
    kitchens: getTeamKitchenOptions(team, persons),
    coursePreferences: getTeamCoursePreferences(
      team,
      persons,
      hasCoursePreferenceColumn
    ),
    foodPreference: getTeamPreference(team, persons),
  }));

  let lastError: string | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const slots = assignCoursesAndKitchens(infos);
      const relationsMap = assignGuestRelations(slots, infos);
      const guestsByHostAndCourse = new Map<string, string[]>();
      const keyOf = (course: Course, hostTeamId: string) => `${course}::${hostTeamId}`;

      for (const guestRelations of relationsMap.values()) {
        for (const relation of guestRelations) {
          const key = keyOf(relation.course, relation.hostTeamId);
          const currentGuests = guestsByHostAndCourse.get(key) ?? [];
          currentGuests.push(relation.guestTeamId);
          guestsByHostAndCourse.set(key, currentGuests);
        }
      }

      const distribution: Distribution[] = slots.map((slot) => {
        const team = teams.find((t) => t.id === slot.teamId)!;
        const guestsHere = guestsByHostAndCourse.get(keyOf(slot.course, slot.teamId)) ?? [];
        const guestTeam1Id = guestsHere[0];
        const guestTeam2Id = guestsHere[1];
        const guestTeamNamesSnapshots = guestsHere
          .map((guestTeamId) => teams.find((t) => t.id === guestTeamId))
          .filter((guestTeam): guestTeam is Team => !!guestTeam)
          .map((guestTeam) => memberNamesSnapshot(guestTeam, persons));
        return {
          course: slot.course,
          kitchenId: slot.kitchenId,
          cookTeamId: slot.teamId,
          guestTeamIds: guestsHere,
          guestTeam1Id,
          guestTeam2Id,
          cookTeamNamesSnapshot: memberNamesSnapshot(team, persons),
          guestTeamNamesSnapshots,
          guestTeam1NamesSnapshot: guestTeamNamesSnapshots[0],
          guestTeam2NamesSnapshot: guestTeamNamesSnapshots[1],
        };
      });

      const hardErrors = validateHardConstraints(
        distribution,
        teams.length
      );
      if (hardErrors.length === 0) {
        logSoftConstraintWarnings(distribution);
        return distribution;
      }

      lastError = hardErrors.join("; ");
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  throw new Error(
    `Keine gültige Verteilung nach ${MAX_ATTEMPTS} Versuchen gefunden. ` +
      `Letzter Fehler: ${lastError}`
  );
}
