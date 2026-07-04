import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { BkDerbyClient } from "./bk-derby-client";
import { auth } from "@/lib/auth";

export default async function BkDerbyPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/auth");
  }

  return <BkDerbyClient />;
}
