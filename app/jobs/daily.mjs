import{getPool}from'../lib/cloud-client.js';import{migrateIngestion,runDaily,safeError}from'../lib/ingestion/daily.js';
try{await migrateIngestion();let result=await runDaily({maxDocuments:process.argv.includes('--collect-only')?0:1});console.log(JSON.stringify(result,null,2))}catch(e){console.error('任务未完成：'+safeError(e));process.exitCode=1}finally{await getPool().end()}
