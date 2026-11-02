import test from 'node:test';import assert from 'node:assert/strict';
const base=process.env.TRACE_TEST_URL;
test('HTTP会话、关注、原文与来源验证',{skip:!base},async()=>{
 let r=await fetch(base+'/api/data');assert.equal(r.status,200);let data=await r.json();assert.equal(data.companies.length,3);assert.ok(data.events.length>=4);assert.equal(data.user,null);
 const send=(body,cookie='',origin=base)=>fetch(base+'/api/actions',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
 r=await send({action:'session'});assert.equal(r.status,200);let cookie=r.headers.get('set-cookie').split(';')[0];assert.ok(cookie.startsWith('trace_session='));
 r=await send({action:'follow',kind:'event',target:'haier-merger'},cookie);assert.equal(r.status,200);assert.equal((await r.json()).follows.length,1);
 r=await fetch(base+'/api/data',{headers:{Cookie:cookie}});assert.equal((await r.json()).follows.length,1);
 r=await fetch(base+'/api/data');assert.equal((await r.json()).follows.length,0);
 r=await send({action:'session'},'','https://unrelated.example');assert.equal(r.status,403);
 r=await send({action:'read',kind:'event',target:'haier-merger',version:999},cookie);assert.equal(r.status,400);
 r=await send({action:'session'},'','malformed');assert.equal(r.status,403);
 r=await fetch(base+'/api/source/guiguan-invalid');assert.equal(r.status,404);
 r=await fetch(base+'/api/source/guiguang_correction');assert.equal(r.status,200);assert.ok(r.headers.get('content-type').includes('application/pdf'));assert.equal(Buffer.from(await r.arrayBuffer()).subarray(0,4).toString(),'%PDF');
 r=await send({action:'unfollow',kind:'event',target:'haier-merger'},cookie);assert.equal((await r.json()).follows.length,0);
});
