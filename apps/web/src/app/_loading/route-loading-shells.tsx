type GameTableLoadingShellProps = {
  accent: "blue" | "red";
  label: string;
};

const pulse = "animate-pulse motion-reduce:animate-none";

export function HomeLoadingShell() {
  return (
    <LoadingFrame className="bg-[#f7efe2] text-[#111827]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1260px] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">
        <section className="rounded-[1.35rem] border-2 border-[#111827] bg-[#fff8ed] p-5 shadow-[8px_9px_0_#0b3b73] sm:p-6">
          <div className="flex items-center justify-between gap-6">
            <div className="space-y-4">
              <SkeletonBlock className="h-6 w-28 bg-[#0b3b73]/20" />
              <SkeletonBlock className="h-11 w-44 bg-[#111827]/20" />
              <SkeletonBlock className="h-4 w-72 max-w-full bg-[#4b5874]/20" />
            </div>
            <SkeletonBlock className="hidden h-11 w-28 bg-[#0b3b73]/25 sm:block" />
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.35rem] border-2 border-[#111827] bg-[#0b3b73] shadow-[8px_9px_0_#c8272e]">
          <div className="space-y-3 border-b border-white/15 p-5 sm:p-6">
            <SkeletonBlock className="h-8 w-52 bg-white/20" />
            <SkeletonBlock className="h-4 w-full max-w-xl bg-white/10" />
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <SkeletonBlock className="h-32 bg-white/10" />
            <SkeletonBlock className="h-32 bg-white/10" />
          </div>
        </section>

        <section className="rounded-[1.35rem] border-2 border-[#111827] bg-[#fff8ed] p-5 shadow-[8px_9px_0_#0b3b73] sm:p-6">
          <SkeletonBlock className="h-9 w-32 bg-[#111827]/20" />
          <div className="mt-6 grid gap-5 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div
                className="overflow-hidden rounded-[1.25rem] border-2 border-[#111827] bg-[#fffaf0]"
                key={index}
              >
                <SkeletonBlock className="h-44 rounded-none bg-[#0b3b73]/20" />
                <div className="space-y-4 p-5">
                  <SkeletonBlock className="h-7 w-2/3 bg-[#111827]/20" />
                  <SkeletonBlock className="h-16 bg-[#4b5874]/15" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </LoadingFrame>
  );
}

export function AuthLoadingShell() {
  return (
    <LoadingFrame className="bg-[#f7efe2] text-[#111827]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1180px] items-center gap-8 px-5 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-10">
        <section className="hidden space-y-6 lg:block">
          <SkeletonBlock className="h-8 w-36 bg-[#0b3b73]/20" />
          <SkeletonBlock className="h-20 w-full max-w-lg bg-[#111827]/20" />
          <SkeletonBlock className="h-5 w-full max-w-xl bg-[#4b5874]/20" />
          <SkeletonBlock className="h-56 w-full bg-[#c8272e]/15" />
        </section>

        <section className="rounded-[1.5rem] border-2 border-[#111827] bg-[#fff8ed] p-6 shadow-[9px_10px_0_#0b3b73] sm:p-8">
          <div className="space-y-4">
            <SkeletonBlock className="h-9 w-44 bg-[#111827]/20" />
            <SkeletonBlock className="h-4 w-64 max-w-full bg-[#4b5874]/20" />
          </div>
          <div className="mt-8 space-y-5">
            <SkeletonField />
            <SkeletonField />
            <SkeletonBlock className="h-12 w-full bg-[#0b3b73]/25" />
          </div>
        </section>
      </div>
    </LoadingFrame>
  );
}

