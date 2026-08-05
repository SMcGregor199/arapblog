import { ContentError, type Publication, type PublicationType } from "./types";

export const LAUNCH_INVENTORY: Record<PublicationType, number> = {
  Essay: 2,
  Roundup: 4,
  Collection: 1,
  "Listening Guide": 2,
};

export function assertLaunchInventory(publications: Publication[]): void {
  const actual = Object.fromEntries(Object.keys(LAUNCH_INVENTORY).map((type) => [type, publications.filter((item) => item.publicationType === type).length])) as Record<PublicationType, number>;
  const differences = (Object.entries(LAUNCH_INVENTORY) as Array<[PublicationType, number]>).filter(([type, expected]) => actual[type] !== expected).map(([type, expected]) => `${type}: expected ${expected}, found ${actual[type]}`);
  if (differences.length) throw new ContentError(`Launch inventory is incomplete (${differences.join("; ")}).`, "VALIDATION");
}
