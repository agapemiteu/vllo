import { cn } from "@/lib/utils";

export function Logo({ dark, className }: { dark?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg viewBox="0 0 32 32" className="size-6">
        <rect width="32" height="32" rx="8" fill={dark ? "#f5f5f4" : "#1c1917"} />
        <path d="M9 10l7 13 7-13" stroke="#f59e0b" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={cn("text-[17px] font-semibold tracking-tight", dark ? "text-stone-100" : "text-stone-900")}>vllo</span>
    </div>
  );
}
