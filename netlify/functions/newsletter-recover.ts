import { timingSafeEqual } from "node:crypto";
import { rejectNonProductionMutation } from "../../src/lib/content/editorial";
import { NewsletterSynchronizer } from "../../src/lib/content/newsletter";
import { kitDraftClientIfConfigured, NotionNewsletterIssueSource } from "../../src/lib/content/notion-newsletter";
import { createBlobContentStorage } from "../../src/lib/content/storage";

export default async function handler(request:Request):Promise<Response>{
  if(request.method!=="POST")return new Response("Method not allowed",{status:405,headers:{Allow:"POST"}});
  const rejection=rejectNonProductionMutation();if(rejection)return rejection;
  if(!authorized(request))return new Response("Unauthorized",{status:401});
  let pageId="";try{const body=await request.json() as {pageId?:unknown};pageId=typeof body.pageId==="string"?body.pageId.trim():"";}catch{return new Response("Invalid JSON",{status:400});}
  if(!pageId)return new Response("pageId is required",{status:400});
  try{await new NewsletterSynchronizer(createBlobContentStorage(),new NotionNewsletterIssueSource(),kitDraftClientIfConfigured()).process(pageId);return Response.json({processed:true},{headers:{"Cache-Control":"no-store"}});}catch(error){return Response.json({error:error instanceof Error?error.message:"Newsletter recovery failed."},{status:500,headers:{"Cache-Control":"no-store"}});}
}
function authorized(request:Request):boolean{const expected=process.env.NEWSLETTER_RECOVERY_SECRET?.trim()??"";const header=request.headers.get("authorization")??"";const supplied=header.startsWith("Bearer ")?header.slice(7).trim():"";const a=Buffer.from(expected);const b=Buffer.from(supplied);return Boolean(expected)&&a.length===b.length&&timingSafeEqual(a,b);}
