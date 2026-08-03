import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ArticleBodyProps {
  bodyMarkdown: string;
  hasAffiliateLinks?: boolean;
}

export default function ArticleBody({ bodyMarkdown, hasAffiliateLinks = false }: ArticleBodyProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      urlTransform={safeMarkdownUrl}
      components={{
        a: (props) => <SafeLink {...props} labelAffiliateClicks={hasAffiliateLinks} />,
        img: SafeImage,
      }}
    >
      {bodyMarkdown}
    </ReactMarkdown>
  );
}

export function safeMarkdownUrl(
  value: string,
  key: string,
): string {
  const url = value.trim();
  if (!url) return "";

  if (key === "src") {
    try {
      const parsed = new URL(url, "https://arapblog.com");
      return parsed.origin === "https://arapblog.com" &&
        parsed.pathname === "/.netlify/functions/notion-image" &&
        parsed.searchParams.has("imageId")
        ? `${parsed.pathname}${parsed.search}`
        : "";
    } catch {
      return "";
    }
  }

  if (url.startsWith("#") || (url.startsWith("/") && !url.startsWith("//"))) {
    return url;
  }
  try {
    const parsed = new URL(url);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? url : "";
  } catch {
    return "";
  }
}

function SafeLink({
  href = "",
  children,
  labelAffiliateClicks = false,
  ...props
}: ComponentPropsWithoutRef<"a"> & { labelAffiliateClicks?: boolean }) {
  const isExternal = /^https?:\/\//i.test(href);
  const isBookshopAffiliate = labelAffiliateClicks && isBookshopUrl(href);
  return (
    <a
      {...props}
      href={href}
      rel={isBookshopAffiliate ? "external nofollow sponsored" : isExternal ? "noopener noreferrer" : undefined}
      data-umami-event={isBookshopAffiliate ? "Bookshop affiliate click" : undefined}
    >
      {children}
    </a>
  );
}

function isBookshopUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "bookshop.org" || hostname.endsWith(".bookshop.org");
  } catch {
    return false;
  }
}

function SafeImage({
  src = "",
  alt = "",
  ...props
}: ComponentPropsWithoutRef<"img">) {
  if (typeof src !== "string" || !src) return null;
  return <img {...props} src={src} alt={alt} loading="lazy" decoding="async" />;
}
