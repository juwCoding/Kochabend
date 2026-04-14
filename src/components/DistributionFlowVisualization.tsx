import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Course, Distribution, Person, Team } from "@/types/models";
import { getTeamPreference } from "@/utils/teamDerived";
import { cn } from "@/lib/utils";

const COURSE_ORDER: Course[] = ["Vorspeise", "Hauptgang", "Nachspeise"];

const COURSE_LABEL: Record<Course, string> = {
  Vorspeise: "Vorspeise",
  Hauptgang: "Hauptgang",
  Nachspeise: "Nachspeise",
};

type MealBubble = {
  bubbleId: string;
  hostTeamId: string;
  guestTeamIds: string[];
  kitchenId: string;
  mealPreference: string;
};

function aggregateMealPreference(preferences: string[]): string {
  if (preferences.some((preference) => preference === "vegan")) return "vegan";
  if (preferences.some((preference) => preference === "vegetarisch")) return "vegetarisch";
  return "egal";
}

function buildMealsByCourse(
  distribution: Distribution[],
  teamPreferenceById: Map<string, string>
): Record<Course, MealBubble[]> {
  const byCourse: Record<Course, MealBubble[]> = {
    Vorspeise: [],
    Hauptgang: [],
    Nachspeise: [],
  };

  for (const course of COURSE_ORDER) {
    const hosts = distribution.filter((d) => d.course === course);
    const preferredHosts = new Map<string, string[]>();
    for (const host of hosts) {
      const guestTeamIds = Array.isArray(host.guestTeamIds)
        ? host.guestTeamIds
        : [host.guestTeam1Id, host.guestTeam2Id].filter(
            (id): id is string => typeof id === "string" && id.length > 0
          );
      preferredHosts.set(
        host.cookTeamId,
        guestTeamIds
      );
    }

    for (let hi = 0; hi < hosts.length; hi++) {
      const host = hosts[hi];
      const bubbleId = `${host.cookTeamId}-${course}-${hi}`;
      const guestTeamIds = preferredHosts.get(host.cookTeamId) ?? [];
      const mealPreference = aggregateMealPreference([
        teamPreferenceById.get(host.cookTeamId) ?? "egal",
        ...guestTeamIds.map((guestTeamId) => teamPreferenceById.get(guestTeamId) ?? "egal"),
      ]);
      byCourse[course].push({
        bubbleId,
        hostTeamId: host.cookTeamId,
        guestTeamIds,
        kitchenId: host.kitchenId,
        mealPreference,
      });
    }
  }

  return byCourse;
}

function teamHue(teamId: string): number {
  let h = 0;
  for (let i = 0; i < teamId.length; i++) {
    h = (h * 31 + teamId.charCodeAt(i)) % 360;
  }
  return h;
}

function collectTeamIds(distribution: Distribution[]): string[] {
  const s = new Set(distribution.map((d) => d.cookTeamId));
  for (const d of distribution) {
    const guestTeamIds = Array.isArray(d.guestTeamIds)
      ? d.guestTeamIds
      : [d.guestTeam1Id, d.guestTeam2Id].filter(
          (id): id is string => typeof id === "string" && id.length > 0
        );
    for (const guestTeamId of guestTeamIds) s.add(guestTeamId);
  }
  return [...s];
}

function collectEdgeMids(
  registry: Map<string, HTMLElement>,
  teamId: string,
  course: Course,
  containerRect: DOMRect,
  edge: "left" | "right"
): { x: number; y: number } | null {
  const prefix = `${teamId}|${course}|`;
  const pts: { x: number; y: number }[] = [];
  registry.forEach((el, key) => {
    if (!key.startsWith(prefix)) return;
    const r = el.getBoundingClientRect();
    pts.push({
      x: edge === "left" ? r.left - containerRect.left : r.right - containerRect.left,
      y: r.top + r.height / 2 - containerRect.top,
    });
  });
  if (pts.length === 0) return null;
  const sx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const sy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  return { x: sx, y: sy };
}

function cubicBetween(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const mx = (a.x + b.x) / 2;
  const c1x = a.x + (mx - a.x) * 0.55;
  const c2x = b.x - (b.x - mx) * 0.55;
  return `M ${a.x} ${a.y} C ${c1x} ${a.y}, ${c2x} ${b.y}, ${b.x} ${b.y}`;
}

