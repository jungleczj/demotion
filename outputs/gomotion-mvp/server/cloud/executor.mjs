import { Sandbox } from '@vercel/sandbox';

// Credentials are injected only at execution, never into the reusable snapshot.
const providerEnv = ['GEMINI_API_KEY', 'VISION_API_KEY', 'VISION_BASE_URL', 'VISION_MODEL', 'TTS_MODEL', 'PEXELS_API_KEY', 'PIXABAY_API_KEY', 'COVERR_API_KEY', 'YOUTUBE_API_KEY', 'YOUTUBE_DISCOVERY', 'LLM_API_KEY', 'LLM_BASE_URL', 'LLM_MODEL', 'TEXT_AI_PROVIDER'];
export function createSandboxExecutor({ sdk = Sandbox, env = process.env } = {}) {
  return {
    async start({ task, callbackURL, workerToken, checkpoint }) {
      const name = `gomotion-${task.id}-${task.attempt}`;
      const sandbox = await sdk.getOrCreate({ name, source: { type: 'snapshot', snapshotId: env.GOMOTION_SANDBOX_SNAPSHOT }, persistent: false, timeout: 45 * 60_000, resources: { vcpus: 4 } });
      const envelope = { version: 1, taskId: task.id, attempt: task.attempt, input: task.input, callbackURL, workerToken, checkpoint, ...(env.VERCEL_AUTOMATION_BYPASS_SECRET ? { callbackBypass: env.VERCEL_AUTOMATION_BYPASS_SECRET } : {}) };
      await sandbox.writeFiles([{ path: '/vercel/sandbox/gomotion-task.json', content: Buffer.from(JSON.stringify(envelope)) }]);
      const runEnv = Object.fromEntries(providerEnv.filter((key) => env[key]).map((key) => [key, env[key]]));
      const command = await sandbox.runCommand({ cmd: 'node', args: ['server/cloud/worker.mjs', '/vercel/sandbox/gomotion-task.json'], cwd: '/vercel/sandbox/app', detached: true, env: { ...runEnv, NODE_ENV: 'production', GOMOTION_DATA_DIR: '/vercel/sandbox/work', PORT: '3027', HOST: '127.0.0.1', CAPTION_FONTS_DIR: '/usr/share/fonts/opentype/noto', MOTION_FONT_FILE: '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', MOTION_FONT_FAMILY: 'Noto Sans CJK SC', MOTION_SYSTEM_FONTS: '1' } });
      return { name, commandId: command.cmdId };
    },
    async stop(execution) { if (execution?.name) await (await sdk.get({ name: execution.name, resume: false })).stop(); },
    async state(execution) {
      try {
        const sandbox = await sdk.get({ name: execution.name, resume: false });
        if (sandbox.status !== 'running') return 'stopped';
        if (!execution.commandId) return 'unknown';
        return (await sandbox.getCommand(execution.commandId)).exitCode === null ? 'running' : 'exited';
      } catch (e) { return /not.?found/i.test(e.code || e.message || '') ? 'stopped' : 'unknown'; }
    },
  };
}
