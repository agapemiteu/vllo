import PDFDocument from "pdfkit";
import { CASE, store } from "./caseStore.js";
import { END_WORDS } from "./guardrails.js";
import { insights } from "./insights.js";
import type { RoomId } from "./types.js";
import type { Workspace } from "./workspace.js";

/** The built-in PDF fonts only cover basic Latin: map smart punctuation, drop anything else unprintable. */
const ascii = (s: unknown) =>
  String(s ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/→/g, "->")
    .replace(/·/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ]/g, "");

const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const pretty = (v: string) => v.replace(/_/g, " ");

const INK = "#1c1917";
const MUTED = "#78716c";
const AMBER = "#b45309";
const GREEN = "#047857";

/** A per-person interview report as a PDF, built only from what was recorded. */
export function reportPdf(ws: Workspace, room: RoomId): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: "vllo interview report", Author: "vllo" } });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const person = CASE.interviewees.find((p: any) => p.id === room) ?? { name: "Unknown" };
      const r = store.rooms[room];
      const claims = store.claims.filter((c) => c.room === room);
      const conflicts = store.conflicts.filter((k) => k.rooms.includes(room) || k.claimIds.some((id) => claims.some((c) => c.id === id)));
      const facts = insights(store).facts.filter((f) => f.sources.some((id) => claims.some((c) => c.id === id)));
      const revisions = store.revisions.filter((v) => v.room === room);
      const guards = store.guardrails.filter((g) => g.room === room);
      const width = doc.page.width - 112;

      const heading = (t: string) => {
        if (doc.y > doc.page.height - 140) doc.addPage();
        doc.moveDown(1.1).font("Helvetica-Bold").fontSize(12).fillColor(MUTED).text(ascii(t).toUpperCase(), { characterSpacing: 0.6 });
        doc.moveDown(0.4).fillColor(INK);
      };
      const line = (t: string, opts: { color?: string; bold?: boolean; size?: number } = {}) => {
        if (doc.y > doc.page.height - 90) doc.addPage();
        doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(opts.size ?? 10.5).fillColor(opts.color ?? INK).text(ascii(t), { width });
      };

      // Header
      doc.font("Helvetica-Bold").fontSize(20).fillColor(INK).text("vllo", 56, 50);
      doc.font("Helvetica").fontSize(9.5).fillColor(MUTED).text(`Interview report - generated ${new Date().toUTCString()}`, 56, 56, { align: "right", width });
      doc.moveTo(56, 82).lineTo(56 + width, 82).strokeColor("#e7e5e4").stroke();

      // Person block
      const top = 100;
      const photo = ws.photos.get(room);
      let textX = 56;
      if (photo) {
        try {
          doc.image(photo, 56, top, { fit: [84, 84] });
          textX = 156;
        } catch {
          /* unreadable image: leave it out */
        }
      }
      doc.font("Helvetica-Bold").fontSize(18).fillColor(INK).text(ascii(person.name), textX, top, { width: width - (textX - 56) });
      doc.font("Helvetica").fontSize(10.5).fillColor(MUTED).text(ascii(person.relation ?? ""), { width: width - (textX - 56) });
      doc.text(ascii(`${CASE.title} - ${CASE.incident?.date ?? ""} ${CASE.incident?.time ?? ""} - ${CASE.incident?.location ?? ""}`), { width: width - (textX - 56) });
      const dur = r.startedAt ? (r.endedAt ?? Date.now()) - r.startedAt : 0;
      doc.text(ascii(`Interview length ${mmss(dur)} - ${r.status === "ENDED" ? `ended: ${END_WORDS[r.endReason ?? ""] ?? pretty(r.endReason ?? "")}` : r.status.toLowerCase()}`), { width: width - (textX - 56) });
      doc.x = 56;
      doc.y = Math.max(doc.y, top + (photo ? 92 : 0));

      // Summary
      heading("Summary");
      const open = conflicts.filter((c) => c.status === "OPEN").length;
      line(`${claims.length} statements recorded - ${conflicts.length} contradictions (${open} still open, ${conflicts.length - open} resolved) - ${facts.length} facts corroborated - ${revisions.length} statements revised`);

      heading("Contradictions");
      if (!conflicts.length) line("None found.", { color: MUTED });
      for (const k of conflicts) {
        line(`${k.status === "OPEN" ? "OPEN" : "RESOLVED"} - ${pretty(k.topic)}`, { bold: true, color: k.status === "OPEN" ? AMBER : GREEN });
        line(k.summary);
        for (const id of k.claimIds) {
          const c = store.claim(id);
          if (c) line(`   "${c.quote}" (said at ${mmss(c.saidAt)}${c.status === "REVISED" ? ", later revised" : ""})`, { color: MUTED, size: 9.5 });
        }
        for (const e of k.evidenceIds) {
          const ev = (CASE.evidence ?? []).find((x: any) => x.id === e);
          if (ev) line(`   Evidence ${ev.id}: ${ev.detail}`, { color: MUTED, size: 9.5 });
        }
        doc.moveDown(0.4);
      }

      heading("Established");
      if (!facts.length) line("Nothing corroborated yet.", { color: MUTED });
      for (const f of facts) line(`- ${f.text}${f.status === "corroborated" ? " (corroborated)" : ""}`);

      heading("What they said");
      if (!claims.length) line("No statements were recorded.", { color: MUTED });
      for (const c of claims) {
        line(`${c.time ? `${c.time}  ` : ""}${pretty(c.subject)}: ${pretty(c.value)}${c.status === "REVISED" ? "  (revised)" : ""}`, { bold: true, size: 10 });
        line(`   "${c.quote}" - said at ${mmss(c.saidAt)}`, { color: MUTED, size: 9.5 });
      }

      if (revisions.length) {
        heading("Statements that changed");
        for (const v of revisions) line(`${pretty(v.subject)}: ${pretty(v.oldValue)} -> ${pretty(v.newValue)}  ("${v.oldQuote}" -> "${v.newQuote}")`);
      }

      if (guards.length) {
        heading("Conduct and rights log");
        for (const g of guards) line(`${g.action} - ${pretty(g.rule).toLowerCase()} - ${g.detail}`, { size: 9.5 });
      }

      doc.moveDown(2);
      line("vllo reports contradictions between statements and evidence. It does not assess truthfulness, emotion or guilt. What the findings mean is for the investigator to decide.", { color: MUTED, size: 9 });
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
