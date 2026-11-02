import fs from 'node:fs';import path from 'node:path';
// Credentials remain server-only. Local commands and Next share the existing workspace file.
const env=path.resolve(process.cwd(),'..','.env.local');
if(fs.existsSync(env))process.loadEnvFile(env);
export function cloudConfigured(){return ['DATABASE_URL','SUPABASE_URL','SUPABASE_SECRET_KEY'].every(k=>!!process.env[k])}
export function validateDatabaseUrl(raw){const u=new URL(raw);if(!['postgres:','postgresql:'].includes(u.protocol)||!u.hostname.endsWith('.supabase.com')&&!u.hostname.endsWith('.supabase.co'))throw new Error('DATABASE_URL must point to the selected Supabase project');return raw}
