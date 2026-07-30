import { describe, expect, it } from "vitest";
import {
  notionImageAlt,
  sourceFingerprint,
  stableImageId,
} from "../lib/content/images";

describe("Notion image identity", () => {
  it("ignores temporary signing parameters but changes when the source path changes", () => {
    const first =
      "https://s3.example.com/article/image.png?X-Amz-Date=1&X-Amz-Signature=abc";
    const refreshed =
      "https://s3.example.com/article/image.png?X-Amz-Date=2&X-Amz-Signature=def";
    const replacement =
      "https://s3.example.com/article/replacement.png?X-Amz-Date=2";

    expect(sourceFingerprint(first)).toBe(sourceFingerprint(refreshed));
    expect(stableImageId("block-1", first)).toBe(
      stableImageId("block-1", refreshed),
    );
    expect(stableImageId("block-1", first)).not.toBe(
      stableImageId("block-1", replacement),
    );
  });

  it("uses the Notion caption as image alternative text", () => {
    expect(
      notionImageAlt({
        type: "image",
        image: {
          caption: [{ plain_text: "A record on a winding route" }],
        },
      }),
    ).toBe("A record on a winding route");
  });
});
