import http from 'node:http';
import { execFileSync } from 'node:child_process';

export function configureNetwork() {
  let source = 'direct';
  let proxy = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;
  if (proxy) source = 'environment';
  if (!proxy && process.platform === 'darwin') {
    try {
      const settings = execFileSync('/usr/sbin/scutil', ['--proxy'], { encoding: 'utf8', timeout: 2000 });
      const host = settings.match(/\bHTTPSProxy\s*:\s*(\S+)/)?.[1];
      const port = settings.match(/\bHTTPSPort\s*:\s*(\d+)/)?.[1];
      if (/\bHTTPSEnable\s*:\s*1\b/.test(settings) && host && port) {
        proxy = `http://${host.includes(':') ? `[${host}]` : host}:${port}`;
        source = 'macOS-system';
      }
    } catch {}
  }
  if (!proxy) return { source, configured: false };
  const url = new URL(proxy);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('服务代理需要 HTTP(S) CONNECT 地址');
  if (typeof http.setGlobalProxyFromEnv !== 'function') throw new Error('自动读取系统代理需要 Node.js 25.4+；请升级 Node 后重启');
  const noProxy = `${process.env.no_proxy || process.env.NO_PROXY || ''},localhost,127.0.0.1,::1`;
  http.setGlobalProxyFromEnv({ HTTPS_PROXY: proxy, HTTP_PROXY: proxy, NO_PROXY: noProxy });
  return { source, configured: true, address: `${url.protocol}//${url.hostname}:${url.port || 'default'}` };
}
