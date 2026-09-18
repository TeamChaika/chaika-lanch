import { login, logout, requireOwner } from '@/lib/server/auth';
import { checkOrigin, failure, json, readJson } from '@/lib/server/http';
export const runtime = 'nodejs';
export async function GET() { try { await requireOwner(); return json({ authenticated: true }); } catch (error) { return failure(error); } }
export async function POST(request: Request) { try { checkOrigin(request); await login(await readJson(request, 2000)); return json({ authenticated: true }); } catch (error) { return failure(error); } }
export async function DELETE(request: Request) { try { checkOrigin(request); await logout(); return json({ authenticated: false }); } catch (error) { return failure(error); } }
