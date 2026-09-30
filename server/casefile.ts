/**
 * Builds a case file from what an investigator types in: their own incident and evidence, in plain text.
 * Anything missing gets a sensible default; nothing typed in can break the engine.
 */
const clip = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const TIME = /\b([01]?\d|2[0-3])[:.h]([0-5]\d)\b/;

export function customCase(b: any): { file: any } | { error: string } {
  const title = clip(b?.title, 120);
  if (title.length < 3) return { error: "Give the case a short title." };
  const summary = clip(b?.summary, 800);
  const location = clip(b?.location, 120);
  const date = clip(b?.date, 40);
  const tm = TIME.exec(clip(b?.time, 20));
  const time = tm ? `${tm[1].padStart(2, "0")}:${tm[2]}` : "";

  const lines = String(b?.evidence ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*•\d.)]+\s*/, "").trim())
    .filter((l) => l.length >= 3)
    .slice(0, 12);
  const evidence = lines.map((line, i) => {
    const t = TIME.exec(line);
    const detail = line.slice(0, 300);
    return {
      id: `E${i + 1}`,
      type: "note",
      time: t ? `${t[1].padStart(2, "0")}:${t[2]}` : null,
      label: detail.split(/[,:;.–-]/)[0].split(" ").slice(0, 4).join(" ") || `Evidence ${i + 1}`,
      detail,
    };
  });

  const window = time
    ? (() => {
        const [h, m] = time.split(":").map(Number);
        const f = (x: number) => `${String(Math.floor(((x + 1440) % 1440) / 60)).padStart(2, "0")}:${String(((x + 1440) % 1440) % 60).padStart(2, "0")}`;
        return { start: f(h * 60 + m - 120), end: f(h * 60 + m + 120) };
      })()
    : { start: "00:00", end: "23:59" };

  return {
    file: {
      case_id: "own",
      custom: true,
      title,
      summary,
      incident: { date: date || "the day of the incident", time, location: location || "the incident location" },
      evidence,
      interviewees: [
        { id: "daniel", name: "Person 1", role: "Person of interest", relation: "Person of interest", on_file: "" },
        { id: "tunde", name: "Person 2", role: "Person of interest", relation: "Person of interest", on_file: "" },
      ],
      objectives: [
        { id: "O1", text: "Establish their movements around the time of the incident" },
        { id: "O2", text: "Account for each piece of evidence" },
        { id: "O3", text: "Establish who else was involved or present" },
      ],
      window,
      station: "",
    },
  };
}
