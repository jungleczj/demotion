import languages from '../shared/languages.json';
import voices from '../shared/voices.json';
export const examples = [
  { label: '海洋探索', tag: '自然', title: '海洋，比我们想象的更辽阔', script: '海浪不断涌向海岸，海洋的故事却远不止我们眼前的这一片蓝色。\n\n潜入温暖的浅海，珊瑚礁为形形色色的海洋生物提供栖息之所。\n\n在更开阔的水域，鲸鱼沿着漫长的迁徙路线穿越海洋。\n\n随着阳光逐渐消失，深海展现出一个截然不同的世界。\n\n当夕阳再次照亮海面，我们对海洋的探索才刚刚开始。' },
  { label: '重返月球', tag: '太空', title: '从地球出发，向月球前进', script: '火箭从发射台升起，穿过云层，向太空进发。\n\n从轨道上俯瞰地球，白色的云层在蓝色星球上缓缓移动。\n\n在月球表面，撞击坑记录着漫长岁月留下的痕迹。\n\n宇航员在月面行走，探索这片安静而陌生的土地。\n\n每一次新的任务，都让我们更接近理解地球以外的世界。' },
  { label: '铁路的故事', tag: '历史', title: '一条铁路，连接远方', script: '蒸汽机车沿着铁路向前行驶，白色蒸汽在空气中升起。\n\n在车站里，人们等待着列车，也等待着下一次出发。\n\n列车穿过山地与森林，将不同的地方连接在一起。\n\n如今，现代列车仍然承载着同样的期待，驶向远方。' },
];
export const voiceOptions = voices.map((v) => ({ ...v, id: `gemini:${v.key}`, initials: v.name.slice(0, 2), lang: 'auto' }));
export const narrationStyles = [
  { id: 'documentary', name: '纪录片旁白' },
  { id: 'story', name: '故事讲述' },
  { id: 'conversation', name: '自然口播' },
  { id: 'explainer', name: '知识解说' },
  { id: 'gentle', name: '温柔叙述' },
];

export const languageOptions = languages;
