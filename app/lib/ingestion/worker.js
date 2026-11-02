import {getPool} from '../cloud-client.js';
import {createPostgresStore} from '../postgres-store.js';
import {processQueueItem,safeError} from './daily.js';

export function retryable(code){return /^(SOURCE_HTTP_(429|5\d\d)|TimeoutError|TypeError|ECONNRESET|ETIMEDOUT|EAI_AGAIN|EVENT_VERSION_CHANGED|IFIND_TOOL_FAILED)$/.test(code)}

// One worker per workflow; row locks also protect manual concurrent invocations.
export async function drainQueue({maxItems=40,budgetMs=25*60*1000,pool=getPool(),snapshot=()=>createPostgresStore().snapshot(null),process=processQueueItem}={}){
 const deadline=Date.now()+budgetMs,processed=[];
 await pool.query("UPDATE trace_queue SET status='pending' WHERE status='processing' AND (detail->>'lease_until')::timestamptz<now()");
 await pool.query("UPDATE trace_queue SET status='pending' WHERE status='retry' AND attempts<3");
 for(let n=0;n<maxItems&&Date.now()<deadline;n++){
  const claimed=await pool.query(`UPDATE trace_queue SET status='processing',updated_at=now(),detail=detail||jsonb_build_object('lease_until',now()+interval '10 minutes')
   WHERE id=(SELECT id FROM trace_queue WHERE status='pending' AND source_kind IN ('notice','news') ORDER BY CASE source_kind WHEN 'notice' THEN 0 ELSE 1 END,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`);
  if(!claimed.rowCount){const retry=await pool.query("UPDATE trace_queue SET status='pending' WHERE status='retry' AND attempts<3 RETURNING id");if(!retry.rowCount)break;await new Promise(r=>setTimeout(r,1000));continue}const row=claimed.rows[0];
  try{const data=await snapshot(),result=await process(pool,row,data),status=result.review?'review':'processed';
   await pool.query('UPDATE trace_queue SET status=$2,detail=$3,attempts=attempts+1,updated_at=now() WHERE id=$1',[row.id,status,result]);processed.push({id:row.id,status,result});
  }catch(e){const error=safeError(e),status=retryable(error)&&row.attempts<2?'retry':'review';await pool.query('UPDATE trace_queue SET status=$2,detail=$3,attempts=attempts+1,updated_at=now() WHERE id=$1',[row.id,status,{error}]);processed.push({id:row.id,status,error})}
 }
 const counts=(await pool.query('SELECT status,count(*)::int AS count FROM trace_queue GROUP BY status')).rows;
 const remaining=counts.filter(x=>['pending','processing','retry'].includes(x.status)).reduce((n,x)=>n+x.count,0),review=counts.find(x=>x.status==='review')?.count||0;
 const result={processed,counts,remaining,review};await pool.query("INSERT INTO trace_runs(kind,status,detail) VALUES('queue_worker',$1,$2)",[remaining?'partial':'completed',result]);
 await pool.query("UPDATE trace_metadata SET payload=jsonb_set(jsonb_set(payload,'{dataStatus,pending}',$1::jsonb),'{dataStatus,review}',$2::jsonb) WHERE id='dataset'",[JSON.stringify(remaining),JSON.stringify(review)]);
 return result;
}
