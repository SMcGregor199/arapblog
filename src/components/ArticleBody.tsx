import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ArticleBodyProps {
  bodyMarkdown: string;
}

export default function ArticleBody({ bodyMarkdown }: ArticleBodyProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      urlTransform={safeMarkdownUrl}
      components={{
        a: SafeLink,
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
  ...props
}: ComponentPropsWithoutRef<"a">) {
  const isExternal = /^https?:\/\//i.test(href);
  return (
    <a
      {...props}
      href={href}
      rel={isExternal ? "noopener noreferrer" : undefined}
    >
      {children}
    </a>
  );
}

function SafeImage({
  src = "",
  alt = "",
  ...props
}: ComponentPropsWithoutRef<"img">) {
  if (typeof src !== "string" || !src) return null;
  return <img {...props} src={src} alt={alt} loading="lazy" decoding="async" />;
}
