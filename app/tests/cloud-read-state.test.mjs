import test from 'node:test';import assert from 'node:assert/strict';
import{getPool}from'../lib/cloud-client.js';import{createPostgresStore}from'../lib/postgres-store.js';import{publishDecision}from'../lib/ingestion/publish.js';
test('云端关注起点与按事件已读：公司总览保留提醒，去重并保留另一事件未读',{skip:process.env.TRACE_CLOUD_TEST!=='1'},async()=>{
 const pool=getPool(),c=await pool.connect();try{
  await c.query('BEGIN');
  // Keep the complete scenario inside one outer transaction, including store actions.
  const testPool={query:c.query.bind(c),connect:async()=>({query:(sql,args)=>['BEGIN','COMMIT','ROLLBACK'].includes(sql)?Promise.resolve({rows:[]}):c.query(sql,args),release(){}})};
  const store=createPostgresStore(testPool),user=await store.createUser();
  await store.action(user,{action:'follow',kind:'company',target:'haier'});await store.action(user,{action:'follow',kind:'event',target:'haier-merger'});
  let snapshot=await store.snapshot(user);assert.ok(snapshot.follows.every(f=>!f.unread));
  const e=(await c.query("SELECT * FROM trace_events WHERE id='haier-merger' FOR UPDATE")).rows[0],doc=(await c.query("SELECT payload FROM trace_documents WHERE id='haier_termination'")).rows[0].payload;
  const topic={title:e.payload.title,company_ids:['haier','raas'],claims:[]},decision={event_id:e.id,title:e.payload.title,kind:e.payload.kind,status:'已终止',summary:'事务验收的事件变化，不提交',material_change:true,change_kind:'progress',reason:'只在回滚事务中验证',roles:e.payload.roles,relations:[],uncertainties:[],evidence_claim_ids:[]};
  const changed=await publishDecision(c,{doc,topic,decision,expectedVersion:e.current_version});
  const added=await publishDecision(c,{doc,topic:{...topic,title:'新事件验收-'+user},decision:{...decision,event_id:'new',change_kind:'initial',title:'事务验收的新事件，不提交'}});
  snapshot=await store.snapshot(user);assert.equal(snapshot.notifications.length,2);assert.equal(snapshot.follows.find(f=>f.kind==='company').unread_count,2);assert.equal(snapshot.follows.find(f=>f.kind==='event').unread_count,1);
  const change=snapshot.notifications.find(n=>n.event_id===e.id);assert.equal(change.payload.follow_reasons.length,2);assert.equal(change.payload.notification_type,'event_change');assert.equal(snapshot.notifications.find(n=>n.event_id===added.event_id).payload.notification_type,'new_event');
  await assert.rejects(store.action(user,{action:'read',kind:'company',target:'haier',version:999}),/READ_REQUIRES_EVENT/);
  assert.equal((await store.snapshot(user)).notifications.filter(n=>!n.read_at).length,2);
  await store.action(user,{action:'read',kind:'event',target:e.id,version:changed.version});snapshot=await store.snapshot(user);
  assert.equal(snapshot.follows.find(f=>f.kind==='company').unread_count,1);assert.equal(snapshot.follows.find(f=>f.kind==='event').unread,false);assert.equal(snapshot.notifications.filter(n=>!n.read_at).length,1);
  await store.action(user,{action:'follow',kind:'event',target:added.event_id});assert.equal((await store.snapshot(user)).follows.find(f=>f.kind==='event'&&f.target===added.event_id).unread,false);
  await store.action(user,{action:'read',kind:'event',target:added.event_id,version:1});snapshot=await store.snapshot(user);assert.ok(snapshot.follows.every(f=>!f.unread));assert.equal(snapshot.notifications.length,2);assert.ok(snapshot.notifications.every(n=>n.read_at));
 }finally{await c.query('ROLLBACK');c.release();await pool.end()}
});
