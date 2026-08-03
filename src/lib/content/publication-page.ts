import { getEditorialSnapshot } from "./editorial";
import type { PublicationType } from "./types";

export async function publicationPage(slug: string, type: PublicationType) {
  const editorial = await getEditorialSnapshot();
  const publication = editorial.publications.find((item) => item.slug === slug && item.publicationType === type);
  return { editorial, publication };
}
