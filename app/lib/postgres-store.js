import crypto from 'node:crypto';
import {getPool} from './cloud-client.js';
import {decorateFollows,sortNotifications} from './notification-state.js';
export function createPostgresStore(pool=getPool()){
 async function withClient(fn){const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
 async function snapshot(user){
  const {rows:[r]}=await pool.query(`SELECT
   (SELECT payload FROM trace_metadata WHERE id='dataset') AS metadata,
   coalesce((SELECT jsonb_agg(payload ORDER BY id) FROM trace_companies),'[]'::jsonb) AS companies,
   coalesce((SELECT jsonb_agg(e.payload || jsonb_build_object('importantVersion',e.current_version,'versions',coalesce((SELECT jsonb_agg(v.payload ORDER BY v.version) FROM trace_event_versions v WHERE v.event_id=e.id),'[]'::jsonb)) ORDER BY e.id) FROM trace_events e),'[]'::jsonb) AS events,
   coalesce((SELECT jsonb_agg(v.payload ORDER BY d.id) FROM trace_documents d JOIN trace_document_versions v ON d.id=v.document_id AND d.current_hash=v.hash),'[]'::jsonb) AS documents,
   coalesce((SELECT jsonb_agg(payload ORDER BY document_id) FROM trace_document_versions),'[]'::jsonb) AS historical_documents,
   coalesce((SELECT jsonb_agg(payload ORDER BY id) FROM trace_claims),'[]'::jsonb) AS claims,
   coalesce((SELECT jsonb_agg(to_jsonb(f)||jsonb_build_object('read_version',coalesce(r.version,0))) FROM trace_follows f LEFT JOIN trace_reads r ON f.user_id=r.user_id AND f.target=r.target AND f.kind=r.kind WHERE f.user_id=$1),'[]'::jsonb) AS follows,
   coalesce((SELECT jsonb_agg(to_jsonb(n)) FROM trace_notifications n WHERE n.user_id=$1),'[]'::jsonb) AS notifications`,[user]);
  if(!r.metadata)throw new Error('CLOUD_NOT_MIGRATED');
  const notifications=sortNotifications(r.notifications);
  return{...r.metadata,companies:r.companies,events:r.events,documents:r.documents,historicalDocuments:r.historical_documents,claims:r.claims,user:user?{name:'测试账号'}:null,follows:decorateFollows(r.follows,notifications,r.events),notifications};
 }
 async function action(user,input){
  if(input.action==='read'&&input.kind!=='event')throw new Error('READ_REQUIRES_EVENT');
  await withClient(async c=>{
   const query=input.kind==='company'?'SELECT id FROM trace_companies WHERE id=$1':input.kind==='event'?'SELECT id FROM trace_events WHERE id=$1':null;
   if(!query||!(await c.query(query,[input.target])).rowCount)throw new Error('INVALID_TARGET');
   if(input.action==='follow'){
    const inserted=await c.query("INSERT INTO trace_follows(user_id,target,kind,created_at) VALUES($1,$2,$3,clock_timestamp()) ON CONFLICT DO NOTHING RETURNING target",[user,input.target,input.kind]);
    if(inserted.rowCount&&input.kind==='event')await c.query("INSERT INTO trace_reads(user_id,target,kind,version) SELECT $1,id,'event',current_version FROM trace_events WHERE id=$2 ON CONFLICT(user_id,target,kind) DO UPDATE SET version=greatest(trace_reads.version,excluded.version)",[user,input.target]);
   }else if(input.action==='unfollow')await c.query('DELETE FROM trace_follows WHERE user_id=$1 AND target=$2 AND kind=$3',[user,input.target,input.kind]);
   else if(input.action==='read'){
    const {rows:[event]}=await c.query('SELECT current_version FROM trace_events WHERE id=$1',[input.target]);
    if(!Number.isInteger(input.version)||input.version<0||input.version>event.current_version)throw new Error('INVALID_VERSION');
    await c.query('INSERT INTO trace_reads VALUES($1,$2,$3,$4) ON CONFLICT(user_id,target,kind) DO UPDATE SET version=greatest(trace_reads.version,excluded.version)',[user,input.target,'event',input.version]);
    await c.query('UPDATE trace_notifications SET read_at=coalesce(read_at,clock_timestamp()) WHERE user_id=$1 AND event_id=$2 AND version<=$3',[user,input.target,input.version]);
   }else throw new Error('INVALID_ACTION');
  });
  return snapshot(user);
 }
 return{snapshot,action,async createUser(){const id=crypto.randomBytes(24).toString('hex');await pool.query('INSERT INTO trace_users(id) VALUES($1)',[id]);return id},async hasUser(id){return !!(await pool.query('SELECT 1 FROM trace_users WHERE id=$1',[id])).rowCount},async document(id,hash){const r=await pool.query(hash?'SELECT * FROM trace_document_versions WHERE document_id=$1 AND hash=$2':'SELECT v.* FROM trace_documents d JOIN trace_document_versions v ON d.id=v.document_id AND d.current_hash=v.hash WHERE d.id=$1',hash?[id,hash]:[id]);return r.rows[0]||null}};
}
