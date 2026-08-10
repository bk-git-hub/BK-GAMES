import { AuthSessionFallback } from "./auth-session-fallback";
import { AuthShell } from "./auth-shell";

export default function Loading() {
  return (
    <AuthShell>
      <AuthSessionFallback />
    </AuthShell>
  );
}
