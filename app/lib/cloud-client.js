import './config.js';
import fs from 'node:fs';
import pg from 'pg';import {createClient} from '@supabase/supabase-js';import {validateDatabaseUrl} from './config.js';
export function getPool(){if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL missing');if(!globalThis.__tracePool)globalThis.__tracePool=new pg.Pool({connectionString:strictConnectionUrl(),max:3,connectionTimeoutMillis:15000,idleTimeoutMillis:15000,ssl:{ca:fs.readFileSync(new URL('../db/certs/supabase-ca.crt',import.meta.url),'utf8'),rejectUnauthorized:true}});return globalThis.__tracePool}
export function getStorage(bucket='trace-originals'){if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY)throw new Error('Supabase storage configuration missing');const u=new URL(process.env.SUPABASE_URL);if(u.protocol!=='https:'||!u.hostname.endsWith('.supabase.co'))throw new Error('Invalid Supabase project URL');return createClient(u.origin,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}}).storage.from(bucket)}

function strictConnectionUrl(){const u=new URL(validateDatabaseUrl(process.env.DATABASE_URL));for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])u.searchParams.delete(k);return u.toString()}
