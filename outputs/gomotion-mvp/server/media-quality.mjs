import profile from '../shared/video-profile.json' with { type: 'json' };

export function outputProfile(format) {
  return format === 'portrait' ? { ...profile, width: profile.height, height: profile.width } : profile;
}

export function mediaQualityError(width, height, format, allowUnknown = false) {
  if (!width || !height) return allowUnknown ? '' : '无法核对素材的实际清晰度';
  const portrait = format === 'portrait';
  if (portrait ? height <= width : width <= height) return `需要${portrait ? '竖屏' : '横屏'}原片，已自动排除不同方向素材`;
  const target = outputProfile(format);
  if (width < target.width || height < target.height) return `原片清晰度不足 ${target.label}，已自动寻找高清版本或其他素材`;
  return '';
}
