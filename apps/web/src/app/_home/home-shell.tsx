import type { ReactNode } from "react";
import Link from "next/link";

type HomeShellProps = {
  actions: ReactNode;
  children: ReactNode;
  identity: ReactNode;
};

export function HomeShell({ actions, children, identity }: HomeShellProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7efe2] text-[#111827]">
      <RetroTexture />
      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1260px] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">
        <header className="rounded-[1.35rem] border-[2px] border-[#111827] bg-[#fff8ed] p-5 shadow-[8px_9px_0_#0b3b73] sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <Link
                href="/"
                className="inline-flex items-end gap-2 text-[#101828] transition hover:text-[#c8272e]"
              >
                <span className="text-3xl leading-none font-black tracking-normal italic">
                  BK
                </span>
                <span className="pb-0.5 text-sm font-black tracking-normal uppercase">
                  Games
                </span>
              </Link>
              <h1 className="mt-4 text-4xl leading-none font-black tracking-normal sm:text-5xl">
                Games
              </h1>
              {identity}
            </div>

            <div className="flex flex-wrap items-center gap-3">{actions}</div>
          </div>
        </header>

        {children}
      </section>
    </main>
  );
}

function RetroTexture() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 opacity-[0.34]"
      style={{
        backgroundImage:
          "radial-gradient(circle at 1px 1px, rgba(11,59,115,0.22) 1px, transparent 0)",
        backgroundSize: "18px 18px",
      }}
    />
  );
}
