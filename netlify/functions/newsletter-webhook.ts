import { rejectNonProductionMutation } from "../../src/lib/content/editorial";
import { verifyNotionSignature } from "./notion-content-webhook";
export default async function handler(request:Request):Promise<Response>{
  if(request.method!=="POST")return new Response("Method not allowed",{status:405,headers:{Allow:"POST"}});
  const rejection=rejectNonProductionMutation();if(rejection)return rejection;
  const raw=await request.text();let payload:any;try{payload=JSON.parse(raw);}catch{return new Response("Invalid JSON",{status:400});}
  if(payload&&typeof payload.verification_token==="string")return new Response(null,{status:200});
  const token=process.env.NOTION_NEWSLETTER_WEBHOOK_TOKEN?.trim()??"";const signature=request.headers.get("x-notion-signature")??"";
  if(!token||!verifyNotionSignature(raw,signature,token))return new Response("Invalid signature",{status:401});
  const pageId=payload?.entity?.type==="page"?payload.entity.id:"";if(!pageId)return new Response("Ignored",{status:202});
  const queued=await fetch(new URL("/.netlify/functions/newsletter-sync",request.url),{method:"POST",headers:{"Content-Type":"application/json","X-Notion-Signature":signature},body:raw});
  return queued.ok?Response.json({queued:true},{status:202}):new Response("Unable to queue newsletter synchronization",{status:503});
}
