import test from 'node:test';import assert from 'node:assert/strict';
import{financialRows,claimsForDocument,citationPosition,eventBrief,compactText}from'../lib/evidence-presentation.js';
import{decorateFollows,notificationKind,notificationsForFollow,mergeNotificationSnapshots}from'../lib/notification-state.js';
test('财务表保留期间、单位、增减方向和补充指标，不将歧义数字硬塞入表格',()=>{
 const rows=financialRows([{id:'a',type:'fact',text:'海尔生物26Q3单季度营收6.7亿元、同比+18.0%，归母净利润0.7亿元、同比+29.9%，扣非净利增速达21.3%。'},{id:'b',type:'fact',text:'2026年前三季度营收19.6亿元，同比下降11.5%；归母净利润2.2亿元，增长10.7%。'},{id:'c',type:'opinion',text:'机构预计2026年前三季度营收19.6亿元，归母净利润2.2亿元。'},{id:'d',type:'fact',text:'2026年Q3营收6.7亿元，归母净利润0.7亿元，另有业务收入1.1亿元。'}]);
 assert.equal(rows.length,2);assert.equal(rows[0].period,'26Q3单季度');assert.equal(rows[0].revenue.value,'6.7亿元');assert.equal(rows[0].profit.change,'同比+29.9%');assert.match(rows[0].extra,/21.3%/);assert.equal(rows[1].revenue.change,'同比下降11.5%');
});
test('引用按文档版本匹配，自然语言标注位置，短摘要不截断数字',()=>{
 const doc={id:'d',completeness:'excerpt',paragraphs:[{id:'d:hash:l1',page:1,text:'原文'}]},claims=[{id:'d:c1',citations:[{line_id:'d:hash:l1',quote:'原文'}]},{id:'d:old',citations:[{line_id:'d:other:l1',quote:'原文'}]}];assert.equal(claimsForDocument(doc,claims).length,1);assert.equal(citationPosition(claims[0].citations[0],doc),'新闻片段 · 第1段');assert.equal(compactText('一条短句。很长的金额表述12345678901234567890亿元',10),'一条短句。');assert.equal(compactText('12345678901234567890亿元',10),'');
 const brief=eventBrief({status:'待核实',kind:'业绩披露',title:'季度业绩',summary:'不应重复整段数字'},[{type:'新闻',completeness:'excerpt'}]);assert.match(brief.headline,/原始材料核实/);assert.equal(brief.fields[0][1],'1篇新闻片段');
});
test('通知驱动未读；重新关注不复活旧订阅提示，旧通知兼容',()=>{
 const follow={kind:'company',target:'a',created_at:'2026-11-02T01:00:00.123456+00:00'},notes=[{event_id:'e',version:1,read_at:null,payload:{notification_type:'new_event',follow_reasons:[{kind:'company',target:'a',followed_at:follow.created_at}]}},{event_id:'f',version:2,read_at:null,payload:{follow_reasons:[{kind:'company',target:'a',followed_at:'2026-11-02T01:00:00.123455+00:00'}]}}];
 assert.equal(notificationsForFollow(follow,notes,[]).length,1);assert.equal(decorateFollows([follow],notes,[])[0].unread_count,1);assert.equal(notificationKind(notes[0]),'new_event');
 assert.equal(notificationsForFollow(follow,[{event_id:'e',version:2,payload:{generated_at:'2026-11-02T02:00:00Z'}}],[{id:'e',companies:['a']}]).length,1);
 assert.equal(decorateFollows([follow],[],[])[0].unread,false);
});

test('延迟响应不会复活已读或抹掉后来收到的通知',()=>{const read={event_id:'a',version:2,read_at:'2026-11-02T03:00:00Z',payload:{generated_at:'2026-11-02T02:00:00Z'}},newer={event_id:'b',version:1,read_at:null,payload:{generated_at:'2026-11-02T04:00:00Z'}};const merged=mergeNotificationSnapshots([read,newer],[{...read,read_at:null}]);assert.equal(merged.length,2);assert.equal(merged[0].event_id,'b');assert.ok(merged.find(n=>n.event_id==='a').read_at)});
