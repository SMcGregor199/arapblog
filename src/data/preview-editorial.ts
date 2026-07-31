import originalsJson from "./preview-originals.generated.json";
import type {
  Article,
  CuratedLink,
  EditorialCollection,
  EditorialSnapshot,
} from "../lib/content/types";

export const editorialFoundationCuratedLinks: CuratedLink[] = [
  {
    id: "atlanta-center-rap-universe",
    title: "How Atlanta became the center of the rap universe",
    canonicalUrl: "https://www.npr.org/2023/07/19/1188417703/hip-hop-50-atlanta",
    writer: "Jewel Wicker",
    publication: "NPR",
    publishedAt: "2023-07-19T14:30:00.000Z",
    editorialNote:
      "A city history that explains Atlanta’s reach through its local contradictions instead of flattening the scene into a trap timeline.",
    topics: ["History", "Southern rap", "Cities"],
  },
  {
    id: "los-angeles-fault-lines",
    title: "How LA proved hip-hop could go global — by staying thoroughly local",
    canonicalUrl: "https://www.npr.org/2023/08/10/1192466118/hip-hop-50-los-angeles",
    writer: "Jeff Weiss",
    publication: "NPR",
    publishedAt: "2023-08-10T15:14:00.000Z",
    editorialNote:
      "A sharp regional history built around Los Angeles as New York’s geographic and aesthetic counterargument.",
    topics: ["History", "West Coast", "Cities"],
  },
  {
    id: "rakim-word-of-god",
    title: "The Word of God: An Interview With Rakim",
    canonicalUrl:
      "https://www.theringer.com/2024/08/28/music/rakim-interview-new-album-juice-crew-paid-in-full",
    writer: "David Ma and Adam Mansbach",
    publication: "The Ringer",
    publishedAt: "2024-08-28T10:30:00.000Z",
    editorialNote:
      "Rakim speaks with unusual specificity about breath, influence, and the technical decisions that changed how an MC could occupy a beat.",
    topics: ["Interviews", "Craft", "History"],
  },
  {
    id: "billy-woods-golliwog",
    title: "How billy woods Created His Latest Masterpiece, GOLLIWOG",
    canonicalUrl:
      "https://pitchfork.com/features/how-billy-woods-created-his-latest-masterpiece-golliwog/",
    writer: "Paul A. Thompson",
    publication: "Pitchfork",
    publishedAt: "2025-05-13T00:00:00.000Z",
    editorialNote:
      "A process-focused conversation about constraints, short-story structure, and how a rap album can build one world without forcing one plot.",
    topics: ["Interviews", "Craft", "Independent rap"],
  },
  {
    id: "mike-showbiz",
    title: "MIKE Knows a Thing or Two About Showbiz",
    canonicalUrl:
      "https://pitchfork.com/features/interview/mike-knows-a-thing-or-two-about-showbiz/",
    writer: "Mano Sundaresan",
    publication: "Pitchfork",
    publishedAt: "2025-01-17T00:00:00.000Z",
    editorialNote:
      "An interview that keeps touring, independence, collaboration, and the people around a scene in the same frame.",
    topics: ["Interviews", "Independent rap", "New York"],
  },
  {
    id: "kendrick-drake-toll",
    title: "Taking the toll of Drake and Kendrick Lamar’s vicious, gripping psychological warfare",
    canonicalUrl: "https://www.npr.org/2024/05/08/1249906234/kendrick-lamar-drake-beef-fallout",
    writer: "Sheldon Pearce",
    publication: "NPR",
    publishedAt: "2024-05-08T16:05:00.000Z",
    editorialNote:
      "A useful post-battle reading because it studies narrative distortion and consequence after the scorekeeping loses its charge.",
    topics: ["Criticism", "News analysis", "Rap industry"],
  },
  {
    id: "best-rap-albums-2024",
    title: "The 27 Best Rap Albums of 2024",
    canonicalUrl: "https://pitchfork.com/features/lists-and-guides/best-rap-albums-2024/",
    writer: "Alphonse Pierre",
    publication: "Pitchfork",
    publishedAt: "2024-12-09T00:00:00.000Z",
    editorialNote:
      "A personal year-end map whose value is less the ranking than its attention to regional scenes, small stakes, and emotional interiority.",
    topics: ["Criticism", "Discovery", "Year in review"],
  },
  {
    id: "best-rapper-years",
    title: "The 30 Best Years Rappers Have Ever Had, Ranked",
    canonicalUrl:
      "https://www.theringer.com/2024/12/19/music/best-rapper-years-ever-kendrick-lamar-50-cent-2003",
    writer: "Justin Sayles, Khal Davenport, and Paul Thompson",
    publication: "The Ringer",
    publishedAt: "2024-12-19T11:30:00.000Z",
    editorialNote:
      "A canon argument with a productive unit of measurement: not whole careers, but the concentrated years when craft, output, and cultural force converged.",
    topics: ["History", "Criticism", "Canon"],
  },
];

export const editorialFoundationCollections: EditorialCollection[] = [
  {
    slug: "how-rap-remembers-itself",
    title: "How rap remembers itself",
    description:
      "Five pieces about the people, places, arguments, and listening habits that turn rap history into something alive.",
    introduction:
      "Rap history is not one straight line from the Bronx to the present. These selections move between city histories, an MC’s account of his own craft, a deliberately arguable canon, and books that send the reader back to the records with better questions.",
    publishedAt: "2026-07-31T12:00:00.000Z",
    updatedAt: "2026-07-31T12:00:00.000Z",
    topics: ["History", "Craft", "Canon"],
    selections: [
      { kind: "curated", slug: "atlanta-center-rap-universe" },
      { kind: "curated", slug: "los-angeles-fault-lines" },
      { kind: "curated", slug: "rakim-word-of-god" },
      { kind: "curated", slug: "best-rapper-years" },
      { kind: "original", slug: "rap-books-that-improve-listening" },
    ],
  },
];

export const previewEditorialSnapshot: EditorialSnapshot = {
  schemaVersion: 2,
  originals: originalsJson as Article[],
  curatedLinks: editorialFoundationCuratedLinks,
  collections: editorialFoundationCollections,
  contributors: [
    {
      notionPageId: "preview-contributor-1",
      displayName: "vestige",
      slug: "vestige",
      role: "Founding editor",
      bio: "vestige writes A Rap Blog for listeners who want strong arguments, useful context, and a way back into rap without the infinite-feed panic.",
      links: [],
    },
  ],
};
