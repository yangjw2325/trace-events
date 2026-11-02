import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {createClient} from '@supabase/supabase-js';import {getPool,getStorage} from '../lib/cloud-client.js';import {cloudConfigured} from '../lib/config.js';
if(!cloudConfigured()){console.log('尚未配置：'+['DATABASE_URL','SUPABASE_URL','SUPABASE_SECRET_KEY'].filter(k=>!process.env[k]).join('、'));process.exit(2)}
const pool=getPool();let client;
try{
 client=await pool.connect();await client.query(fs.readFileSync(new URL('./migrations/001_cloud.sql',import.meta.url),'utf8'));
 const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
 const {data:buckets,error:listError}=await sb.storage.listBuckets();if(listError)throw new Error('STORAGE_LIST_FAILED');
 const existing=buckets.find(b=>b.id==='trace-originals');if(existing?.public)throw new Error('EXPECTED_PRIVATE_BUCKET');
 if(!existing){const {error}=await sb.storage.createBucket('trace-originals',{public:false,allowedMimeTypes:['application/pdf'],fileSizeLimit:10485760});if(error)throw new Error('STORAGE_CREATE_FAILED')}
 const dataset=JSON.parse(fs.readFileSync(new URL('../data/dataset.json',import.meta.url),'utf8'));
 for(const doc of dataset.documents){
  const storagePath=`${doc.id}/${doc.sha256}.pdf`;const raw=fs.readFileSync(path.resolve(process.cwd(),'..','references','verified-originals',doc.id+'.pdf'));
  if(crypto.createHash('sha256').update(raw).digest('hex')!==doc.sha256)throw new Error('SOURCE_HASH_MISMATCH');
  const {data:old,error:findError}=await getStorage().list(doc.id,{search:doc.sha256+'.pdf'});if(findError)throw new Error('STORAGE_LOOKUP_FAILED');
  if(old.some(x=>x.name===doc.sha256+'.pdf')){const {data:blob,error}=await getStorage().download(storagePath);if(error||crypto.createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex')!==doc.sha256)throw new Error('STORED_HASH_MISMATCH')}
  else{const {error}=await getStorage().upload(storagePath,raw,{contentType:'application/pdf',upsert:false});if(error)throw new Error('SOURCE_UPLOAD_FAILED')}
 }
 await client.query('BEGIN');
 for(const c of dataset.companies)await client.query('INSERT INTO trace_companies VALUES($1,$2) ON CONFLICT(id) DO NOTHING',[c.id,c]);
 for(const doc of dataset.documents){
  await client.query('INSERT INTO trace_documents VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',[doc.id,doc.sha256,doc]);
  let old=await client.query('SELECT payload FROM trace_document_versions WHERE document_id=$1 AND hash=$2',[doc.id,doc.sha256]);
  if(old.rowCount){const eq=await client.query('SELECT payload=$3::jsonb AS equal FROM trace_document_versions WHERE document_id=$1 AND hash=$2',[doc.id,doc.sha256,JSON.stringify(doc)]);if(!eq.rows[0].equal)throw new Error('IMMUTABLE_SOURCE_METADATA_CONFLICT')}
  else await client.query('INSERT INTO trace_document_versions VALUES($1,$2,$3,$4)',[doc.id,doc.sha256,doc,`${doc.id}/${doc.sha256}.pdf`]);
 }
 for(const c of dataset.claims){const documentId=dataset.documents.find(d=>c.id.startsWith(d.id+':'))?.id;const doc=dataset.documents.find(d=>d.id===documentId);if(!doc)throw new Error('CLAIM_SOURCE_MISSING');await client.query('INSERT INTO trace_claims VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',[c.id,doc.id,doc.sha256,c])}
 for(const e of dataset.events){
  const {versions,...payload}=e;await client.query('INSERT INTO trace_events VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',[e.id,e.importantVersion,payload]);
  for(const companyId of e.companies)await client.query('INSERT INTO trace_event_companies VALUES($1,$2) ON CONFLICT DO NOTHING',[e.id,companyId]);
  for(const version of versions){let old=await client.query('SELECT payload=$3::jsonb AS equal FROM trace_event_versions WHERE event_id=$1 AND version=$2',[e.id,version.version,JSON.stringify(version)]);if(old.rowCount&&!old.rows[0].equal)throw new Error('IMMUTABLE_JUDGMENT_CONFLICT');if(!old.rowCount)await client.query('INSERT INTO trace_event_versions VALUES($1,$2,$3)',[e.id,version.version,version])}
 }
 const {companies,events,documents,claims,...metadata}=dataset;await client.query("INSERT INTO trace_metadata VALUES('dataset',$1) ON CONFLICT(id) DO NOTHING",[metadata]);
 await client.query('COMMIT');
 console.log('云端迁移完成：公司、事件、原文版本、说法与判断历史已入库；原文PDF存放于私有存储。');
}catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});console.error('迁移未完成：'+(e.code||(/^[A-Z_]+$/.test(e.message||'')?e.message:e.name))+'；不输出连接信息。');process.exitCode=1}finally{client?.release();await pool.end()}
