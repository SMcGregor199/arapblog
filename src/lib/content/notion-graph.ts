import { Client, isFullPage, type PageObjectResponse } from "@notionhq/client";
import { contentHash, slugifyTitle } from "./article";
import { serverEnvironment } from "./environment";
import { NotionArticleSource, type NotionSyncStatus } from "./notion";
import { mutateEditorialSnapshot, readActiveEditorialSnapshot } from "./snapshot";
import type { ContentStorage } from "./storage";
import { ContentError, type CuratedPiece, type EditorialSnapshot, type Publication, type SelectionReference } from "./types";

const CURATED = { title:"Name", id:"ID", url:"Canonical URL", writer:"Writer", source:"Source Publication", date:"Original Date", topics:"Topics", annotation:"Annotation", roundup:"Roundup" } as const;
const SELECTION = { parent:"Appears In", curated:"External Piece", publication:"Internal Publication", order:"Display Order" } as const;

interface SelectionRow { parentPageId:string; order:number; sortTitle?:string; selection:SelectionReference }

export class NotionEditorialGraphSource {
  readonly notion: Client;
  readonly publications: NotionArticleSource;
  constructor(private storage: ContentStorage, notion?: Client) {
    this.notion=notion??new Client({auth:required("NOTION_API_KEY"),notionVersion:"2025-09-03"});
    this.publications=new NotionArticleSource({notion:this.notion,storage,databaseId:required("NOTION_PUBLICATIONS_DATABASE_ID")});
  }

  async buildGraph(): Promise<{ editorial:EditorialSnapshot; queued:Publication[] }> {
    const active=(await readActiveEditorialSnapshot(this.storage,{allowMissing:true})).editorial;
    const [publicationPages,curatedPages,selectionPages]=await Promise.all([
      this.publications.queryPages(),this.query(required("NOTION_CURATED_PIECES_DATABASE_ID")),this.query(required("NOTION_SELECTIONS_DATABASE_ID")),
    ]);
    const statusByPage=new Map(publicationPages.map((page)=>[page.id,this.publications.readSyncStatus(page)]));
    const publicationTypeByPage=new Map(publicationPages.map((page)=>[page.id,publicationType(page)]));
    const includedPublicationPages=publicationPages.filter((page)=>{const status=statusByPage.get(page.id)!;return status.syncState!=="Unpublish queued"&&(status.published||status.syncState==="Queued");});
    const activeByPage=new Map(active.publications.map((item)=>[item.notionPageId,item]));
    const allSelections=this.parseSelections(selectionPages);
    const roundupAssignments=this.parseRoundupAssignments(curatedPages,publicationTypeByPage);
    const includedPageIds=new Set(includedPublicationPages.map((page)=>page.id));
    const selections=new Map([...allSelections].filter(([parent])=>includedPageIds.has(parent)));
    const includedRoundupAssignments=new Map([...roundupAssignments].filter(([parent])=>includedPageIds.has(parent)));
    const referencedCuratedPages=new Set([...selections.values(),...includedRoundupAssignments.values()].flat().filter((item)=>item.selection.kind==="curatedPiece").map((item)=>item.selection.reference));
    const notionCuratedPieces=curatedPages.filter((page)=>referencedCuratedPages.has(page.id)).map(parseCuratedPiece);
    const curatedIdByPage=new Map([...active.curatedPieces,...notionCuratedPieces].map((item)=>[item.notionPageId,item.id]));
    const publicationSlugByPage=new Map(includedPublicationPages.map((page)=>{const current=activeByPage.get(page.id);if(current)return[page.id,current.slug];const metadata=this.publications.parseMetadata(page);return[page.id,metadata.slug||slugifyTitle(metadata.title)];}));
    const queued:Publication[]=[];
    const nextPublications:Publication[]=[];
    for(const page of includedPublicationPages){
      const status=statusByPage.get(page.id)!;
      const current=activeByPage.get(page.id);
      if(status.syncState==="Unpublish queued"||(!status.published&&status.syncState!=="Queued")) continue;
      if((status.syncState==="Changes pending"||status.syncState==="Failed")&&current){nextPublications.push(current);continue;}
      if(status.syncState!=="Queued"&&status.syncState!=="Published") continue;
      const publication=await this.publications.articleFromPage(page,{stableSlug:current?.slug,publishedAt:current?.publishedAt});
      const contentRows=selections.get(page.id)??[];
      if(publication.publicationType==="Roundup"&&contentRows.length){throw new ContentError(`Roundup "${publication.slug}" must use the External Piece Roundup relation, not Publication Contents rows.`,"VALIDATION");}
      if(publication.publicationType!=="Roundup"&&publication.publicationType!=="Collection"&&contentRows.length){throw new ContentError(`Only Roundups and Collections may have Publication Contents rows (found on "${publication.slug}").`,"VALIDATION");}
      const orderedSource=publication.publicationType==="Roundup"?includedRoundupAssignments.get(page.id)??[]:contentRows;
      const ordered=[...orderedSource].sort((a,b)=>a.order-b.order||(a.sortTitle??"").localeCompare(b.sortTitle??"")).map((item)=>({
        ...item.selection,
        reference:item.selection.kind==="curatedPiece"
          ? curatedIdByPage.get(item.selection.reference)??item.selection.reference
          : publicationSlugByPage.get(item.selection.reference)??item.selection.reference,
      }));
      const complete=(publication.publicationType==="Roundup"||publication.publicationType==="Collection")?{...publication,selections:ordered} as Publication:publication;
      nextPublications.push(complete);
      if(status.syncState==="Queued") queued.push(complete);
    }
    const requiredCuratedIds=new Set(nextPublications.flatMap((publication)=>publication.publicationType==="Roundup"||publication.publicationType==="Collection"?publication.selections.filter((item)=>item.kind==="curatedPiece").map((item)=>item.reference):[]));
    const curatedById=new Map(active.curatedPieces.map((item)=>[item.id,item]));for(const item of notionCuratedPieces)curatedById.set(item.id,item);
    const curatedPieces=[...curatedById.values()].filter((item)=>requiredCuratedIds.has(item.id));
    this.requireCompleteDependencyPromotion(active,{...active,publications:nextPublications,curatedPieces},statusByPage,mergeSelectionRows(selections,includedRoundupAssignments));
    return {editorial:{schemaVersion:3,publications:nextPublications,curatedPieces,contributors:active.contributors,newsletterIssues:active.newsletterIssues},queued};
  }

