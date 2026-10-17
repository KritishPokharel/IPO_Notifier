import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional HTTP Basic auth for the whole dashboard. Enabled when DASHBOARD_PASSWORD is set.
 * /api/cron uses its own bearer secret so external schedulers can call it.
 */
export function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password || req.nextUrl.pathname.startsWith("/api/cron")) return NextResponse.next();
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const pass = decoded.slice(decoded.indexOf(":") + 1);
      if (pass === password) return NextResponse.next();
    } catch {
      // fall through
    }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="ETF Dashboard", charset="UTF-8"' },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
