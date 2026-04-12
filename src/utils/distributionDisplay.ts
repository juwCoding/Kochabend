import type { Distribution, GuestRelation } from "@/types/models";

function formatMemberPair(
  snapshot: readonly [string, string] | undefined,
  joiner: string
): string | null {
  if (!snapshot || snapshot.length < 2) return null;
  const [a, b] = snapshot;
  const parts = [a, b].map((s) => (s ?? "").trim()).filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(joiner);
}

/** Anzeige wie in der Team-Liste: „Name1 + Name2“. */
export function formatCookSnapshotLine(dist: Distribution): string {
  return (
    formatMemberPair(dist.cookMemberNamesSnapshot, " + ") ??
    "Keine Namen gespeichert (ältere Verteilung)"
  );
}

/** Gastgeber-Paar aus Snapshot. */
export function formatHostSnapshotLine(relation: GuestRelation): string {
  return (
    formatMemberPair(relation.hostMemberNamesSnapshot, " + ") ??
    "Keine Namen gespeichert (ältere Verteilung)"
  );
}

/** Für Einladungstext: „Name1 und Name2“. */
export function formatHostSnapshotUnd(relation: GuestRelation): string | null {
  return formatMemberPair(relation.hostMemberNamesSnapshot, " und ");
}
