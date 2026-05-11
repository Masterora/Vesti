import type { MetadataRoute } from "next";
import { getAbsoluteUrl } from "@/lib/site";

const routes = [
  {
    path: "/",
    changeFrequency: "weekly" as const,
    priority: 1
  },
  {
    path: "/dashboard",
    changeFrequency: "daily" as const,
    priority: 0.8
  },
  {
    path: "/contracts/new",
    changeFrequency: "monthly" as const,
    priority: 0.7
  }
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return routes.map((route) => ({
    url: getAbsoluteUrl(route.path),
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority
  }));
}