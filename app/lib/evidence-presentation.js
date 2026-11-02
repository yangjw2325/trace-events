export const claimTypes={fact:'事实陈述',opinion:'观点',speculation:'推测',rumor:'传闻'};
export const statusNames={planned:'筹划中',ongoing:'推进中',terminated:'已终止'};
export const displayStatus=status=>statusNames[status]||status;
export function claimsForDocument(doc,claims){const ids=new Set((doc.paragraphs||[]).map(p=>p.id));return claims.filter(c=>c.id.startsWith(doc.id+':')&&c.citations?.length&&c.citations.every(r=>ids.has(r.line_id)))}
export function citationPosition(ref,doc){
 const index=doc.paragraphs.findIndex(p=>p.id===ref.line_id),p=doc.paragraphs[index];
 if(!p)return'引用位置未知';
 if(doc.completeness==='excerpt')return'新闻片段 · 第'+(index+1)+'段';
 const line=ref.line_id.match(/:l(\d+)$/)?.[1];return'第'+p.page+'页'+(line?' · 第'+line+'段':'');
}
export function compactText(text,limit=100){
 const value=String(text||'').replace(/completeness=excerpt/g,'新闻片段');
 if(value.length<=limit)return value;
 const sentences=value.match(/[^。！？；]+[。！？；]?/g)||[];
 let result='';for(const sentence of sentences){if((result+sentence).length>limit)break;result+=sentence}
 return result||''; // Never cut a number, unit or qualification in the middle.
}
export function eventBrief(event,docs){
 const status=displayStatus(event.status),announcements=docs.filter(d=>d.type!=='新闻'),news=docs.filter(d=>d.type==='新闻');
 if(!announcements.length&&status==='待核实')return{headline:'媒体报道相关进展，关键内容待原始材料核实。',fields:[['当前依据',news.length+'篇新闻'+(news.every(d=>d.completeness==='excerpt')?'片段':'报道')],['待补证据',/业绩|季报|财报/.test(event.kind+' '+event.title)?'公司报告原文':'公司公告或报告原文']]};
 const summary=compactText(event.summary,86);
 const fallback=({'已终止':'该事项已终止。','已否认':'公司已否认该项说法，具体范围见所列证据。','已更正':'公司已发布更正，具体修订见对应证据。','筹划中':'该事项仍在筹划。','推进中':'该事项已有后续进展。','已完成':'该事项已完成。','已披露':'相关材料已披露。','存在冲突':'现有材料存在不同表述。'})[status]||'当前状态：'+status+'。';
 return{headline:summary||fallback,fields:[['当前依据',[announcements.length?announcements.length+'份公告':'',news.length?news.length+'篇新闻':''].filter(Boolean).join(' / ')||'见时间线材料']]};
}
function metric(text,names){
 const match=text.match(new RegExp('(?:'+names+')\\s*([\\d,.]+\\s*(?:亿元|万元|元))'));
 if(!match)return null;const rest=text.slice(match.index+match[0].length),end=rest.search(/[；;。]|归母|营收|营业收入/),clause=end<0?rest:rest.slice(0,end);
 const yoy=clause.match(/(?:同比|增长|增速)[^\d%+-]{0,8}([+-]?\d+(?:\.\d+)?%)/)?.[1];
 const change=clause.match(/同比[^，,；;。]{0,12}?[+-]?\d+(?:\.\d+)?%|(?:增长|下降|减少|上升|降低)\s*[+-]?\d+(?:\.\d+)?%/)?.[0];return{value:match[1].replace(/\s/g,''),yoy:yoy||null,change:change||null};
}
export function financialRows(claims){
 return claims.filter(c=>c.type==='fact').flatMap(c=>{
  const text=c.text,period=text.match(/(?:20\d{2}年?)?(?:前三季度|上半年|下半年|第一季度|第二季度|第三季度|第四季度|全年)|(?:20)?\d{2}年?Q[1-4](?:单季度)?|Q[1-4](?:单季度)?/i)?.[0];
  const revenue=metric(text,'营收|营业收入'),profit=metric(text,'归母净利润|归母净利');
  // Only use the structured view for an unambiguous period with both metrics.
  // Additional figures stay in the original claim so nothing is silently lost.
  if(!period||!revenue||!profit)return[];
  const extra=text.match(/扣非净利[^。；;]{0,45}/)?.[0]||'';
  const allowedNumbers=[...(period.match(/\d+(?:\.\d+)?/g)||[]),...(revenue.value.match(/[\d,.]+/g)||[]),...(profit.value.match(/[\d,.]+/g)||[]),revenue.yoy?.replace(/[+%\-]/g,''),profit.yoy?.replace(/[+%\-]/g,''),...(extra.match(/\d+(?:\.\d+)?/g)||[])].filter(Boolean);
  if((text.match(/\d+(?:[,.]\d+)*/g)||[]).some(n=>!allowedNumbers.includes(n)))return[];
  return[{claim:c,period,revenue,profit,extra}];
 });
}
export function changeComparison(note,event){
 if(note.payload?.fields?.length)return note.payload.fields;
 const current=event?.versions?.find(v=>v.version===note.version),previous=event?.versions?.find(v=>v.version===note.version-1);
 if(current&&previous&&displayStatus(current.status)!==displayStatus(previous.status))return[{label:'事件状态',before:displayStatus(previous.status),after:displayStatus(current.status)}];
 return[{label:'判断更新',before:compactText(note.payload?.before||previous?.summary,150)||'查看此前版本',after:compactText(note.payload?.after||current?.summary,150)||'查看本次版本'}];
}
