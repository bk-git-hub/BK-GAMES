import { WalletCards } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type WalletSummaryProps = {
  balance: bigint;
  status: string;
};

const pointsFormatter = new Intl.NumberFormat("en-US");

export function WalletSummary({ balance, status }: WalletSummaryProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <WalletCards className="size-4" />
          <CardTitle>Wallet</CardTitle>
        </div>
        <CardDescription>
          Private balance display for the signed-in player.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <WalletMetric label="Balance" value={`${formatPoints(balance)} pts`} />
        <WalletMetric label="Status" value={status} />
      </CardContent>
    </Card>
  );
}

function WalletMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function formatPoints(value: bigint) {
  return pointsFormatter.format(value);
}
