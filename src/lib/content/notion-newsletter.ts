import { Client, isFullPage, type UpdatePageParameters } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import { serverEnvironment } from "./environment";
import { KitAccessUnavailableError, type NewsletterIssueDraft, type NewsletterIssueSource, type KitDraftClient } from "./newsletter";
import { NEWSLETTER_STATES, ContentError, type NewsletterState } from "./types";

const P={name:"Name",month:"Coverage Month",subject:"Subject",preview:"Preview Text",state:"Workflow State",hash:"Generated Content Hash",broadcast:"Kit Broadcast ID",fallback:"Fallback Page ID",error:"Error"} as const;

export class NotionNewsletterIssueSource implements NewsletterIssueSource {
  readonly notion:Client;
  private readonly databaseId:string;
  constructor(notion?:Client,databaseId=required("NOTION_NEWSLETTER_ISSUES_DATABASE_ID")){this.notion=notion??new Client({auth:required("NOTION_API_KEY"),notionVersion:"2025-09-03"});this.databaseId=databaseId;}
  async readIssue(pageId:string):Promise<NewsletterIssueDraft>{
    const page=await this.notion.pages.retrieve({page_id:pageId});if(!isFullPage(page))throw new ContentError("Newsletter Issue could not be retrieved.","NOT_FOUND");
    const state=select(page.properties[P.state]) as NewsletterState;if(!NEWSLETTER_STATES.includes(state))throw new ContentError("Newsletter Workflow State is invalid.","VALIDATION");
    const coverageMonth=rich(page.properties[P.month]);await this.assertUniqueCoverageMonth(coverageMonth,page.id);
    const converter=new NotionToMarkdown({notionClient:this.notion,config:{parseChildPages:false}});const blocks=await converter.pageToMarkdown(pageId);const note=(converter.toMarkdownString(blocks).parent??"").trim();
    return {notionPageId:page.id,coverageMonth,subject:rich(page.properties[P.subject])||title(page.properties[P.name]),previewText:rich(page.properties[P.preview]),state,editorNoteMarkdown:note,generatedContentHash:rich(page.properties[P.hash])||undefined,kitBroadcastId:rich(page.properties[P.broadcast])||undefined};
  }
  async markPrepared(pageId:string,result:{contentHash:string;kitBroadcastId?:string;fallbackPageId?:string}):Promise<void>{await this.update(pageId,{[P.hash]:richProperty(result.contentHash),[P.broadcast]:richProperty(result.kitBroadcastId??""),[P.fallback]:richProperty(result.fallbackPageId??""),[P.error]:richProperty("")});}
  async markFailed(pageId:string,message:string):Promise<void>{await this.update(pageId,{[P.state]:selectProperty("Failed"),[P.error]:richProperty(message.slice(0,1900))});}
  async createOrUpdateFallback(pageId:string,html:string,existingPageId?:string):Promise<string>{
    const chunks=chunk(html,1900).map((content)=>({object:"block" as const,type:"code" as const,code:{language:"html" as const,rich_text:[{type:"text" as const,text:{content}}]}}));
    if(existingPageId){const existing=await this.notion.blocks.children.list({block_id:existingPageId,page_size:100});await Promise.all(existing.results.map((block)=>this.notion.blocks.delete({block_id:block.id})));await this.notion.blocks.children.append({block_id:existingPageId,children:chunks});return existingPageId;}
    const created=await this.notion.pages.create({parent:{type:"page_id",page_id:pageId},properties:{title:{type:"title",title:[{type:"text",text:{content:"Copy-ready email"}}]}},children:chunks});return created.id;
  }
  private async update(pageId:string,properties:Record<string,unknown>):Promise<void>{await this.notion.pages.update({page_id:pageId,properties:properties as UpdatePageParameters["properties"]});}
  private async assertUniqueCoverageMonth(month:string,pageId:string):Promise<void>{
    let dataSourceId=this.databaseId.replace(/^collection:\/\//,"");try{const database=await this.notion.databases.retrieve({database_id:dataSourceId}) as unknown as {data_sources?:Array<{id:string}>};dataSourceId=database.data_sources?.[0]?.id??dataSourceId;}catch{}
    let cursor:string|undefined;const matching:string[]=[];do{const response=await this.notion.dataSources.query({data_source_id:dataSourceId,page_size:100,start_cursor:cursor});for(const item of response.results){if(isFullPage(item)&&rich(item.properties[P.month])===month)matching.push(item.id);}cursor=response.has_more?(response.next_cursor??undefined):undefined;}while(cursor);
    if(matching.some((id)=>id!==pageId))throw new ContentError(`Coverage Month ${month} is used by more than one Newsletter Issue.`,"VALIDATION");
  }
}

export class KitV4DraftClient implements KitDraftClient {
  constructor(private apiKey=required("KIT_API_KEY"),private templateId=serverEnvironment("KIT_TEMPLATE_ID")){}
  async createOrUpdateDraft(input:{subject:string;previewText:string;html:string;broadcastId?:string}):Promise<string>{
    const endpoint=input.broadcastId?`https://api.kit.com/v4/broadcasts/${encodeURIComponent(input.broadcastId)}`:"https://api.kit.com/v4/broadcasts";
    const response=await fetch(endpoint,{method:input.broadcastId?"PUT":"POST",headers:{Authorization:`Bearer ${this.apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({subject:input.subject,preview_text:input.previewText,content:input.html,...(this.templateId?{email_template_id:this.templateId}:{})})});
    if(response.status===403||response.status===404)throw new KitAccessUnavailableError();
    if(!response.ok)throw new ContentError(`Kit draft request failed with ${response.status}. The issue was not sent.`,"UNAVAILABLE");
    const body=await response.json() as Record<string,any>;const id=String(body.id??body.broadcast?.id??"");if(!id)throw new ContentError("Kit did not return a broadcast ID. The issue was not sent.","UNAVAILABLE");return id;
  }
}

export function kitDraftClientIfConfigured():KitV4DraftClient|undefined{return serverEnvironment("KIT_API_KEY")?new KitV4DraftClient():undefined;}
function record(value:unknown):Record<string,any>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,any>:{};}
function plain(value:unknown):string{return (Array.isArray(value)?value:[]).map((item)=>String(record(item).plain_text??"")).join("").trim();}
function rich(value:unknown):string{return plain(record(value).rich_text);}
function title(value:unknown):string{return plain(record(value).title);}
function select(value:unknown):string{const item=record(value);return String(record(item.status??item.select).name??"");}
function richProperty(value:string){return {rich_text:value?[{type:"text" as const,text:{content:value}}]:[]};}
function selectProperty(value:NewsletterState){return {select:{name:value}};}
function chunk(value:string,size:number):string[]{const result:string[]=[];for(let index=0;index<value.length;index+=size)result.push(value.slice(index,index+size));return result.length?result:[""];}
function required(name:string):string{const value=serverEnvironment(name);if(!value)throw new ContentError(`${name} is not configured.`,"CONFIGURATION");return value;}
