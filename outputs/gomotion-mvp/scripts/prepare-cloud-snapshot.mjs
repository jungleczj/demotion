import { Sandbox } from '@vercel/sandbox';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { acquireDefaultMusic } from '../server/music-sources.mjs';

// Run only when cloud resource usage has been authorized. No provider keys,
// .env files, local media, Git metadata or Darwin dependencies enter the image.
const root = fileURLToPath(new URL('../', import.meta.url));
const files = [];
async function collect(relative) {
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) await collect(name);
    else if (!/\.test\.mjs$/.test(name) && /\.(?:mjs|json)$/.test(name)) files.push({ path: `/vercel/sandbox/app/${name}`, content: await readFile(path.join(root, name)) });
  }
}
for (const relative of ['server', 'shared']) await collect(relative);
for (const name of ['package.json', 'package-lock.json']) files.push({ path: `/vercel/sandbox/app/${name}`, content: await readFile(path.join(root, name)) });
const previous = process.argv.find((arg) => arg.startsWith('--from='))?.slice(7);
const warmMusic = process.argv.includes('--with-music') ? await acquireDefaultMusic(path.join(root, 'work/music-sources'), { signal: AbortSignal.timeout(15000), fetch: async () => { throw Error('Snapshot music requires an already verified local cache'); } }) : null;
if (warmMusic) {
  const name = path.basename(warmMusic.localPath), target = `/vercel/sandbox/work/music-sources/${name}`;
  const receipt = { ...warmMusic, localPath: target };
  files.push({ path: target, content: await readFile(warmMusic.localPath) }, { path: `${target}.json`, content: Buffer.from(JSON.stringify(receipt, null, 2)) });
}
const sandbox = await Sandbox.create({ ...(previous ? { source: { type: 'snapshot', snapshotId: previous } } : { image: 'vercel/sandbox/universal' }), persistent: false, timeout: 10 * 60_000, resources: { vcpus: 4 } });
try {
  const command = async (cmd, args, options = {}) => {
    const result = await sandbox.runCommand({ cmd, args, ...options });
    if (result.exitCode !== 0) throw Error(`Cloud preparation failed: ${cmd} (${result.exitCode})`);
  };
  if (!previous) {
    await command('apt-get', ['update', '-qq'], { sudo: true });
    await command('apt-get', ['install', '-y', '--no-install-recommends', 'ffmpeg', 'fonts-noto-cjk', 'fonts-noto-core', 'ca-certificates'], { sudo: true });
  }
  await sandbox.writeFiles(files);
  if (!previous) await command('npm', ['ci', '--omit=dev', '--ignore-scripts'], { cwd: '/vercel/sandbox/app' });
  await command('ffmpeg', ['-hide_banner', '-version']);
  await command('ffprobe', ['-hide_banner', '-version']);
  if (warmMusic) await command('node', ['--input-type=module', '-e', "import { acquireDefaultMusic } from './server/music-sources.mjs'; await acquireDefaultMusic('/vercel/sandbox/work/music-sources', { signal: AbortSignal.timeout(15000), fetch: async () => { throw Error('Snapshot cache attempted a network request'); } });"], { cwd: '/vercel/sandbox/app' });
  await command('node', ['--input-type=module', '-e', "import { Resvg } from '@resvg/resvg-js'; import { stat } from 'node:fs/promises'; await stat('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'); new Resvg('<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"4\" height=\"4\"><rect width=\"4\" height=\"4\" fill=\"red\"/></svg>').render().asPng();"], { cwd: '/vercel/sandbox/app' });
  const snapshot = await sandbox.snapshot({ expiration: 14 * 86400_000 });
  process.stdout.write(JSON.stringify({ snapshotId: snapshot.snapshotId, sourceFiles: files.length, createdAt: new Date().toISOString(), providerCalls: 0, musicCache: warmMusic ? { id: warmMusic.id, bytes: warmMusic.bytes, sha256: warmMusic.sha256, license: warmMusic.license, cloudCacheDecodePassed: true } : null }) + '\n');
} finally { await sandbox.stop(); }
