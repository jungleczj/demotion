export function editScene(scene, patch) {
  const mediaChanged = ['selected', 'start', 'duration', 'text'].some((key) => key in patch);
  const sourceChanged = 'selected' in patch && patch.selected?.id !== scene.selected?.id;
  return { ...scene, ...patch, ...(mediaChanged ? { continuityNote: undefined, trimEnd: undefined, visualObservation: undefined } : {}), ...(sourceChanged ? { motionGraphic: undefined, renderKind: undefined } : {}) };
}
