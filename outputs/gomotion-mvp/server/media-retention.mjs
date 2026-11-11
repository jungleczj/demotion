import path from 'node:path';

const roots = new Map();

export function retainTaskMedia(work, tasks, assets = new Map()) {
  const root = path.resolve(work), retained = new Set();
  const retain = (file) => {
    if (typeof file !== 'string' || !path.isAbsolute(file)) return;
    const target = path.resolve(file), relative = path.relative(root, target);
    if (relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) retained.add(target);
  };
  for (const task of tasks) {
    const project = task.project || {};
    for (const id of [task.exportId, project.exportId]) if (/^[a-f0-9-]{36}$/.test(id || '')) retain(path.join(root, id));
    const key = project.narrationTrack?.key;
    if (/^[a-f0-9]{64}$/.test(key || '')) retain(path.join(root, 'narration', `${key}.wav`));
    for (const scene of project.scenes || []) {
      const asset = assets.get(scene.selected?.id) || scene.selected;
      retain(asset?.localPath); retain(asset?.thumbnailPath);
      const assetSources = Array.isArray(asset?.sourceAssets) ? asset.sourceAssets : [];
      const sceneSources = Array.isArray(scene.motionGraphic?.sourceAssets) ? scene.motionGraphic.sourceAssets : [];
      for (const source of [...assetSources, ...sceneSources]) { retain(source?.localPath); retain(source?.decodedPath); }
    }
  }
  roots.set(root, retained);
}

export function retainedMedia(file, includeChildren = false) {
  const target = path.resolve(file);
  for (const retained of roots.values()) for (const reference of retained) {
    if (target === reference || target.startsWith(reference + path.sep) || includeChildren && reference.startsWith(target + path.sep)) return true;
  }
  return false;
}