export function GameTableLoadingShell({
  accent,
  label,
}: GameTableLoadingShellProps) {
  const accentClass = accent === "red" ? "bg-[#c8272e]/35" : "bg-[#2d7dd2]/35";

  return (
    <LoadingFrame className="bg-[#06152f] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-5 px-4 py-4 sm:px-6 sm:py-6">
        <header className="flex items-center justify-between rounded-2xl border border-white/15 bg-[#0b2348] p-4">
          <div className="space-y-3">
            <p className="text-xs font-black tracking-[0.18em] text-white/50 uppercase">
              {label}
            </p>
            <SkeletonBlock className={`h-8 w-48 ${accentClass}`} />
          </div>
          <SkeletonBlock className="h-11 w-28 bg-white/10" />
        </header>

        <div className="grid flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="relative min-h-[620px] overflow-hidden rounded-[2rem] border border-white/15 bg-[#0a4939] p-5 shadow-2xl">
            <div className="absolute inset-6 rounded-[45%] border-2 border-white/10" />
            <div className="relative flex h-full min-h-[580px] flex-col justify-between">
              <div className="mx-auto flex gap-3">
                <SkeletonCard />
                <SkeletonCard />
              </div>
              <SkeletonBlock className="mx-auto h-16 w-56 bg-black/20" />
              <div className="mx-auto flex gap-3">
                <SkeletonCard />
                <SkeletonCard />
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                {Array.from({ length: 5 }, (_, index) => (
                  <SkeletonBlock className="h-20 bg-black/20" key={index} />
                ))}
              </div>
            </div>
          </section>

          <aside className="space-y-4 rounded-2xl border border-white/15 bg-[#0b2348] p-4">
            <SkeletonBlock className="h-7 w-32 bg-white/20" />
            <SkeletonBlock className="h-24 bg-white/10" />
            <SkeletonBlock className="h-44 bg-white/10" />
            <SkeletonBlock className={`h-12 ${accentClass}`} />
          </aside>
        </div>
      </div>
    </LoadingFrame>
  );
}

export function DerbyLoadingShell() {
  return (
    <LoadingFrame className="bg-[#dce9ef] text-[#17202a]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-4 p-3 sm:p-5">
        <header className="flex items-center justify-between rounded-xl border-2 border-[#17202a] bg-[#f4d35e] p-4 shadow-[5px_6px_0_#17202a]">
          <div className="space-y-2">
            <p className="text-xs font-black tracking-[0.18em] uppercase">
              BK Derby
            </p>
            <SkeletonBlock className="h-7 w-52 bg-[#17202a]/20" />
          </div>
          <SkeletonBlock className="h-11 w-28 bg-[#17202a]/20" />
        </header>

        <section className="relative min-h-[480px] flex-1 overflow-hidden rounded-xl border-2 border-[#17202a] bg-[#8fcf6b] shadow-[5px_6px_0_#17202a]">
          <div className="absolute inset-x-0 top-1/3 h-2/5 border-y-4 border-white/70 bg-[#b98255]" />
          <div className="absolute inset-x-0 top-[43%] border-t-2 border-dashed border-white/70" />
          <div className="absolute inset-x-8 bottom-8 grid grid-cols-3 gap-4">
            <SkeletonBlock className="h-24 bg-white/35" />
            <SkeletonBlock className="h-24 bg-white/35" />
            <SkeletonBlock className="h-24 bg-white/35" />
          </div>
        </section>
      </div>
    </LoadingFrame>
  );
}

function LoadingFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return (
    <main aria-busy="true" className={`min-h-screen ${className}`}>
      <span className="sr-only" role="status">
        Loading page
      </span>
      {children}
    </main>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div aria-hidden="true" className={`${pulse} rounded-xl ${className}`} />
  );
}

function SkeletonField() {
  return (
    <div className="space-y-2">
      <SkeletonBlock className="h-4 w-24 bg-[#4b5874]/20" />
      <SkeletonBlock className="h-12 w-full bg-[#111827]/10" />
    </div>
  );
}

function SkeletonCard() {
  return <SkeletonBlock className="h-28 w-20 bg-white/20 sm:h-36 sm:w-24" />;
}
