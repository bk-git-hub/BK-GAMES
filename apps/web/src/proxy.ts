import { NextResponse, type NextRequest } from "next/server";

import { cardGamesNotFoundBody, isCardGamesEnabled } from "@/lib/card-games";

// Matches no route on purpose. Next answers an unmatched URL with the root
// not-found UI and a real 404 status, which notFound() inside the pages cannot
// guarantee once a loading.tsx boundary has started streaming.
const UNMATCHED_PATH = "/_card-games-disabled";

export function proxy(request: NextRequest) {
  if (isCardGamesEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(cardGamesNotFoundBody, { status: 404 });
  }

  if (pathname.startsWith("/cards/")) {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.rewrite(new URL(UNMATCHED_PATH, request.url));
}

// Only card-game paths, so racing, home, and auth requests never run the proxy.
export const config = {
  matcher: [
    "/blackjack/:path*",
    "/baccarat/:path*",
    "/api/admin/blackjack/:path*",
    "/cards/:path*",
  ],
};
