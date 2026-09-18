import { requireOwner } from '@/lib/server/auth';
import { readMenu, publishMenu } from '@/lib/server/menu-store';
import { checkOrigin, failure, json, readJson } from '@/lib/server/http';
export async function GET() { try { await requireOwner(); return json((await readMenu()).catalog); } catch (error) { return failure(error); } }
export async function PUT(request: Request) { try { checkOrigin(request); await requireOwner(); return json(await publishMenu(await readJson(request))); } catch (error) { return failure(error); } }
