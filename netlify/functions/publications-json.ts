import { contentCacheHeaders } from "../../src/lib/content/cache";
import { contentHash } from "../../src/lib/content/article";
import { getEditorialSnapshot } from "../../src/lib/content/editorial";
import type { ContentStorage } from "../../src/lib/content/storage";

export default async function handler(request: Request): Promise<Response> { return servePublicationsJson(request); }
export async function servePublicationsJson(request: Request, storage?: ContentStorage): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed",{status:405,headers:{Allow:"GET, HEAD"}});
  try {
    const publications=(await getEditorialSnapshot(storage)).publications;
    const etag=`"${contentHash(publications)}"`;
    const headers={...contentCacheHeaders(),"Content-Type":"application/json; charset=utf-8",ETag:etag};
    const requested=request.headers.get("if-none-match")?.split(",").map((value)=>value.trim().replace(/^W\//,""))??[];
    if(requested.includes(etag)||requested.includes("*")) return new Response(null,{status:304,headers});
    return new Response(request.method==="HEAD"?null:JSON.stringify(publications),{status:200,headers});
  } catch { return new Response("Published content is temporarily unavailable.",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}}); }
}
