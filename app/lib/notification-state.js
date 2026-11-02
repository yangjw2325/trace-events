// Shared by both stores and the browser. No credentials or server dependencies.
export function notificationKind(note){
 return note.payload?.notification_type||((note.payload?.change_kind==='initial'||(!note.payload?.before&&note.version===1))?'new_event':'event_change');
}
function micros(value){
 const text=String(value||''),ms=Date.parse(text);if(!Number.isFinite(ms))return 0;
 return ms*1000+Number((text.match(/\.(\d+)/)?.[1]||'').padEnd(6,'0').slice(3,6));
}
export function notificationsForFollow(follow,notes,events,{unreadOnly=true}={}){
 return notes.filter(note=>{
  if(unreadOnly&&note.read_at)return false;
  const reasons=note.payload?.follow_reasons;
  if(Array.isArray(reasons))return reasons.some(r=>r.kind===follow.kind&&r.target===follow.target&&micros(r.followed_at)===micros(follow.created_at));
  // Older notices did not save the matched subscriptions; retain them without
  // treating notices from an earlier subscription as new after re-following.
  const belongs=follow.kind==='event'?note.event_id===follow.target:(note.payload?.company_ids||events.find(e=>e.id===note.event_id)?.companies||[]).includes(follow.target);
  return belongs&&micros(note.payload?.generated_at||note.created_at)>micros(follow.created_at);
 });
}
export function decorateFollows(follows,notes,events){return follows.map(f=>{const count=notificationsForFollow(f,notes,events).length;return{...f,unread:count>0,unread_count:count}})}
export function sortNotifications(notes){return notes.toSorted((a,b)=>micros(b.payload?.generated_at||b.created_at)-micros(a.payload?.generated_at||a.created_at)||b.version-a.version||a.event_id.localeCompare(b.event_id))}
export function notificationLabel(note){return notificationKind(note)==='new_event'?'新增事件':({correction:'事件变化 · 更正',denial:'事件变化 · 否认',conflict:'事件变化 · 冲突',progress:'事件变化 · 进展'})[note.payload?.change_kind]||'事件变化'}

export function mergeNotificationSnapshots(previous,incoming){const merged=new Map(previous.map(n=>[n.event_id+':'+n.version,n]));for(const note of incoming){const key=note.event_id+':'+note.version,old=merged.get(key);merged.set(key,{...note,read_at:old?.read_at||note.read_at||null})}return sortNotifications([...merged.values()])}
