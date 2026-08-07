import { AuthSessionFallback } from "./page";
import { AuthShell } from "./auth-shell";

export default function Loading() {
  return (
    <AuthShell>
      <AuthSessionFallback />
    </AuthShell>
  );
}
