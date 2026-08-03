import { describe,expect,it } from "vitest";
import { servePublicationsJson } from "../../netlify/functions/publications-json";
import { mutateSnapshot } from "../lib/content/snapshot";
import { articleFixture,MemoryContentStorage } from "./helpers";

describe("publications JSON",()=>{
  it("serves all publication discriminators with ETag and HEAD/304 support",async()=>{const storage=new MemoryContentStorage();await mutateSnapshot(storage,()=>[articleFixture({publicationType:"Essay"}),{...articleFixture({notionPageId:"roundup-page",slug:"weekly",publicationType:"Roundup"}),selections:[]}]);const response=await servePublicationsJson(new Request("https://example.com/.netlify/functions/publications-json"),storage);expect(response.status).toBe(200);expect(await response.json()).toEqual(expect.arrayContaining([expect.objectContaining({publicationType:"Essay"}),expect.objectContaining({publicationType:"Roundup"})]));const etag=response.headers.get("etag")!;expect((await servePublicationsJson(new Request("https://example.com/.netlify/functions/publications-json",{headers:{"If-None-Match":etag}}),storage)).status).toBe(304);const head=await servePublicationsJson(new Request("https://example.com/.netlify/functions/publications-json",{method:"HEAD"}),storage);expect(head.status).toBe(200);expect(await head.text()).toBe("");});
});
