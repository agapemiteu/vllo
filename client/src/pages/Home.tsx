import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Logo } from "@/components/Logo";
import { avatar } from "@/lib/utils";

const LINKS = [
  { href: "/console", title: "Investigator console", sub: "Both interviews live, shared timeline, conflicts, guardrails, report" },
  { href: "/room/daniel", title: "Interview room: Daniel O.", sub: "Former night staff at the warehouse", seed: "Daniel O." },
  { href: "/room/tunde", title: "Interview room: Tunde A.", sub: "Daniel's friend, owner of the Corolla", seed: "Tunde A." },
];

export default function Home() {
  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center px-6 py-16">
      <Logo />
      <h1 className="mt-10 text-3xl font-semibold tracking-tight">Interview everyone at once. See where the stories diverge.</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
        vllo runs one autonomous voice interviewer per person of interest, turns every spoken claim into timeline data, and checks it live against the evidence and the other interview.
      </p>
      <div className="mt-10 divide-y rounded-lg border bg-white">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} className="group flex items-center gap-4 px-4 py-4 hover:bg-stone-50">
            {l.seed ? (
              <img src={avatar(l.seed)} alt="" className="size-9 rounded-full border bg-stone-200" />
            ) : (
              <span className="flex size-9 items-center justify-center rounded-full bg-stone-900 font-mono text-[11px] text-amber-400">024</span>
            )}
            <div className="flex-1">
              <div className="text-sm font-medium">{l.title}</div>
              <div className="text-[12px] text-muted-foreground">{l.sub}</div>
            </div>
            <HugeiconsIcon icon={ArrowRight01Icon} size={16} className="text-stone-400 transition-transform group-hover:translate-x-0.5" />
          </a>
        ))}
      </div>
      <p className="mt-6 text-[12px] text-muted-foreground">Rooms need a microphone and headphones. Case 024 is synthetic.</p>
    </div>
  );
}
