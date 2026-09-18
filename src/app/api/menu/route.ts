import { readMenu } from '@/lib/server/menu-store';
import { failure, json } from '@/lib/server/http';
export const dynamic = 'force-dynamic';
export async function GET() { try { return json((await readMenu()).catalog); } catch (error) { return failure(error); } }