export function DistributionFlowVisualization({
  distribution,
  teams,
  persons,
}: {
  distribution: Distribution[];
  teams: Team[];
  persons: Person[];
}) {
  const [hoveredTeamId, setHoveredTeamId] = useState<string | null>(null);
  const [paths, setPaths] = useState<
    { key: string; teamId: string; d: string; hue: number; dim: boolean }[]
  >([]);
  const [layoutSeq, setLayoutSeq] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const registryRef = useRef<Map<string, HTMLElement>>(new Map());
  const rafRef = useRef<number>(0);

  const scheduleLayout = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      setLayoutSeq((n) => n + 1);
    });
  }, []);

  const setNode = useCallback(
    (key: string, el: HTMLElement | null) => {
      const m = registryRef.current;
      if (el) m.set(key, el);
      else m.delete(key);
      scheduleLayout();
    },
    [scheduleLayout]
  );

  const teamPreferenceById = useMemo(() => {
    const byId = new Map<string, string>();
    for (const team of teams) {
      byId.set(team.id, getTeamPreference(team, persons));
    }
    return byId;
  }, [teams, persons]);

  const mealsByCourse = useMemo(
    () => buildMealsByCourse(distribution, teamPreferenceById),
    [distribution, teamPreferenceById]
  );
  const distByTeam = useMemo(() => {
    const m = new Map<string, Distribution>();
    for (const d of distribution) m.set(d.cookTeamId, d);
    return m;
  }, [distribution]);

  const allTeamIds = useMemo(() => collectTeamIds(distribution), [distribution]);

  const resolveLabel = useCallback(
    (teamId: string) => {
      const team = teams.find((t) => t.id === teamId);
      if (team) {
        const p1 = persons.find((p) => p.id === team.person1Id);
        const p2 = persons.find((p) => p.id === team.person2Id);
        const line = [p1?.name, p2?.name].filter(Boolean).join(" + ");
        if (line) return line;
      }
      const d = distByTeam.get(teamId);
      const snapshotNames = d?.cookTeamNamesSnapshot
        ?.split(",")
        .map((name) => name.trim())
        .filter(Boolean);
      if (snapshotNames && snapshotNames.length > 0) return snapshotNames.join(" + ");
      return teamId;
    },
    [distByTeam, teams, persons]
  );

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || distribution.length === 0) {
      setPaths([]);
      return;
    }

    const cr = el.getBoundingClientRect();
    if (cr.width < 8 || cr.height < 8) {
      setPaths([]);
      return;
    }

    const result: { key: string; teamId: string; d: string; hue: number; dim: boolean }[] = [];

    for (const teamId of allTeamIds) {
      const reg = registryRef.current;
      const vR = collectEdgeMids(reg, teamId, "Vorspeise", cr, "right");
      const hL = collectEdgeMids(reg, teamId, "Hauptgang", cr, "left");
      const hR = collectEdgeMids(reg, teamId, "Hauptgang", cr, "right");
      const nL = collectEdgeMids(reg, teamId, "Nachspeise", cr, "left");

      const hue = teamHue(teamId);
      const dim = hoveredTeamId !== null && hoveredTeamId !== teamId;

      if (vR && hL) {
        result.push({
          key: `${teamId}-vorspeise-hauptgang`,
          teamId,
          d: cubicBetween(vR, hL),
          hue,
          dim,
        });
      }
      if (hR && nL) {
        result.push({
          key: `${teamId}-hauptgang-nachspeise`,
          teamId,
          d: cubicBetween(hR, nL),
          hue,
          dim,
        });
      }
    }

    setPaths(result);
  }, [allTeamIds, distribution.length, hoveredTeamId, layoutSeq]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => scheduleLayout());
    ro.observe(el);
    window.addEventListener("resize", scheduleLayout);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", scheduleLayout);
    };
  }, [scheduleLayout]);

  return (
    <div
      ref={containerRef}
      className="relative rounded-2xl border bg-linear-to-b from-muted/40 via-background to-muted/20 p-4 md:p-6 overflow-hidden"
    >
      <div className="relative z-10 grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-6">
        {COURSE_ORDER.map((course) => (
          <div key={course} className="flex flex-col gap-3">
            <div className="text-center">
              <h4 className="text-lg font-semibold tracking-tight">{COURSE_LABEL[course]}</h4>
              <p className="text-xs text-muted-foreground">
                {mealsByCourse[course].length}{" "}
                {mealsByCourse[course].length === 1 ? "Runde" : "Runden"}
              </p>
            </div>

            <div className="flex flex-col gap-5">
              {mealsByCourse[course].map((meal) => (
                <div
                  key={meal.bubbleId}
                  className="rounded-[1.75rem] border-2 border-primary/20 bg-card/85 p-3 shadow-md backdrop-blur-md sm:p-4 dark:border-primary/30 dark:bg-card/55"
                >
                  <p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Beisammen
                  </p>
                  <div className="flex w-full flex-col items-stretch gap-2">
                    <FlowTeamChip
                      nodeKey={`${meal.hostTeamId}|${course}|${meal.bubbleId}|host`}
                      teamId={meal.hostTeamId}
                      role="kocht"
                      preference={teamPreferenceById.get(meal.hostTeamId) ?? "egal"}
                      label={resolveLabel(meal.hostTeamId)}
                      teams={teams}
                      hoveredTeamId={hoveredTeamId}
                      setHoveredTeamId={setHoveredTeamId}
                      setNode={setNode}
                    />
                    {meal.guestTeamIds.map((gid) => (
                      <FlowTeamChip
                        key={`${meal.bubbleId}-g-${gid}`}
                        nodeKey={`${gid}|${course}|${meal.bubbleId}|gast`}
                        teamId={gid}
                        role="Gast"
                        preference={teamPreferenceById.get(gid) ?? "egal"}
                        label={resolveLabel(gid)}
                        teams={teams}
                        hoveredTeamId={hoveredTeamId}
                        setHoveredTeamId={setHoveredTeamId}
                        setNode={setNode}
                      />
                    ))}
                  </div>
                  <p className="mt-3 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {meal.mealPreference}
                  </p>
                  <p className="mt-1 line-clamp-2 text-center text-[10px] leading-relaxed text-muted-foreground">
                    {meal.kitchenId}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <svg
        className="pointer-events-none absolute inset-0 z-30 h-full w-full overflow-visible"
        aria-hidden
      >
        {paths.map(({ key, teamId, d, hue, dim }) => (
          <path
            key={key}
            d={d}
            fill="none"
            stroke={`hsl(${hue} 62% ${dim ? "50%" : hoveredTeamId === teamId ? "48%" : "46%"})`}
            strokeWidth={hoveredTeamId === teamId ? 3.4 : dim ? 1.2 : 2.1}
            strokeOpacity={dim ? 0.2 : hoveredTeamId === teamId ? 0.92 : 0.5}
            strokeLinecap="round"
            className="transition-all duration-200"
          />
        ))}
      </svg>
    </div>
  );
}

function FlowTeamChip({
  nodeKey,
  teamId,
  role,
  preference,
  label,
  teams,
  hoveredTeamId,
  setHoveredTeamId,
  setNode,
}: {
  nodeKey: string;
  teamId: string;
  role: "kocht" | "Gast";
  preference: string;
  label: string;
  teams: Team[];
  hoveredTeamId: string | null;
  setHoveredTeamId: (id: string | null) => void;
  setNode: (key: string, el: HTMLElement | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const team = teams.find((t) => t.id === teamId);
  const missing = !team;

  useLayoutEffect(() => {
    const el = ref.current;
    setNode(nodeKey, el);
    return () => setNode(nodeKey, null);
  }, [nodeKey, setNode, label, missing, teamId]);

  const active = hoveredTeamId === teamId;
  const fadeOthers = hoveredTeamId !== null && !active;

  return (
    <div
      ref={ref}
      className={cn(
        "w-full min-w-0 cursor-default rounded-2xl border px-3 py-2.5 text-left text-sm shadow-sm transition-all duration-200",
        role === "kocht"
          ? "border-primary/45 bg-primary/12 dark:bg-primary/18"
          : "border-border/80 bg-background/95 dark:bg-background/75",
        missing && "border-amber-400/55 bg-amber-100/85 dark:bg-amber-950/45",
        active && "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg",
        fadeOthers && !active && "opacity-35"
      )}
      onMouseEnter={() => setHoveredTeamId(teamId)}
      onMouseLeave={() => setHoveredTeamId(null)}
    >
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {role} - {preference}
      </div>
      <div className="mt-1 line-clamp-3 font-medium leading-snug">{label}</div>
      {missing && (
        <div className="mt-1.5 text-[10px] text-amber-900 dark:text-amber-100/90">
          Nicht in Schritt 3
        </div>
      )}
    </div>
  );
}
