import { randomBytes, scryptSync } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

// Files stay local and are ignored by Git. Never print credentials to the terminal.
const password = randomBytes(24).toString('base64url');
const salt = randomBytes(16).toString('hex');
const values = {
  SESSION_SECRET: randomBytes(40).toString('base64url'),
  OWNER_PASSWORD_HASH: `${salt}:${scryptSync(password, salt, 64).toString('hex')}`,
};
await mkdir('research/owner-setup', { recursive: true });
await writeFile('research/owner-setup/server-env.json', JSON.stringify(values, null, 2), { flag: 'wx', mode: 0o600 });
await writeFile('research/owner-setup/owner-access.txt', `Адрес: https://lunch.chaika.team/admin\nПервоначальный пароль: ${password}\n\nПосле первого входа смените пароль кнопкой «Пароль».\n`, { flag: 'wx', mode: 0o600 });
console.log('Initial owner settings saved in research/owner-setup. Values were not printed.');
