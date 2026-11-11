import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function deploymentConfig(backend) {
  let url;
  try { url = new URL(backend); } catch { throw new Error('请提供后台 HTTPS 地址，例如 https://api.example.com'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || ['localhost', '127.0.0.1', '[::1]', 'gomotion-mvp.vercel.app'].includes(url.hostname) || url.hostname.endsWith('.localhost')) throw new Error('后台需为独立、公开可访问的 HTTPS 来源地址，不含路径、凭证，不能指向本机或前端自身');
  return {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    framework: 'vite', buildCommand: 'npm run build', outputDirectory: 'dist',
    rewrites: [
      { source: '/api/:path*', destination: `${url.origin}/api/:path*` },
      { source: '/(.*)', destination: '/index.html' },
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = deploymentConfig(process.argv[2]);
    const file = new URL('../vercel.json', import.meta.url);
    await writeFile(file, JSON.stringify(config, null, 2) + '\n');
    console.log('已生成应用目录 vercel.json；推送后由 Vercel 重新部署。');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
