export const site = {
  prelaunch: false,
  name: "A Rap Blog",
  shortName: "ARB",
  url: "https://arapblog.com",
  description:
    "Essays, Roundups, Collections, and Listening Guides for rap listeners who want context, argument, and discovery.",
  headline: "The writing rap deserves.",
  author: "vestige",
  email: "vestige@arapblog.com",
  supportUrl: import.meta.env.PUBLIC_KIT_TIP_URL || "https://buymeacoffee.com/arapblog",
  newsletterFormAction: "https://app.kit.com/forms/9741486/subscriptions",
};

export const navigation = [
  { href: "/essays", label: "Essays" },
  { href: "/roundups", label: "Roundups" },
  { href: "/collections", label: "Collections" },
  { href: "/listening-guides", label: "Listening Guides" },
  { href: "/about", label: "About" },
  { href: "/newsletter", label: "Newsletter" },
];
