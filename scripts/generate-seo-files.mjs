import { writeFile } from "node:fs/promises";

const configuredSiteUrl = process.env.SITE_URL || "https://your-domain.com";
let siteUrl;

try {
  siteUrl = new URL(configuredSiteUrl);
} catch {
  throw new Error(`SITE_URL must be an absolute HTTPS URL: ${configuredSiteUrl}`);
}

if (
  siteUrl.protocol !== "https:" ||
  siteUrl.username ||
  siteUrl.password ||
  siteUrl.search ||
  siteUrl.hash
) {
  throw new Error(`SITE_URL must be an absolute HTTPS URL without credentials, query, or hash: ${configuredSiteUrl}`);
}

siteUrl.pathname = `${siteUrl.pathname.replace(/\/+$/, "")}/`;
const baseUrl = siteUrl.href;
const sitemapUrl = new URL("sitemap.xml", baseUrl).href;

const robots = `User-agent: *
Allow: /

Sitemap: ${sitemapUrl}
`;
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}</loc>
  </url>
</urlset>
`;

await Promise.all([
  writeFile(new URL("../public/robots.txt", import.meta.url), robots),
  writeFile(new URL("../public/sitemap.xml", import.meta.url), sitemap),
]);

console.log(`Generated robots.txt and sitemap.xml for ${baseUrl}`);