  async promote(graph?:{ editorial:EditorialSnapshot; queued:Publication[] }): Promise<EditorialSnapshot> {
    graph??=await this.buildGraph();
    const result=await mutateEditorialSnapshot(this.storage,()=>graph.editorial);
    await Promise.all(graph.queued.map((item)=>this.publications.markPublished(item)));
    return result.editorial;
  }

  async markAffectedParentsPending(changedPageId:string): Promise<void> {
    const [publicationPages,curatedPages,selectionPages]=await Promise.all([this.publications.queryPages(),this.query(required("NOTION_CURATED_PIECES_DATABASE_ID")),this.query(required("NOTION_SELECTIONS_DATABASE_ID"))]);
    const rows=this.parseSelections(selectionPages);
    const roundupAssignments=this.parseRoundupAssignments(curatedPages,new Map(publicationPages.map((page)=>[page.id,publicationType(page)])));
    const affected=new Set<string>();
    for(const [parent,items] of rows){
      if(items.some((item)=>item.selection.notionPageId===changedPageId||item.selection.reference===changedPageId)) affected.add(parent);
    }
    for(const [parent,items] of roundupAssignments){
      if(items.some((item)=>item.selection.reference===changedPageId)) affected.add(parent);
    }
    await Promise.all(publicationPages.filter((page)=>affected.has(page.id)&&this.publications.readSyncStatus(page).published).map((page)=>this.publications.markChangesPending(page.id)));
  }

  private requireCompleteDependencyPromotion(active:EditorialSnapshot,next:EditorialSnapshot,statusByPage:Map<string,NotionSyncStatus>,rows:Map<string,SelectionRow[]>):void{
    const oldCurated=new Map(active.curatedPieces.map((item)=>[item.id,item]));
    const changed=new Set(next.curatedPieces.filter((item)=>{const previous=oldCurated.get(item.id);return !previous||contentHash(item)!==contentHash(previous);}).map((item)=>item.notionPageId));
    if(!changed.size)return;
    const pendingParents=[...rows.entries()].filter(([,items])=>items.some((item)=>item.selection.kind==="curatedPiece"&&changed.has(item.selection.reference))).map(([parent])=>parent).filter((parent)=>statusByPage.get(parent)?.published&&statusByPage.get(parent)?.syncState!=="Queued");
    if(pendingParents.length)throw new ContentError(`External Piece changes require every affected published parent to be Queued: ${pendingParents.join(", ")}.`,"VALIDATION");
  }

