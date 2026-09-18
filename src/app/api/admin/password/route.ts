import { changePassword } from '@/lib/server/auth';
import { checkOrigin, failure, json, readJson } from '@/lib/server/http';
export async function PUT(request: Request) { try { checkOrigin(request); await changePassword(await readJson(request, 2000)); return json({ ok: true }); } catch (error) { return failure(error); } }
