import path from 'node:path';
import { realpathSync } from 'node:fs';

const roots = new Map();
const actualPath = (file) => {
  try { return realpathSync(file); } catch { return path.resolve(file); }
};

export function retainTaskMedia(work, tasks, assets = new Map()) {
  const root = actualPath(work), retained = new Set();
  const retain = (file) => {
    if (typeof file !== 'string' || !path.isAbsolute(file)) return;
    const target = actualPath(file), relative = path.relative(root, target);
    if (relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) retained.add(target);
  };
  for (const task of tasks) {
    const project = task.project || {};
    const musicFile = project.music?.source?.localPath;
    if (project.music?.mixed === true && typeof musicFile === 'string') { retain(musicFile); retain(`${musicFile}.json`); }
    for (const id of [task.exportId, project.exportId]) if (/^[a-f0-9-]{36}$/.test(id || '')) retain(path.join(root, id));
    const key = project.narrationTrack?.key;
    if (/^[a-f0-9]{64}$/.test(key || '')) retain(path.join(root, 'narration', `${key}.wav`));
    for (const scene of project.scenes || []) {
      const asset = assets.get(scene.selected?.id) || scene.selected;
      retain(asset?.localPath); retain(asset?.thumbnailPath);
      for (const key of [asset?.playbackKey, ...(Array.isArray(asset?.playbackAliases) ? asset.playbackAliases : [])]) {
        if (/^[a-f0-9]{64}$/.test(key || '')) for (const extension of ['mp4', 'jpg']) retain(path.join(root, 'playback', `${key}.${extension}`));
      }
      const assetSources = Array.isArray(asset?.sourceAssets) ? asset.sourceAssets : [];
      const sceneSources = Array.isArray(scene.motionGraphic?.sourceAssets) ? scene.motionGraphic.sourceAssets : [];
      for (const source of [...assetSources, ...sceneSources]) { retain(source?.localPath); retain(source?.decodedPath); }
    }
  }
  roots.set(root, retained);
}

export function retainedMedia(file, includeChildren = false) {
  const target = actualPath(file);
  for (const retained of roots.values()) for (const reference of retained) {
    if (target === reference || target.startsWith(reference + path.sep) || includeChildren && reference.startsWith(target + path.sep)) return true;
  }
  return false;
}
