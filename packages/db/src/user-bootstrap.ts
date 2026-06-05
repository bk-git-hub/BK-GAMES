import { eq } from "drizzle-orm";

import { db } from "./client";
import { userProfiles, wallets } from "./schema";

export type EnsureUserGameAccountInput = {
  userId: string;
  displayName?: string | null;
};

export async function ensureUserGameAccount({
  userId,
  displayName,
}: EnsureUserGameAccountInput) {
  return db.transaction(async (tx) => {
    await tx
      .insert(userProfiles)
      .values({
        userId,
        displayName: displayName || null,
      })
      .onConflictDoNothing({
        target: userProfiles.userId,
      });

    await tx
      .insert(wallets)
      .values({
        userId,
      })
      .onConflictDoNothing({
        target: wallets.userId,
      });

    const [profile] = await tx
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    const [wallet] = await tx
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .limit(1);

    if (!profile || !wallet) {
      throw new Error(`Failed to bootstrap game account for user ${userId}.`);
    }

    return {
      profile,
      wallet,
    };
  });
}
