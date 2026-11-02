import{getPool}from'../lib/cloud-client.js';
import{runDaily,safeError}from'../lib/ingestion/daily.js';
import{drainQueue}from'../lib/ingestion/worker.js';
const pool=getPool();
try{
 const collection=await runDaily({maxDocuments:0});
 const worker=await drainQueue();
 const failed=(collection.sources||[]).some(s=>['failed','truncated'].includes(s.status));
 const status=failed||worker.remaining?'partial':'completed';
 const execution={collection,worker,status,finished_at:new Date().toISOString()};
 await pool.query("INSERT INTO trace_runs(kind,status,detail) VALUES('daily_automation',$1,$2)",[status,execution]);
 await pool.query("UPDATE trace_metadata SET payload=jsonb_set(payload,'{dataStatus}',coalesce(payload->'dataStatus','{}'::jsonb)||$1::jsonb) WHERE id='dataset'",[JSON.stringify({label:status==='completed'?'最近采集任务已完成':'最近采集任务部分完成',scheduled:process.env.CRON_SCHEDULE_ENABLED==='true',scheduler:'github-actions',lastTask:new Date().toISOString(),pending:worker.remaining,review:worker.review})]);
 if(!collection.skipped)await pool.query('UPDATE trace_daily_jobs SET status=$2,detail=detail||$3::jsonb,finished_at=now() WHERE id=$1',[collection.jobId,status,JSON.stringify({worker})]);
 console.log(JSON.stringify(execution,null,2));
 if(status==='partial')process.exitCode=1;
}catch(e){const error=safeError(e);console.error('自动任务失败：'+error);await pool.query("INSERT INTO trace_runs(kind,status,detail) VALUES('daily_automation','failed',$1)",[{error}]).catch(()=>{});process.exitCode=1}finally{await pool.end()}
