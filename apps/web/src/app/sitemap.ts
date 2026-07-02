import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const routes = [
    "/",
    "/shop",
    "/bundles",
    "/guides",
    "/quiz",
    "/app-control",
    "/long-distance",
    "/discreet-play",
    "/how-to-choose",
    "/faq",
    "/shipping",
    "/returns",
    "/privacy",
    "/contact",
  ];

  return routes.map((url) => ({
    url: `${baseUrl}${url}`,
    lastModified: new Date(),
  }));
}

