import { site } from "../data/site";
import { getEditorialSnapshot, publicationPath } from "../lib/content/editorial";
import { editorialSlug } from "../lib/editorial-routing";
export const prerender=false;
const FIXED_ROUTES=["","/essays","/roundups","/collections","/listening-guides","/topics","/about","/newsletter","/affiliate-disclosure","/privacy"];
export async function GET(){
  let editorial; try{editorial=await getEditorialSnapshot();}catch{return new Response("Published content is temporarily unavailable.",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}})}
  const entries: Array<{loc:string;lastmod?:string}>=[
    ...FIXED_ROUTES.map((route)=>({loc:`${site.url}${route}`})),
    ...editorial.publications.map((publication)=>({loc:`${site.url}${publicationPath(publication)}`,lastmod:publication.updatedAt})),
    ...editorial.newsletterIssues.map((issue)=>({loc:`${site.url}/newsletter/${issue.coverageMonth}`,lastmod:issue.sentAt})),
    ...editorial.contributors.map((item)=>({loc:`${site.url}/contributors/${item.slug}`})),
    ...[...new Set([...editorial.publications.flatMap((item)=>item.topics),...editorial.curatedPieces.flatMap((item)=>item.topics)].map(editorialSlug))].map((topic)=>({loc:`${site.url}/topics/${topic}`})),
  ];
  const body=['<?xml version="1.0" encoding="UTF-8"?>','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',...entries.map((entry)=>`  <url><loc>${escapeXml(entry.loc)}</loc>${entry.lastmod?`<lastmod>${escapeXml(entry.lastmod)}</lastmod>`:""}</url>`),'</urlset>',''].join('\n');
  return new Response(body,{headers:{"Content-Type":"application/xml; charset=utf-8","Netlify-CDN-Cache-Control":"public, s-maxage=30, stale-while-revalidate=120, durable"}});
}
function escapeXml(value:string){return value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;")}
