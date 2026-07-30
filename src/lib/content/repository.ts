import type { LiveLoader } from "astro/loaders";
import { serverEnvironment } from "./environment";
import { createNotionArticleSource } from "./notion";
import { readActiveSnapshot } from "./snapshot";
import {
  createBlobContentStorage,
  type ContentStorage,
} from "./storage";
import {
  ContentError,
  type Article,
  type ArticleRepository,
} from "./types";

export interface ArticleCollectionFilter {
  includeDrafts?: boolean;
}

export interface ArticleEntryFilter {
  id?: string;
  slug?: string;
  includeDrafts?: boolean;
}

export function createArticleRepository(options: {
  storage?: ContentStorage;
  localNotionPreview?: boolean;
} = {}): ArticleRepository {
  const storage = options.storage ?? createBlobContentStorage();
  const localNotionPreview =
    options.localNotionPreview ?? shouldUseLocalNotionPreview();

  if (localNotionPreview) {
    const notion = createNotionArticleSource(storage, {
      prewarmImages: true,
      persistImages: true,
    });
    return {
      async listArticles(listOptions) {
        return notion.previewArticles(listOptions?.includeDrafts ?? previewDrafts());
      },
      async getArticleBySlug(slug, getOptions) {
        const articles = await notion.previewArticles(
          getOptions?.includeDrafts ?? previewDrafts(),
        );
        return articles.find((article) => article.slug === slug);
      },
    };
  }

  return {
    async listArticles() {
      return (await readActiveSnapshot(storage)).articles;
    },
    async getArticleBySlug(slug) {
      const { manifest, articles } = await readActiveSnapshot(storage);
      if (!manifest?.articles.some((article) => article.slug === slug)) {
        return undefined;
      }
      return articles.find((article) => article.slug === slug);
    },
  };
}

export function articleLiveLoader(
  repository?: ArticleRepository,
): LiveLoader<
  Article,
  ArticleEntryFilter,
  ArticleCollectionFilter,
  ContentError
> {
  return {
    name: "arapblog-articles",
    async loadCollection({ filter }) {
      try {
        const articles = await (repository ?? createArticleRepository()).listArticles({
          includeDrafts: filter?.includeDrafts,
        });
        return {
          entries: articles.map((article) => ({
            id: article.slug,
            data: article,
          })),
        };
      } catch (error) {
        return { error: asContentError(error) };
      }
    },
    async loadEntry({ filter }) {
      try {
        const slug = "slug" in filter ? filter.slug || filter.id : filter.id;
        if (!slug) return undefined;
        const article = await (repository ?? createArticleRepository()).getArticleBySlug(slug, {
          includeDrafts:
            "includeDrafts" in filter ? filter.includeDrafts : undefined,
        });
        return article
          ? {
              id: article.slug,
              data: article,
            }
          : undefined;
      } catch (error) {
        return { error: asContentError(error) };
      }
    },
  };
}

function shouldUseLocalNotionPreview(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    Boolean(serverEnvironment("NOTION_API_KEY")) &&
    Boolean(serverEnvironment("NOTION_DATABASE_ID"))
  );
}

function previewDrafts(): boolean {
  return serverEnvironment("CONTENT_PREVIEW_DRAFTS") !== "false";
}

function asContentError(error: unknown): ContentError {
  return error instanceof ContentError
    ? error
    : new ContentError("Published content is temporarily unavailable.", "UNAVAILABLE", {
        cause: error,
      });
}
