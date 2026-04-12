import type { Team, Distribution, Course, Kitchen, Person } from "@/types/models";
import { getTeamKitchenOptions, getTeamPreference } from "@/utils/teamDerived";

// Get kitchens from teams
function getKitchensFromTeams(teams: Team[], persons: Person[]): Map<string, Kitchen> {
  const kitchenMap = new Map<string, Kitchen>();
  
  for (const team of teams) {
    const teamKitchenIds = getTeamKitchenOptions(team, persons);
    for (const kitchenId of teamKitchenIds) {
      if (!kitchenMap.has(kitchenId)) {
        const person = persons.find((p) => p.kitchenAddress === kitchenId);
        if (person) {
          kitchenMap.set(kitchenId, {
            id: kitchenId,
            address: kitchenId,
            capacity: 1,
            availableSlots: ["Vorspeise", "Hauptgang", "Nachspeise"],
          });
        }
      }
    }
  }
  
  return kitchenMap;
}


// Check if teams already meet (bidirectional check)
function teamsAlreadyMeet(
  team1Id: string,
  team2Id: string,
  distribution: Distribution[]
): boolean {
  for (const dist of distribution) {
    for (const relation of dist.guestRelations || []) {
      const pair = [relation.guestTeamId, relation.hostTeamId].sort();
      const checkPair = [team1Id, team2Id].sort();
      if (pair[0] === checkPair[0] && pair[1] === checkPair[1]) {
        return true;
      }
    }
  }
  return false;
}

// Check if kitchen is available for a course
function isKitchenAvailable(
  kitchenId: string,
  course: Course,
  distribution: Distribution[]
): boolean {
  // Count how many teams are using this kitchen for this course
  const usageCount = distribution.filter(
    (d) => d.kitchenId === kitchenId && d.course === course
  ).length;
  
  // Kitchen capacity is 1 per time slot
  return usageCount < 1;
}

function cookMemberNamesSnapshot(
  team: Team,
  persons: Person[]
): readonly [string, string] {
  const p1 = persons.find((p) => p.id === team.person1Id);
  const p2 = persons.find((p) => p.id === team.person2Id);
  return [p1?.name?.trim() || "Unbekannt", p2?.name?.trim() || "Unbekannt"] as const;
}

// Calculate preference match score (higher is better)
function calculatePreferenceMatchWithPersons(team1: Team, team2: Team, persons: Person[]): number {
  const pref1 = getTeamPreference(team1, persons);
  const pref2 = getTeamPreference(team2, persons);
  if (pref1 === pref2 && pref1 !== "egal") {
    return 2; // Both vegan or both vegetarian
  }
  if (pref1 === "egal" || pref2 === "egal") {
    return 1; // One is flexible
  }
  return 0; // Mismatch (vegan + vegetarian)
}

