import { Client, isFullPage } from "@notionhq/client";

const RETIRED = ["nas-reference-point", "no-homework-kendrick-lamar-guide", "rap-books-that-improve-listening"];
const CONFIRMATION = "--confirm=retire-three-legacy-publications";
if (!process.argv.includes(CONFIRMATION)) throw new Error(`Refusing production mutation. Re-run with ${CONFIRMATION}.`);
const notionKey=required("NOTION_API_KEY");const databaseId=required("NOTION_DATABASE_ID");
const siteUrl=(process.env.SITE_URL||"https://arapblog.com").replace(/\/$/,"");
const notion=new Client({auth:notionKey,notionVersion:"2025-09-03"});
const database=await notion.databases.retrieve({database_id:databaseId.replace(/^collection:\/\//,"")});
const dataSourceId=database.data_sources?.[0]?.id??databaseId;
const pages=[];let cursor;
do{const response=await notion.dataSources.query({data_source_id:dataSourceId,page_size:100,start_cursor:cursor});pages.push(...response.results.filter(isFullPage));cursor=response.has_more?response.next_cursor??undefined:undefined;}while(cursor);
const matches=pages.filter((page)=>RETIRED.includes(richText(page.properties.Slug)));
const found=new Set(matches.map((page)=>richText(page.properties.Slug)));const missing=RETIRED.filter((slug)=>!found.has(slug));
if(missing.length)throw new Error(`Legacy pages not found: ${missing.join(", ")}. No pages were changed.`);
await Promise.all(matches.map((page)=>notion.pages.update({page_id:page.id,properties:{"Sync State":{select:{name:"Unpublish queued"}}}})));
const deadline=Date.now()+3*60*1000;let verified=false;
while(Date.now()<deadline){
  const [home,archive,json,rss,sitemap,...routes]=await Promise.all([fetch(`${siteUrl}/`),fetch(`${siteUrl}/articles`),fetch(`${siteUrl}/.netlify/functions/articles-json`),fetch(`${siteUrl}/rss.xml`),fetch(`${siteUrl}/sitemap.xml`),...RETIRED.map((slug)=>fetch(`${siteUrl}/articles/${slug}`))]);
  const [jsonText,rssText,sitemapText]=await Promise.all([json.text(),rss.text(),sitemap.text()]);
  const absent=RETIRED.every((slug)=>!jsonText.includes(slug)&&!rssText.includes(slug)&&!sitemapText.includes(slug));
  if(home.status===200&&archive.status===200&&routes.every((response)=>response.status===404)&&absent){verified=true;break;}
  await new Promise((resolve)=>setTimeout(resolve,5000));
}
if(!verified)throw new Error("The public takedown did not verify within three minutes. Pages remain unarchived for recovery.");
await Promise.all(matches.map((page)=>notion.pages.update({page_id:page.id,archived:true})));
console.log("Verified public removal and moved exactly three legacy Notion pages to trash.");

function record(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{}}
function richText(value){const items=record(value).rich_text;return(Array.isArray(items)?items:[]).map((item)=>String(record(item).plain_text??"")).join("").trim()}
function required(name){const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required.`);return value}
