import { spawn } from 'node:child_process';
export function run(command, args, signal, captureErrors = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], signal });
    let output = '', errors = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { errors = (errors + chunk).slice(-6000); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(captureErrors ? errors : output) : reject(new Error(signal?.aborted ? '任务已取消' : `${command} 处理失败：${errors.slice(-1000)}`)));
  });
}

export async function probe(file, signal) {
  const output = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', file], signal);
  const data = JSON.parse(output);
  const video = data.streams?.find((stream) => stream.codec_type === 'video');
  return { hasAudio: data.streams?.some((s) => s.codec_type === 'audio') || false, duration: Number(data.format?.duration) || 0, width: video?.width || 0, height: video?.height || 0 };
}
