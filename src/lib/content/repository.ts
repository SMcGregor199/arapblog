import type { LiveLoader } from "astro/loaders";
import { getEditorialSnapshot, previewContentEnabled } from "./editorial";
import { serverEnvironment } from "./environment";
import { createNotionArticleSource } from "./notion";
import { readActiveEditorialSnapshot } from "./snapshot";
import { createBlobContentStorage, type ContentStorage } from "./storage";
import { ContentError, type ArticleRepository, type Publication } from "./types";

export interface ArticleCollectionFilter { includeDrafts?: boolean }
export interface ArticleEntryFilter { id?: string; slug?: string; includeDrafts?: boolean }
export function isLiveEntryNotFoundError(error:unknown):boolean{return error instanceof Error&&error.name==="LiveEntryNotFoundError";}

export function createArticleRepository(options:{storage?:ContentStorage;localNotionPreview?:boolean}={}):ArticleRepository{
  if(!options.storage&&previewContentEnabled())return{async listArticles(){return(await getEditorialSnapshot()).publications;},async getArticleBySlug(slug){return(await getEditorialSnapshot()).publications.find((item)=>item.slug===slug);}};
  const storage=options.storage??createBlobContentStorage();
  const local=options.localNotionPreview??(process.env.NODE_ENV==="development"&&Boolean(serverEnvironment("NOTION_API_KEY"))&&Boolean(serverEnvironment("NOTION_PUBLICATIONS_DATABASE_ID")||serverEnvironment("NOTION_DATABASE_ID")));
  if(local){const notion=createNotionArticleSource(storage,{prewarmImages:true,persistImages:true});return{async listArticles(listOptions){return notion.previewArticles(listOptions?.includeDrafts??serverEnvironment("CONTENT_PREVIEW_DRAFTS")!=="false");},async getArticleBySlug(slug,getOptions){return(await notion.previewArticles(getOptions?.includeDrafts??true)).find((item)=>item.slug===slug);}};}
  return{async listArticles(){return(await readActiveEditorialSnapshot(storage)).editorial.publications;},async getArticleBySlug(slug){return(await readActiveEditorialSnapshot(storage)).editorial.publications.find((item)=>item.slug===slug);}};
}

export function articleLiveLoader(repository?:ArticleRepository):LiveLoader<Publication,ArticleEntryFilter,ArticleCollectionFilter,ContentError>{
  return{name:"arapblog-publications",async loadCollection({filter}){try{const publications=await(repository??createArticleRepository()).listArticles({includeDrafts:filter?.includeDrafts});return{entries:publications.map((item)=>({id:item.slug,data:item}))};}catch(error){return{error:asContentError(error)}}},async loadEntry({filter}){try{const slug="slug" in filter?filter.slug||filter.id:filter.id;if(!slug)return undefined;const item=await(repository??createArticleRepository()).getArticleBySlug(slug,{includeDrafts:"includeDrafts" in filter?filter.includeDrafts:undefined});return item?{id:item.slug,data:item}:undefined;}catch(error){return{error:asContentError(error)}}}};
}
function asContentError(error:unknown):ContentError{return error instanceof ContentError?error:new ContentError("Published content is temporarily unavailable.","UNAVAILABLE",{cause:error});}
