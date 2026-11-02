import {cloudConfigured} from '../lib/config.js';import {getPool,getStorage} from '../lib/cloud-client.js';import crypto from 'node:crypto';
if(!cloudConfigured()){console.log('云端尚未配置，未发送请求。');process.exit(2)}
const pool=getPool();let c;
try{c=await pool.connect();await c.query('BEGIN');
const counts=await c.query('SELECT (SELECT count(*) FROM trace_companies)::int AS companies,(SELECT count(*) FROM trace_events)::int AS events,(SELECT count(*) FROM trace_documents)::int AS documents,(SELECT count(*) FROM trace_event_versions)::int AS versions');console.log('云端记录数：'+JSON.stringify(counts.rows[0]));
const user=crypto.randomBytes(24).toString('hex');await c.query('INSERT INTO trace_users(id) VALUES($1)',[user]);await c.query("INSERT INTO trace_follows(user_id,target,kind) SELECT $1,id,'event' FROM trace_events LIMIT 1",[user]);let f=await c.query('SELECT count(*)::int AS n FROM trace_follows WHERE user_id=$1',[user]);if(f.rows[0].n!==1)throw new Error('USER_WRITE_CHECK_FAILED');
await c.query('SAVEPOINT immutable_check');let protectedVersion=false;try{await c.query("UPDATE trace_event_versions SET payload=payload WHERE (event_id,version) IN (SELECT event_id,version FROM trace_event_versions LIMIT 1)")}catch{protectedVersion=true;await c.query('ROLLBACK TO SAVEPOINT immutable_check')}if(!protectedVersion)throw new Error('HISTORY_NOT_PROTECTED');
const source=(await c.query('SELECT storage_path,hash FROM trace_document_versions LIMIT 1')).rows[0];if(!source)throw new Error('NO_EVIDENCE');const {data,error}=await getStorage().download(source.storage_path);if(error||crypto.createHash('sha256').update(Buffer.from(await data.arrayBuffer())).digest('hex')!==source.hash)throw new Error('STORAGE_HASH_CHECK_FAILED');
await c.query('ROLLBACK');console.log('检查通过：数据库连接、体验用户写入、历史版本保护、私有PDF读取及哈希；测试写入已回滚。');
}catch(e){if(c)await c.query('ROLLBACK').catch(()=>{});console.error('检查未通过：'+(e.code||e.name)+'；不输出连接信息。');process.exitCode=1}finally{c?.release();await pool.end()}
