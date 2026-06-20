import type { Metadata } from "next";

import { BoxingBroadcastClient } from "./boxing-broadcast-client";

export const metadata: Metadata = {
  title: "Boxing Preview | BK Games",
  description: "BK Games live boxing broadcast preview",
};

export default function BoxingPage() {
  return <BoxingBroadcastClient />;
}
