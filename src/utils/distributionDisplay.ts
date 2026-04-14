import type { Distribution } from "@/types/models";

function formatSnapshotNames(
  snapshot: string | undefined,
  joiner: string
): string | null {
  if (!snapshot) return null;
  const parts = snapshot
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(joiner);
}

/** Anzeige wie in der Team-Liste: „Name1 + Name2“. */
export function formatCookSnapshotLine(dist: Distribution): string {
  return (
    formatSnapshotNames(dist.cookTeamNamesSnapshot, " + ") ??
    "Keine Namen gespeichert (ältere Verteilung)"
  );
}

/** Gastgeber-Paar aus Snapshot. */
export function formatGuestSnapshotLine(
  dist: Distribution,
  guestIndex: number
): string {
  const snapshots = Array.isArray(dist.guestTeamNamesSnapshots)
    ? dist.guestTeamNamesSnapshots
    : [dist.guestTeam1NamesSnapshot, dist.guestTeam2NamesSnapshot].filter(
        (value): value is string => typeof value === "string" && value.length > 0
      );
  const raw = snapshots[guestIndex - 1];
  return (
    formatSnapshotNames(raw, " + ") ??
    "Keine Namen gespeichert (ältere Verteilung)"
  );
}

/** Für Einladungstext: „Name1 und Name2“. */
export function formatCookSnapshotUnd(dist: Distribution): string | null {
  return formatSnapshotNames(dist.cookTeamNamesSnapshot, " und ");
}
