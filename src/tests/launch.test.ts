import { describe,expect,it } from "vitest";
import { assertLaunchInventory } from "../lib/content/launch";
import type { Publication,PublicationType } from "../lib/content/types";
import { articleFixture } from "./helpers";
function item(type:PublicationType,index:number):Publication{const base=articleFixture({notionPageId:`${type}-${index}`,slug:`${type.toLowerCase().replaceAll(" ","-")}-${index}`,publicationType:type as "Essay"});return type==="Roundup"||type==="Collection"?{...base,publicationType:type,selections:[]}:{...base,publicationType:type} as Publication;}
describe("launch inventory",()=>{it("requires exactly two Essays, four Roundups, one Collection, and two Listening Guides",()=>{const complete=[...Array.from({length:2},(_,i)=>item("Essay",i)),...Array.from({length:4},(_,i)=>item("Roundup",i)),item("Collection",0),...Array.from({length:2},(_,i)=>item("Listening Guide",i))];expect(()=>assertLaunchInventory(complete)).not.toThrow();expect(()=>assertLaunchInventory(complete.slice(1))).toThrow(/Essay: expected 2, found 1/);});});
