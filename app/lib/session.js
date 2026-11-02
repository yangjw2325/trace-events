import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {getStore} from './store.js';
function secret(){if(process.env.SESSION_SECRET)return process.env.SESSION_SECRET;if(process.env.STORAGE_DRIVER==='postgres')throw new Error('SESSION_SECRET required');const file=path.join(process.cwd(),'data','.session-secret');if(!fs.existsSync(file))fs.writeFileSync(file,crypto.randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});return fs.readFileSync(file,'utf8')}
function sign(id){return crypto.createHmac('sha256',secret()).update(id).digest('hex')}
export async function getUser(req){const cookie=req.cookies.get('trace_session')?.value;if(!cookie)return null;const[id,sig]=cookie.split('.');if(!/^[a-f0-9]{48}$/.test(id||'')||!/^[a-f0-9]{64}$/.test(sig||''))return null;if(!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(sign(id))))return null;return await (await getStore()).hasUser(id)?id:null}
export function attachSession(response,user,secure=true){response.cookies.set('trace_session',`${user}.${sign(user)}`,{httpOnly:true,sameSite:'lax',secure,path:'/',maxAge:60*60*24*30});return response}
