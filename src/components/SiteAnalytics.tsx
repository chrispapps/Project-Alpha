"use client";

import { Analytics } from "@vercel/analytics/next";

/** Cookieless page-view counts. Query strings are dropped so only the page path is recorded. */
export default function SiteAnalytics() {
  return <Analytics beforeSend={(event) => ({ ...event, url: event.url.split("?")[0] })} />;
}
