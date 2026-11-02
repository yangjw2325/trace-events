import{createHash}from'node:crypto';import{lookup}from'node:dns/promises';
const base='https://trace-events.vercel.app';console.log('Production DNS:',await lookup(new URL(base).hostname,{all:true}));
let r=await fetch(base+'/');if(r.status!==200)throw Error('HOME_HTTP_'+r.status);
r=await fetch(base+'/api/cron/daily');if(r.status!==401)throw Error('CRON_AUTH_NOT_ENFORCED');
const data=await(await fetch(base+'/api/data')).json();
if(!data.dataStatus.scheduled)throw Error('SCHEDULE_NOT_ENABLED');
for(const event of data.events.filter(e=>e.id.startsWith('evt-'))){for(const id of event.documents){const doc=data.documents.find(d=>d.id===id);const response=await fetch(base+'/api/source/'+id+'?hash='+doc.sha256);if(!response.ok)throw Error('SNAPSHOT_HTTP_'+response.status);const hash=createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');if(hash!==doc.sha256)throw Error('SNAPSHOT_HASH_MISMATCH');console.log('Snapshot verified:',doc.title,doc.completeness)}}
console.log(JSON.stringify({companies:data.companies.length,events:data.events.length,scheduled:data.dataStatus.scheduled,pending:data.dataStatus.pending,lastTask:data.dataStatus.lastTask}));
