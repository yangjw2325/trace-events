import test from 'node:test';import assert from 'node:assert/strict';
import{getPool}from'../lib/cloud-client.js';import{drainQueue}from'../lib/ingestion/worker.js';
test('云端队列：过期恢复、瞬时重试、待核验隔离和重跑去重',{skip:process.env.TRACE_CLOUD_TEST!=='1'},async()=>{
 const pool=getPool(),c=await pool.connect();try{await c.query('BEGIN');
 for(const t of ['trace_queue','trace_runs','trace_metadata'])await c.query(`CREATE TEMP TABLE ${t} (LIKE public.${t} INCLUDING ALL) ON COMMIT DROP`);
 await c.query("INSERT INTO trace_metadata(id,payload) VALUES('dataset','{\"dataStatus\":{}}')");
 await c.query(`INSERT INTO trace_queue(id,source_kind,status,payload,detail) VALUES
  ('a','notice','pending','{}','{}'),('b','notice','processing','{}','{"lease_until":"2020-01-01T00:00:00Z"}'),
  ('c','news','pending','{}','{}'),('d','news','pending','{}','{}')`);
 let visits=[];const options={pool:c,snapshot:async()=>({}),process:async(_p,row)=>{visits.push(row.id);if(row.id==='c')throw new Error('SOURCE_HTTP_503');if(row.id==='d')return{review:true,reason:'不确定'};return{duplicate:true}}};
 const first=await drainQueue(options);assert.equal(first.processed.length,6);assert.equal(first.remaining,0);assert.equal(first.review,2);
 await drainQueue(options);await drainQueue(options);
 const errors=(await c.query("SELECT status,attempts FROM trace_queue WHERE id='c'")).rows[0];assert.equal(errors.status,'review');assert.equal(errors.attempts,3);
 assert.equal(visits.filter(x=>x==='a').length,1);assert.equal(visits.filter(x=>x==='b').length,1);assert.equal(visits.filter(x=>x==='d').length,1);
 const final=await drainQueue(options);assert.equal(final.processed.length,0);assert.equal(final.remaining,0);
 }finally{await c.query('ROLLBACK');c.release();await pool.end()}
});
