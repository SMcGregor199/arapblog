import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const revision = "1ee13fd^";
const files = [
  "src/content/articles/nas-reference-point.md",
  "src/content/articles/no-homework-kendrick-lamar-guide.md",
  "src/content/articles/rap-books-that-improve-listening.md",
];

const originals = files.map((file, index) => {
  const source = execFileSync("git", ["show", `${revision}:${file}`], {
    encoding: "utf8",
  });
  const match = source.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (!match) throw new Error(`Could not parse ${file}`);
  const metadata = Object.fromEntries(
    match[1].split("\n").map((line) => {
      const separator = line.indexOf(":");
      const key = line.slice(0, separator);
      const raw = line.slice(separator + 1).trim();
      if (raw.startsWith("[") || raw === "true" || raw === "false") {
        return [key, JSON.parse(raw)];
      }
      return [key, raw.replace(/^"|"$/g, "")];
    }),
  );
  const slug = file.split("/").at(-1).replace(/\.md$/, "");
  const publishedAt = new Date(`${metadata.publishedAt}T00:00:00.000Z`).toISOString();
  return {
    notionPageId: `preview-original-${index + 1}`,
    slug,
    title: metadata.title,
    description: metadata.description,
    publishedAt,
    updatedAt: publishedAt,
    author: "vestige",
    contentType: "Guide",
    tags: metadata.tags,
    heroLabel: metadata.heroLabel,
    heroAlt: metadata.heroAlt,
    accent: metadata.accent,
    hasAffiliateLinks: metadata.hasAffiliateLinks,
    featured: metadata.featured,
    readTimeMinutes: Number.parseInt(metadata.readTime, 10),
    readTime: metadata.readTime,
    bodyMarkdown: match[2].trim(),
  };
});

writeFileSync(
  new URL("../src/data/preview-originals.generated.json", import.meta.url),
  `${JSON.stringify(originals, null, 2)}\n`,
);
