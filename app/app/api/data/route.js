import {NextResponse} from 'next/server';
import {getStore} from '../../../lib/store.js';
import {getUser} from '../../../lib/session.js';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req){return NextResponse.json(await (await getStore()).snapshot(await getUser(req)),{headers:{'Cache-Control':'private, no-store'}})}
