import { afterEach, describe, expect, it } from "vitest";
import { serveEditorialJson } from "../../netlify/functions/editorial-json";
import { previewEditorialSnapshot } from "../data/preview-editorial";
import { mutateEditorialSnapshot, validateEditorialSnapshot } from "../lib/content/snapshot";
import type { EditorialSnapshot } from "../lib/content/types";
import { articleFixture, MemoryContentStorage } from "./helpers";

afterEach(()=>{delete process.env.CONTEXT;});

function graphFixture():EditorialSnapshot{
  const essay=articleFixture({notionPageId:"essay-page",slug:"first-essay",publicationType:"Essay"});
  const guide=articleFixture({notionPageId:"guide-page",slug:"first-guide",publicationType:"Listening Guide"});
  return{schemaVersion:3,publications:[essay,guide,{...essay,notionPageId:"roundup-page",slug:"weekly-one",publicationType:"Roundup",selections:[{notionPageId:"selection-1",kind:"curatedPiece",reference:"outside-one"}]},{...essay,notionPageId:"collection-page",slug:"collection-one",publicationType:"Collection",selections:[{notionPageId:"selection-2",kind:"publication",reference:"first-essay"},{notionPageId:"selection-3",kind:"publication",reference:"first-guide"},{notionPageId:"selection-4",kind:"curatedPiece",reference:"outside-one"}]}],curatedPieces:[{notionPageId:"curated-page",id:"outside-one",title:"Outside",canonicalUrl:"https://example.com/story",writer:"Writer",sourcePublication:"Source",originalDate:"2026-07-01T00:00:00.000Z",topics:["rap"],annotation:"A human-written note."}],contributors:[{notionPageId:"contributor-page",displayName:"vestige",slug:"vestige",bio:"Editor.",role:"Editor",links:[]}],newsletterIssues:[]};
}

describe("editorial schema version three",()=>{
  it("keeps deploy preview editorial content empty until a reviewed export",()=>{const editorial=validateEditorialSnapshot(previewEditorialSnapshot);expect(editorial.schemaVersion).toBe(3);expect(editorial.publications).toEqual([]);expect(editorial.curatedPieces).toEqual([]);expect(editorial.contributors.map((item)=>item.slug)).toEqual(["vestige"]);});
  it("validates Roundup and Collection selection rules",()=>{const editorial=validateEditorialSnapshot(graphFixture());expect(editorial.publications).toHaveLength(4);const invalid=graphFixture();const roundup=invalid.publications.find((item)=>item.publicationType==="Roundup")!;if(roundup.publicationType==="Roundup")roundup.selections[0]={notionPageId:"selection-1",kind:"publication",reference:"first-essay"} as never;expect(()=>validateEditorialSnapshot(invalid)).toThrow("The active content snapshot is invalid.");});
  it("never promotes an invalid graph over the last-known-good manifest",async()=>{const storage=new MemoryContentStorage();await mutateEditorialSnapshot(storage,()=>graphFixture());const live=storage.manifest?.activeVersion;await expect(mutateEditorialSnapshot(storage,(editorial)=>{const collection=editorial.publications.find((item)=>item.publicationType==="Collection")!;if(collection.publicationType==="Collection")collection.selections.push({notionPageId:"selection-x",kind:"publication",reference:"weekly-one"});return editorial;})).rejects.toThrow("The active content snapshot is invalid.");expect(storage.manifest?.activeVersion).toBe(live);});
  it("serves the empty immutable preview snapshot with ETag and 304 support",async()=>{process.env.CONTEXT="deploy-preview";const response=await serveEditorialJson(new Request("https://preview.example/.netlify/functions/editorial-json"));expect(response.status).toBe(200);const body=await response.json();expect(body).toMatchObject({schemaVersion:3,publications:[],curatedPieces:[]});const conditional=await serveEditorialJson(new Request("https://preview.example/.netlify/functions/editorial-json",{headers:{"If-None-Match":`W/${response.headers.get("etag")}`}}));expect(conditional.status).toBe(304);});
});
