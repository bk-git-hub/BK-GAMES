import { Gift } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function DailyRewardCard() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Gift className="size-4" />
          <CardTitle>Daily reward</CardTitle>
        </div>
        <CardDescription>
          Reward claiming is the next wallet flow to connect.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="rounded-lg border px-3 py-2">
          <p className="text-sm font-medium">Claim status</p>
          <p className="text-muted-foreground text-sm">
            Ready for server action wiring.
          </p>
        </div>
        <Button type="button" disabled className="w-full">
          Claim coming next
        </Button>
      </CardContent>
    </Card>
  );
}
