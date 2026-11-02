import '../config.js';
import crypto from 'node:crypto';
export const digest=value=>crypto.createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export async function fetchRetry(url,options={}){for(let n=0;n<2;n++){try{const r=await fetch(url,{...options,signal:options.signal||AbortSignal.timeout(20000)});if(!r.ok){const e=new Error('SOURCE_HTTP_'+r.status);if(n===0&&(r.status===429||r.status>=500)){await new Promise(resolve=>setTimeout(resolve,500));continue}throw e}return r}catch(e){if(n===0&&(e.name==='TimeoutError'||e.name==='TypeError'))continue;throw e}}}
export function unpackIfind(result){
 if(result?.isError)throw new Error('IFIND_TOOL_FAILED');
 const rows=[];
 function walk(value,depth=0){
  if(depth>5)throw new Error('IFIND_RESPONSE_TOO_DEEP');
  if(typeof value==='string'){
   let decoded;try{decoded=JSON.parse(value)}catch{try{decoded=JSON.parse(value.replaceAll('\\"','"'))}catch{if(/(失败|无权限|密钥|token.*(invalid|expired)|error)/i.test(value))throw new Error('IFIND_BUSINESS_ERROR');return}}
   walk(decoded,depth+1);
  }else if(Array.isArray(value)){for(const item of value)walk(item,depth+1)}
  else if(value&&typeof value==='object'){
   if(value.error||('code'in value&&![0,1,200,'0','1','200'].includes(value.code)))throw new Error('IFIND_BUSINESS_ERROR');
   if(value['公告标题']||value['资讯标题'])rows.push(value);else if('data'in value)walk(value.data,depth+1);
  }
 }
 for(const item of result?.content||[])if(item.type==='text')walk(item.text);
 return rows;
}
export class IfindClient{
 constructor(){this.session=null;this.id=0;this.tools=[];this.url='https://api-mcp.51ifind.com:8643/ds-mcp-servers/hexin-ifind-ds-news-mcp'}
 async rpc(method,params,notification=false){const headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream','Authorization':process.env.IFIND_API_KEY,'User-Agent':'trace-events/0.1'};if(this.session)headers['Mcp-Session-Id']=this.session;let body={jsonrpc:'2.0',method,...(notification?{}:{id:++this.id}),...(params?{params}:{})};let r=await fetchRetry(this.url,{method:'POST',headers,body:JSON.stringify(body)});const sid=r.headers.get('mcp-session-id');if(sid)this.session=sid;let text=await r.text();let parsed={};if(text.trim()){try{parsed=JSON.parse(text)}catch{let data=text.split('\n').filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trim()).find(x=>x&&x!=='[DONE]');if(data)parsed=JSON.parse(data)}}if(parsed.error||parsed.result?.isError)throw new Error('IFIND_TOOL_FAILED');return parsed.result||parsed}
 async init(){if(!process.env.IFIND_API_KEY)throw new Error('IFIND_KEY_MISSING');await this.rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'trace-events',version:'0.1'}});if(!this.session)throw new Error('IFIND_SESSION_MISSING');await this.rpc('notifications/initialized',null,true);this.tools=(await this.rpc('tools/list',{})).tools||[]}
 async search(tool,query,start,end,size=3){if(!this.tools.some(t=>t.name===tool))throw new Error('IFIND_TOOL_UNAVAILABLE');return unpackIfind(await this.rpc('tools/call',{name:tool,arguments:{query,time_start:start,time_end:end,size}}))}
}
const clean=s=>String(s||'').replace(/<[^>]*>/g,'').replace(/\s/g,'');
export async function companyIndex(){let r=await fetchRetry('https://www.cninfo.com.cn/new/data/szse_stock.json');return(await r.json()).stockList||[]}
export async function announcements(company,index,start,end){let code=company.code.split('.')[0],org=index.find(c=>c.code===code);if(!org)throw new Error('COMPANY_SOURCE_ID_MISSING');let body=new URLSearchParams({pageNum:'1',pageSize:'30',column:company.code.endsWith('.SZ')?'szse':'sse',tabName:'fulltext',stock:code+','+org.orgId,seDate:start+'~'+end,isHLtitle:'true'});let r=await fetchRetry('https://www.cninfo.com.cn/new/hisAnnouncement/query',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Referer:'https://www.cninfo.com.cn/'},body});let d=await r.json();if(!('totalAnnouncement'in d))throw new Error('ANNOUNCEMENT_SCHEMA_CHANGED');return{truncated:!!d.hasMore,total:d.totalAnnouncement,rows:(d.announcements||[]).map(a=>({id:'cninfo-'+a.announcementId,title:clean(a.announcementTitle),source:'https://static.cninfo.com.cn/'+a.adjunctUrl,published_date:new Date(a.announcementTime).toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}),company_id:company.id,publisher:company.name,source_category:a.announcementType||null,source_record_id:String(a.announcementId)}))}}
export function safeOfficialPdf(url){const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='static.cninfo.com.cn'||!/^\/finalpage\/\d{4}-\d{2}-\d{2}\/[\w.-]+\.pdf$/i.test(u.pathname))throw new Error('SOURCE_URL_NOT_ALLOWED');return u.href}
export async function rawPdf(url){const r=await fetchRetry(safeOfficialPdf(url),{redirect:'error'});const size=Number(r.headers.get('content-length')||0);if(size>10*1024*1024)throw new Error('SOURCE_TOO_LARGE');let reader=r.body.getReader(),chunks=[],bytes=0;try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>10*1024*1024)throw new Error('SOURCE_TOO_LARGE');chunks.push(value)}}catch(e){await reader.cancel();throw e}let buffer=Buffer.concat(chunks);if(buffer.subarray(0,4).toString()!=='%PDF')throw new Error('SOURCE_NOT_PDF');return buffer}
export async function parsePdf(buffer,id,hash){const {PDFParse}=await import('pdf-parse');const parser=new PDFParse({data:buffer});try{let result=await parser.getText();let paragraphs=result.pages.flatMap((p,i)=>p.text.split('\n').map(x=>x.trim()).filter(Boolean).map((text,j)=>({id:`${id}:${hash.slice(0,8)}:p${i+1}:l${j+1}`,page:i+1,text})));if(!paragraphs.length||paragraphs.map(p=>p.text).join('').length<50)throw new Error('SOURCE_TEXT_UNAVAILABLE');if(paragraphs.map(p=>p.text).join('').length>45000)throw new Error('SOURCE_REQUIRES_REVIEW_TOO_LONG');return paragraphs}finally{await parser.destroy()}}
export async function quotes(codes){if(!process.env.FUYAO_API_KEY)throw new Error('FUYAO_KEY_MISSING');let r=await fetchRetry('https://fuyao.aicubes.cn/api/a-share/prices/snapshot?thscodes='+encodeURIComponent(codes.join(',')),{headers:{'X-api-key':process.env.FUYAO_API_KEY}});let d=await r.json();if(d.code!==0)throw new Error('FUYAO_BUSINESS_ERROR');return d.data}
