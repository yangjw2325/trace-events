import {digest} from './providers.js';
// Caller owns a transaction. Version, evidence and notifications commit together.
export async function publishDecision(c,{doc,topic,decision,expectedVersion,now=new Date().toISOString()}){
 const isNew=decision.event_id==='new';const id=isNew?'evt-'+digest({document:doc.id,topic:topic.title}).slice(0,20):decision.event_id;
 if(isNew)await c.query('INSERT INTO trace_events VALUES($1,1,$2) ON CONFLICT DO NOTHING',[id,{id,title:decision.title,kind:decision.kind,companies:topic.company_ids,roles:decision.roles||{},documents:[],relations:[],uncertainties:[]}]);
 const prior=(await c.query('SELECT * FROM trace_events WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!prior)throw new Error('EVENT_NOT_FOUND');if(!isNew&&prior.current_version!==expectedVersion)throw new Error('EVENT_VERSION_CHANGED');
 const docs=[...new Set([...(prior.payload.documents||[]),doc.id])];const refs=(await c.query('SELECT d.id,d.current_hash AS hash FROM trace_documents d WHERE d.id=ANY($1::text[])',[docs])).rows;
 for(const ref of refs)if(ref.id===doc.id)ref.hash=doc.sha256;
 const changed=isNew||decision.material_change;const n=isNew?1:prior.current_version+(changed?1:0);
 for(const companyId of topic.company_ids)await c.query('INSERT INTO trace_event_companies VALUES($1,$2) ON CONFLICT DO NOTHING',[id,companyId]);
 await c.query('INSERT INTO trace_event_evidence VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,doc.id,doc.sha256]);
 for(const claim of topic.claims)await c.query('INSERT INTO trace_claims VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[claim.id,doc.id,doc.sha256,claim]);
 if(!changed){await c.query('UPDATE trace_events SET payload=jsonb_set(payload,\'{documents}\',$2::jsonb) WHERE id=$1',[id,JSON.stringify(docs)]);return{event_id:id,version:n,changed:false,notifications:0}}
 const previous=prior.payload.summary||null;
 const version={version:n,date:doc.published_date,disclosed_at:doc.published_date,generated_at:now,summary:decision.summary,status:decision.status,reason:decision.reason,evidence_claim_ids:decision.evidence_claim_ids,input_document_ids:docs,evidence_documents:refs,change_kind:decision.change_kind,mode:'live_ingestion'};
 await c.query('INSERT INTO trace_event_versions VALUES($1,$2,$3)',[id,n,version]);
 const relations=[...(prior.payload.relations||[]),...(decision.relations||[]).map(r=>({...r,source_document_id:doc.id,source_hash:doc.sha256}))];const payload={...prior.payload,id,title:decision.title,kind:decision.kind,status:decision.status,summary:decision.summary,date:doc.published_date,updated_at:now,companies:[...new Set([...(prior.payload.companies||[]),...topic.company_ids])],roles:{...(prior.payload.roles||{}),...(decision.roles||{})},documents:docs,relations,uncertainties:decision.uncertainties||[],importantVersion:n};
 await c.query('UPDATE trace_events SET current_version=$2,payload=$3 WHERE id=$1',[id,n,payload]);
 for(const relation of decision.relations||[])await c.query('INSERT INTO trace_claim_relations(id,event_id,payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[digest({event:id,version:n,relation}),id,relation]);
 const fields=(decision.relations||[]).filter(r=>r.type==='correction'&&r.before&&r.after).map(r=>({label:r.field||'更正内容',before:r.before,after:r.after}));
 const change={notification_type:isNew?'new_event':'event_change',company_ids:payload.companies,event_title:payload.title,before_status:prior.payload.status||null,after_status:decision.status,fields,before:previous,after:decision.summary,reason:decision.reason,date:doc.published_date,generated_at:now,source_document_id:doc.id,source_hash:doc.sha256,change_kind:decision.change_kind};
 await c.query('INSERT INTO trace_changes VALUES($1,$2,$3,$4,now())',[id,n,decision.change_kind,change]);
 const notifications=await c.query(`INSERT INTO trace_notifications(user_id,event_id,version,payload)
 SELECT f.user_id,$1::text,$2::integer,$3::jsonb||jsonb_build_object('follow_reasons',jsonb_agg(jsonb_build_object('kind',f.kind,'target',f.target,'followed_at',f.created_at))) FROM trace_follows f WHERE (f.kind='event' AND f.target=$1) OR (f.kind='company' AND f.target=ANY($4::text[])) GROUP BY f.user_id ON CONFLICT DO NOTHING`,[id,n,change,payload.companies]);
 return{event_id:id,version:n,changed:true,notifications:notifications.rowCount};
}