// Main distribution algorithm
export function createDistribution(
  teams: Team[],
  persons: Person[]
): Distribution[] {
  if (teams.length < 3) {
    throw new Error("Mindestens 3 Teams benötigt für die Verteilung");
  }

  const kitchens = getKitchensFromTeams(teams, persons);
  const courses: Course[] = ["Vorspeise", "Hauptgang", "Nachspeise"];
  const distribution: Distribution[] = [];
  
  // Step 1: Assign each team a course to cook
  // Try to balance courses and match preferences
  
  // Shuffle teams for random assignment
  const shuffledTeams = [...teams].sort(() => Math.random() - 0.5);
  
  // Assign courses to teams
  const courseAssignments: Array<{ team: Team; course: Course }> = [];
  
  for (let i = 0; i < shuffledTeams.length; i++) {
    const team = shuffledTeams[i];
    const course = courses[i % courses.length];
    courseAssignments.push({ team, course });
  }
  
  // Step 2: Assign kitchens to teams for their courses
  for (const { team, course } of courseAssignments) {
    // Find available kitchen for this team and course
    let assignedKitchen: string | null = null;
    const preferredKitchenIds = getTeamKitchenOptions(team, persons);
    
    // Prefer team's own kitchens (primary first, then secondary)
    for (const preferredKitchenId of preferredKitchenIds) {
      if (isKitchenAvailable(preferredKitchenId, course, distribution)) {
        assignedKitchen = preferredKitchenId;
        break;
      }
    }

    if (!assignedKitchen) {
      // Find another available kitchen
      for (const [kitchenId] of kitchens) {
        if (isKitchenAvailable(kitchenId, course, distribution)) {
          assignedKitchen = kitchenId;
          break;
        }
      }
    }
    
    if (!assignedKitchen) {
      throw new Error(`Keine verfügbare Küche für Team ${team.id} und Gang ${course}`);
    }
    
    distribution.push({
      teamId: team.id,
      course,
      kitchenId: assignedKitchen,
      guestRelations: [], // Will be filled in next step
      cookMemberNamesSnapshot: cookMemberNamesSnapshot(team, persons),
    });
  }
  
  // Step 3: Assign guest relations (each team eats at 2 other teams)
  for (const dist of distribution) {
    const team = teams.find((t) => t.id === dist.teamId)!;
    const guestRelations: Distribution["guestRelations"] = [];
    
    // Find 2 other teams where this team can eat
    // Prefer teams with matching preferences
    // We need to check against already assigned guest relations
    const alreadyAssignedRelations: Distribution["guestRelations"] = [];
    for (const d of distribution) {
      if (d.guestRelations) {
        alreadyAssignedRelations.push(...d.guestRelations);
      }
    }
    
    const availableTeams = teams.filter((t) => {
      if (t.id === team.id) return false;
      // Check if teams already meet in already assigned relations
      return !teamsAlreadyMeet(team.id, t.id, distribution);
    });
    
    // Sort by preference match
    availableTeams.sort((a, b) => {
      const scoreA = calculatePreferenceMatchWithPersons(team, a, persons);
      const scoreB = calculatePreferenceMatchWithPersons(team, b, persons);
      return scoreB - scoreA;
    });
    
    // Assign to 2 teams, ensuring different courses
    const assignedCourses = new Set<Course>();
    for (const otherTeam of availableTeams) {
      if (guestRelations.length >= 2) break;
      
      const otherDist = distribution.find((d) => d.teamId === otherTeam.id);
      if (!otherDist) continue;
      
      // Ensure different courses
      if (!assignedCourses.has(otherDist.course)) {
        guestRelations.push({
          guestTeamId: team.id,
          hostTeamId: otherTeam.id,
          course: otherDist.course,
          hostMemberNamesSnapshot: cookMemberNamesSnapshot(otherTeam, persons),
        });
        assignedCourses.add(otherDist.course);
      }
    }
    
    // If we couldn't find 2 different courses, fill with any available
    while (guestRelations.length < 2 && availableTeams.length > 0) {
      const otherTeam = availableTeams.shift();
      if (!otherTeam) break;
      
      const otherDist = distribution.find((d) => d.teamId === otherTeam.id);
      if (!otherDist) continue;
      
      // Check if this relation already exists
      const exists = guestRelations.some(
        (r) => r.hostTeamId === otherTeam.id
      );
      
      if (!exists) {
        guestRelations.push({
          guestTeamId: team.id,
          hostTeamId: otherTeam.id,
          course: otherDist.course,
          hostMemberNamesSnapshot: cookMemberNamesSnapshot(otherTeam, persons),
        });
      }
    }
    
    if (guestRelations.length < 2) {
      console.warn(`Team ${team.id} konnte nicht bei 2 anderen Teams zugeordnet werden`);
    }
    
    dist.guestRelations = guestRelations;
  }
  
  // Step 4: Validate constraints
  validateDistribution(distribution);
  
  return distribution;
}

// Validate distribution constraints
function validateDistribution(distribution: Distribution[]): void {
  const errors: string[] = [];
  
  // Check: Each team cooks exactly one course
  const teamCourseCount = new Map<string, number>();
  for (const dist of distribution) {
    teamCourseCount.set(dist.teamId, (teamCourseCount.get(dist.teamId) || 0) + 1);
  }
  for (const [teamId, count] of teamCourseCount) {
    if (count !== 1) {
      errors.push(`Team ${teamId} kocht ${count} Gänge (sollte 1 sein)`);
    }
  }
  
  // Check: Each team eats at exactly 2 other teams
  for (const dist of distribution) {
    if (dist.guestRelations.length !== 2) {
      errors.push(`Team ${dist.teamId} isst bei ${dist.guestRelations.length} Teams (sollte 2 sein)`);
    }
  }
  
  // Check: Teams only meet once
  const meetingCount = new Map<string, number>();
  for (const dist of distribution) {
    for (const relation of dist.guestRelations) {
      const key = [relation.guestTeamId, relation.hostTeamId].sort().join("-");
      meetingCount.set(key, (meetingCount.get(key) || 0) + 1);
    }
  }
  for (const [key, count] of meetingCount) {
    if (count > 1) {
      errors.push(`Teams ${key} treffen sich ${count} mal (sollte max. 1 sein)`);
    }
  }
  
  // Check: Kitchen capacity (1 per time slot)
  const kitchenUsage = new Map<string, Map<Course, number>>();
  for (const dist of distribution) {
    if (!kitchenUsage.has(dist.kitchenId)) {
      kitchenUsage.set(dist.kitchenId, new Map());
    }
    const courseMap = kitchenUsage.get(dist.kitchenId)!;
    courseMap.set(dist.course, (courseMap.get(dist.course) || 0) + 1);
  }
  for (const [kitchenId, courseMap] of kitchenUsage) {
    for (const [course, count] of courseMap) {
      if (count > 1) {
        errors.push(`Küche ${kitchenId} wird ${count} mal für ${course} genutzt (sollte max. 1 sein)`);
      }
    }
  }
  
  if (errors.length > 0) {
    console.warn("Validierungsfehler:", errors);
    // Don't throw, just warn - allow manual fixes
  }
}

