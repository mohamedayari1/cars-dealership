import arcjet, { createMiddleware, detectBot, shield } from "@arcjet/next";
import { NextResponse } from "next/server";

// Create Arcjet middleware for bot protection
const aj = arcjet({
  key: process.env.ARCJET_KEY,
  rules: [
    shield({
      mode: "LIVE",
    }),
    detectBot({
      mode: "LIVE",
      allow: [
        "CATEGORY:SEARCH_ENGINE",
      ],
    }),
  ],
});

// Simple middleware - no auth checks needed
async function middleware(req) {
  return NextResponse.next();
}

export default createMiddleware(aj, middleware);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