  private parseSelections(pages:PageObjectResponse[]):Map<string,SelectionRow[]>{
    const result=new Map<string,SelectionRow[]>();
    for(const page of pages){
      const parent=relationIds(page.properties[SELECTION.parent])[0];
      const curated=relationIds(page.properties[SELECTION.curated])[0];
      const publication=relationIds(page.properties[SELECTION.publication])[0];
      const order=numberValue(page.properties[SELECTION.order]);
      if(!parent||!Number.isInteger(order)||order<1||Boolean(curated)===Boolean(publication))throw new ContentError(`Selection ${page.id} must have one parent, one target, and a positive Order.`,"VALIDATION");
      const selection:SelectionReference=curated?{notionPageId:page.id,kind:"curatedPiece",reference:curated}:{notionPageId:page.id,kind:"publication",reference:publication};
      result.set(parent,[...(result.get(parent)??[]),{parentPageId:parent,order,selection}]);
    }
    for(const [parent,items] of result){if(new Set(items.map((item)=>item.order)).size!==items.length)throw new ContentError(`Selections for ${parent} contain a duplicate Order.`,"VALIDATION");}
    return result;
  }

  private parseRoundupAssignments(pages:PageObjectResponse[],publicationTypeByPage:Map<string,string>):Map<string,SelectionRow[]>{
    const result=new Map<string,SelectionRow[]>();
    for(const page of pages){
      const parents=relationIds(page.properties[CURATED.roundup]);
      if(!parents.length)continue;
      if(parents.length!==1)throw new ContentError(`External Piece ${page.id} may be assigned to only one Roundup.`,"VALIDATION");
      const parent=parents[0];
      if(publicationTypeByPage.get(parent)!=="Roundup")throw new ContentError(`External Piece ${page.id} must be assigned to a Roundup publication.`,"VALIDATION");
      const originalDate=date(page.properties[CURATED.date]);
      const order=Date.parse(`${originalDate}T00:00:00.000Z`);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(originalDate)||!Number.isFinite(order))throw new ContentError(`External Piece ${page.id} requires a valid Original Date for Roundup ordering.`,"VALIDATION");
      result.set(parent,[...(result.get(parent)??[]),{parentPageId:parent,order,sortTitle:title(page.properties[CURATED.title]),selection:{notionPageId:page.id,kind:"curatedPiece",reference:page.id}}]);
    }
    return result;
  }

  private async query(databaseId:string):Promise<PageObjectResponse[]>{
    let dataSourceId=databaseId.replace(/^collection:\/\//,"");
    try{const database=await this.notion.databases.retrieve({database_id:dataSourceId}) as unknown as {data_sources?:Array<{id:string}>};dataSourceId=database.data_sources?.[0]?.id??dataSourceId;}catch{}
    const pages:PageObjectResponse[]=[];let cursor:string|undefined;
    do{const response=await this.notion.dataSources.query({data_source_id:dataSourceId,page_size:100,start_cursor:cursor});pages.push(...response.results.filter(isFullPage));cursor=response.has_more?(response.next_cursor??undefined):undefined;}while(cursor);
    return pages;
  }
}

function parseCuratedPiece(page:PageObjectResponse):CuratedPiece{
  const id=richText(page.properties[CURATED.id])||page.id.replaceAll("-","").slice(0,24);
  return {notionPageId:page.id,id,title:title(page.properties[CURATED.title]),canonicalUrl:url(page.properties[CURATED.url]),writer:richText(page.properties[CURATED.writer]),sourcePublication:richText(page.properties[CURATED.source]),originalDate:date(page.properties[CURATED.date]),topics:multiSelect(page.properties[CURATED.topics]),annotation:richText(page.properties[CURATED.annotation])};
}
function record(value:unknown):Record<string,any>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,any>:{};}
function textArray(value:unknown):string{const values=Array.isArray(value)?value:[];return values.map((item)=>String(record(item).plain_text??"")).join("").trim();}
function title(value:unknown):string{return textArray(record(value).title);}
function richText(value:unknown):string{return textArray(record(value).rich_text);}
function url(value:unknown):string{return String(record(value).url??"").trim();}
function date(value:unknown):string{return String(record(record(value).date).start??"").trim();}
function multiSelect(value:unknown):string[]{const values=record(value).multi_select;return Array.isArray(values)?values.map((item)=>String(record(item).name??"")).filter(Boolean):[];}
function relationIds(value:unknown):string[]{const values=record(value).relation;return Array.isArray(values)?values.map((item)=>String(record(item).id??"")).filter(Boolean):[];}
function numberValue(value:unknown):number{return Number(record(value).number);}
function publicationType(page:PageObjectResponse):string{return String(record(record(page.properties["Publication Type"]).select).name??"").trim();}
function mergeSelectionRows(...maps:Array<Map<string,SelectionRow[]>>):Map<string,SelectionRow[]>{const result=new Map<string,SelectionRow[]>();for(const map of maps)for(const [parent,items] of map)result.set(parent,[...(result.get(parent)??[]),...items]);return result;}
function required(name:string):string{const value=serverEnvironment(name);if(!value)throw new ContentError(`${name} is not configured.`,"CONFIGURATION");return value;}
