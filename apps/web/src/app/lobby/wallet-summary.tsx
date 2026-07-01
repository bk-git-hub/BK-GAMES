import { BadgeCheck, Coins, WalletCards } from "lucide-react";

type WalletSummaryProps = {
  balance: bigint;
  status: string;
};

const pointsFormatter = new Intl.NumberFormat("en-US");

export function WalletSummary({ balance, status }: WalletSummaryProps) {
  return (
    <section className="overflow-hidden rounded-[1.35rem] border-[2px] border-[#111827] bg-[#0b3b73] text-white shadow-[8px_9px_0_#c8272e]">
      <div className="border-b border-white/15 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <WalletCards className="size-5 text-[#8fc4e8]" />
              <h2 className="text-3xl font-black tracking-normal">Wallet</h2>
            </div>
            <p className="mt-2 text-sm leading-6 font-bold text-[#d8ecff]">
              Private balance display for your signed-in account.
            </p>
          </div>
          <span className="rounded-full bg-[#f5c95f] px-3 py-1 text-xs font-black tracking-normal text-[#111827] uppercase">
            Live
          </span>
        </div>
      </div>

      <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
        <WalletMetric
          icon={Coins}
          label="Balance"
          value={`${formatPoints(balance)} pts`}
        />
        <WalletMetric icon={BadgeCheck} label="Status" value={status} />
      </div>
    </section>
  );
}

function WalletMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.1rem] border border-white/15 bg-[#071c3f] p-4">
      <div className="flex items-center gap-2 text-[#8fc4e8]">
        <Icon className="size-4" />
        <p className="text-xs font-black tracking-normal uppercase">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-black tracking-normal break-words">
        {value}
      </p>
    </div>
  );
}

function formatPoints(value: bigint) {
  return pointsFormatter.format(value);
}
