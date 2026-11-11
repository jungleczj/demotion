import { Provider } from './types';
import research from './research.json';

export type Library = { name: string; url: string; access: string; detail: string; provider?: Provider };
export const libraries: Record<string, Library> = {
  pixabay: { name: 'Pixabay', url: 'https://pixabay.com/api/docs/', access: 'API · 需 key', detail: '通用实拍、自然、生活和动画', provider: 'pixabay' },
  pexels: { name: 'Pexels', url: 'https://www.pexels.com/videos/', access: '已有 key 可接入', detail: '新 key 签发暂停（用户反馈）；保留已有 key 接口', provider: 'pexels' },
  commons: { name: 'Wikimedia Commons', url: 'https://commons.wikimedia.org/', access: '已接入 · 无需 key', detail: '可识别地点、科学、历史及开放媒体', provider: 'commons' },
  archive: { name: 'Internet Archive', url: 'https://archive.org/details/movies', access: '已接入 · 无需 key', detail: '历史影像、旧纪录片；逐条核对授权', provider: 'archive' },
  nasa: { name: 'NASA Image & Video Library', url: 'https://images.nasa.gov/', access: '已接入 · 无需 key', detail: '航天任务、宇航员、地球观测', provider: 'nasa' },
  mixkit: { name: 'Mixkit', url: 'https://mixkit.co/free-stock-video/', access: '前往查找 · 手动导入', detail: '生活、旅行、运动、食物等；检查单条许可' },
  coverr: { name: 'Coverr', url: 'https://coverr.co/stock-video-footage', access: '前往查找 · 可洽 API', detail: '自然、航拍、城市、生活；目录混合实拍与 AI' },
  storyblocks: { name: 'Storyblocks', url: 'https://www.storyblocks.com/video', access: '付费 · 商务 API', detail: '通用 B-roll、商业、模板与动效' },
  shutterstock: { name: 'Shutterstock', url: 'https://www.shutterstock.com/video', access: '付费 · API', detail: '商业、工业、生活和专业细分' },
  adobe: { name: 'Adobe Stock', url: 'https://stock.adobe.com/video', access: '付费 · API', detail: '广告素材、商业实拍、视觉创意' },
  pond5: { name: 'Pond5', url: 'https://www.pond5.com/stock-video-footage/', access: '付费 · 合作 API', detail: '档案、专业题材、航拍和特色镜头' },
  getty: { name: 'Getty Images', url: 'https://www.gettyimages.com/videos', access: '付费 · 合作 API', detail: '赛事、人物、娱乐与新闻编辑影像' },
  reuters: { name: 'Reuters Connect', url: 'https://www.reutersconnect.com/', access: '付费 · 内容合作', detail: '新闻、国际事件、体育与娱乐报道' },
  ap: { name: 'AP Archive', url: 'https://www.aparchive.com/', access: '付费 · 授权洽谈', detail: '新闻、历史事件和人物档案' },
  pathe: { name: 'British Pathé', url: 'https://www.britishpathe.com/', access: '付费 · 授权洽谈', detail: '新闻短片与历史影像档案' },
  loc: { name: 'Library of Congress', url: 'https://www.loc.gov/film-and-videos/', access: '前往查找 · 手动导入', detail: '早期电影与历史文化；逐条核对权利说明' },
  noaa: { name: 'NOAA Ocean Exploration', url: 'https://oceanexplorer.noaa.gov/', access: '前往查找 · 手动导入', detail: '海洋调查、深海物种与海底实录' },
  esa: { name: 'ESA Multimedia', url: 'https://www.esa.int/ESA_Multimedia', access: '前往查找 · 手动导入', detail: '欧洲航天与地球观测；按条款使用' },
  eso: { name: 'ESO Videos', url: 'https://www.eso.org/public/videos/', access: '前往查找 · 手动导入', detail: '天文台、星空和宇宙可视化' },
  europeana: { name: 'Europeana', url: 'https://www.europeana.eu/', access: '前往查找 · 手动导入', detail: '欧洲文化机构媒体；类型与许可各异' },
  wellcome: { name: 'Wellcome Collection', url: 'https://wellcomecollection.org/', access: '前往查找 · 手动导入', detail: '医学、健康和科学史；部分为图片或历史资料' },
};

export type Topic = { id: string; name: string; group: string; query: string; hint: string; sources: string[]; auto: Provider[]; match: RegExp };
function topic(id: string, name: string, group: string, query: string, hint: string, sources: string[], auto: Provider[], match: RegExp): Topic { return { id, name, group, query, hint, sources, auto, match }; }
const general: Provider[] = ['pixabay', 'pexels', 'commons'];
export const topics: Topic[] = [
  topic('sports', '体育赛事', '人物与生活', 'football match stadium', '具体比赛与球星优先编辑影像；普通运动画面不能替代赛事实录。', ['getty', 'reuters', 'ap', 'pond5', 'commons'], ['commons', 'pixabay'], /赛事|球赛|奥运|世界杯|NBA|tournament|olympic/i),
  topic('fitness', '运动与健身', '人物与生活', 'fitness running gym', '训练、跑步、瑜伽和器械等通用动作画面。', ['pixabay', 'pexels', 'mixkit', 'coverr', 'storyblocks'], general, /健身|瑜伽|跑步|fitness|yoga|workout/i),
  topic('daily', '日常生活', '人物与生活', 'daily life people', '生活动作、城市日常和人物 B-roll。', ['pixabay', 'pexels', 'mixkit', 'coverr', 'adobe'], general, /日常|生活|daily life|lifestyle/i),
  topic('family', '家庭与亲子', '人物与生活', 'family children home', '亲子活动与家庭互动；查看人物授权条件。', ['pixabay', 'pexels', 'mixkit', 'shutterstock'], general, /家庭|亲子|儿童|family|children|parent/i),
  topic('relationships', '情感与关系', '人物与生活', 'couple friendship people', '陪伴、友情、约会等概念化叙事画面。', ['pixabay', 'pexels', 'mixkit', 'adobe'], general, /情感|爱情|友情|couple|friendship|relationship/i),
  topic('celebrity', '明星与娱乐新闻', '文化与娱乐', 'celebrity red carpet interview', '具体明星、红毯与采访应从编辑素材渠道找。', ['getty', 'reuters', 'ap'], ['commons'], /明星|红毯|celebrity|red carpet/i),
  topic('cinema', '影视与电影文化', '文化与娱乐', 'classic cinema silent film', '区分片场、观影概念画面与具体影视片段；后者需明确授权。', ['archive', 'loc', 'pathe', 'getty', 'pond5'], ['archive', 'commons'], /电影|影视|cinema|silent film|movie/i),
  topic('music', '音乐与演出', '文化与娱乐', 'music concert instrument', '通用乐器与舞台画面可用 stock，指定艺人演出需专业渠道。', ['getty', 'reuters', 'pixabay', 'mixkit', 'pond5'], general, /音乐|演出|乐器|music|concert|instrument/i),
  topic('art', '艺术与博物馆', '文化与娱乐', 'art museum painting', '博物馆、艺术创作与文化藏品，核对作品本身的权利。', ['commons', 'europeana', 'loc', 'pond5'], ['commons', 'archive'], /艺术|博物馆|绘画|museum|painting|art gallery/i),
  topic('culture', '传统文化与民俗', '文化与娱乐', 'traditional culture festival', '具体地区的风俗、传统工艺与节庆。', ['commons', 'europeana', 'archive', 'pond5'], ['commons', 'archive'], /民俗|传统文化|非遗|traditional culture|folklore/i),
  topic('fashion', '时尚与美妆', '文化与娱乐', 'fashion beauty makeup', '广告、护肤、化妆；具体秀场优先 Getty 等编辑渠道。', ['adobe', 'shutterstock', 'pexels', 'pixabay', 'getty'], general, /时尚|美妆|化妆|fashion|beauty|makeup/i),
  topic('gaming', '游戏与电竞', '文化与娱乐', 'gaming esports controller', '玩家、设备可用 stock；游戏内画面遵循发行商政策或用自录素材。', ['shutterstock', 'adobe', 'pixabay', 'getty'], general, /电竞|游戏|gaming|esports/i),
  topic('travel', '旅行与目的地', '自然与地点', 'travel destination landscape', '具名地点需要地理匹配，不要只选看起来相似的城市。', ['commons', 'pixabay', 'pexels', 'coverr', 'pond5'], general, /旅行|旅游|目的地|travel|tourism|destination/i),
  topic('landscape', '自然风景', '自然与地点', 'nature landscape aerial', '自然环境、季节变化、风景航拍。', ['pixabay', 'pexels', 'mixkit', 'coverr', 'commons'], general, /风景|自然|landscape|nature/i),
  topic('mountains', '山川湖泊', '自然与地点', 'mountain lake river', '山脉、河流、湖泊与瀑布；具体地名优先 Commons 和专业目录。', ['pixabay', 'pexels', 'commons', 'mixkit', 'pond5'], general, /山川|山水|山脉|湖泊|瀑布|mountain|lake|waterfall/i),
  topic('city', '城市与街景', '自然与地点', 'city street skyline', '街道、城市天际线、交通与夜景。', ['pixabay', 'pexels', 'coverr', 'commons', 'pond5'], general, /城市|街景|街道|city|skyline|street/i),
  topic('architecture', '建筑与空间', '自然与地点', 'architecture building interior', '具名建筑优先地理可核实的来源，室内概念画面可用通用库。', ['commons', 'pexels', 'pixabay', 'coverr', 'pond5'], general, /建筑|architecture|building|interior/i),
  topic('home', '地产与家居', '自然与地点', 'real estate house interior', '通用房屋与家居可用 stock；具体房源应使用房主或中介提供素材。', ['adobe', 'shutterstock', 'pexels', 'pixabay', 'storyblocks'], general, /家居|房产|地产|房源|real estate|house interior/i),
  topic('ocean', '海洋与水下', '自然与地点', 'ocean underwater marine', '浅海通用素材与深海科考分开；科考优先 NOAA。', ['noaa', 'commons', 'pixabay', 'pexels', 'pond5'], general, /海洋|大海|珊瑚|深海|鲸|ocean|underwater|coral|whale/i),
  topic('wildlife', '野生动物', '自然与地点', 'wildlife animal nature', '准确物种、栖息地和行为需要核对；专业行为镜头可查 Getty/Pond5。', ['commons', 'pixabay', 'pond5', 'getty', 'shutterstock'], general, /野生|动物|鸟类|wildlife|animal|bird/i),
  topic('pets', '宠物', '自然与地点', 'pet cat dog', '宠物生活、训练、互动等常见画面。', ['pixabay', 'pexels', 'mixkit', 'adobe'], general, /宠物|猫|狗|pet|kitten|puppy/i),
  topic('agriculture', '农业与乡村', '自然与地点', 'agriculture farm rural', '农田、种植、牧场与乡村生活。', ['pixabay', 'pexels', 'commons', 'shutterstock', 'pond5'], general, /农业|农田|乡村|agriculture|farm|rural/i),
  topic('space', '航天与天文', '科学与技术', 'space NASA moon', '任务实录优先 NASA、ESA；天文台与可视化可查 ESO。', ['nasa', 'esa', 'eso', 'commons'], ['nasa', 'commons'], /航天|太空|宇宙|月球|火箭|宇航|space|NASA|moon|rocket|astronaut/i),
  topic('earth', '地球与气候', '科学与技术', 'earth climate satellite', '卫星、极地、海洋与气候变化；动画和实测影像需区分。', ['nasa', 'noaa', 'esa', 'commons', 'pond5'], ['nasa', 'commons'], /地球|气候|卫星|极地|earth|climate|satellite/i),
  topic('technology', '科技与数码', '科学与技术', 'technology computer electronics', '电脑、电子设备与科技环境；具体产品演示适合用户自有素材。', ['pixabay', 'pexels', 'storyblocks', 'adobe', 'shutterstock'], general, /科技|数码|电脑|technology|computer|electronics/i),
  topic('ai', 'AI 与机器人', '科学与技术', 'robotics artificial intelligence', '机器人物理实拍和抽象 AI 动效分开，避免把概念动画说成实录。', ['shutterstock', 'adobe', 'storyblocks', 'pixabay', 'commons'], general, /人工智能|机器人|robot|artificial intelligence/i),
  topic('industry', '工业与制造', '科学与技术', 'industrial factory manufacturing', '生产线、机械、仓储、工厂；专业工艺需核对设备与流程。', ['shutterstock', 'pond5', 'adobe', 'pixabay', 'commons'], general, /工业|制造|工厂|生产线|industrial|factory|manufacturing/i),
  topic('energy', '能源与基础设施', '科学与技术', 'renewable energy power infrastructure', '风电、光伏、输电、油气和建设工程。', ['shutterstock', 'pond5', 'commons', 'pixabay'], general, /能源|光伏|风电|基建|energy|power plant|infrastructure/i),
  topic('health', '医疗与健康', '科学与技术', 'healthcare hospital medical', '医院与医生可用 stock；具体手术、疾病图解需专业来源与事实核对。', ['wellcome', 'shutterstock', 'adobe', 'commons', 'pixabay'], general, /医疗|健康|医院|医生|medical|healthcare|hospital/i),
  topic('education', '教育与科学实验', '科学与技术', 'education science laboratory', '课堂、学习、实验室与教学演示。', ['commons', 'pixabay', 'pexels', 'storyblocks', 'wellcome'], general, /教育|课堂|实验|科学|education|science|laboratory/i),
  topic('history', '历史与战争', '事件与社会', 'historical archive war footage', '优先带年代、地点和档案说明的材料，不能只按画面气氛匹配。', ['archive', 'commons', 'pathe', 'ap', 'pond5', 'loc'], ['archive', 'commons'], /历史|战争|二战|战役|historical|world war|battle|194\d/i),
  topic('news', '新闻与国际事件', '事件与社会', 'news current event', '具体事件需要事件级出处、时间和许可；通用 stock 只适合作说明性配图。', ['reuters', 'ap', 'getty'], ['commons'], /新闻|时事|国际事件|news|current event/i),
  topic('politics', '政治与公共人物', '事件与社会', 'politics government speech', '人物身份、场合与日期需要准确对应。', ['reuters', 'ap', 'getty', 'commons'], ['commons', 'archive'], /政治|总统|政要|politics|president|government/i),
  topic('crime', '案件与悬疑', '事件与社会', 'crime investigation evidence', '真实案件用准确档案；警方、夜街等氛围素材需作为示意画面使用。', ['ap', 'getty', 'reuters', 'pond5', 'pixabay'], ['commons', 'archive', 'pixabay'], /案件|悬疑|犯罪|侦探|crime|investigation|detective/i),
  topic('business', '商业与职场', '商业与交通', 'business office teamwork', '会议、团队、办公与企业服务。', ['pexels', 'pixabay', 'storyblocks', 'adobe', 'shutterstock'], general, /商业|职场|办公|business|office|teamwork/i),
  topic('finance', '财经与经济', '商业与交通', 'finance economy stock exchange', '交易所、现金、城市用于辅助；具体数据优先用可溯源图表。', ['reuters', 'getty', 'shutterstock', 'storyblocks', 'pixabay'], general, /财经|经济|金融|股票|finance|economy|stock exchange/i),
  topic('food', '美食与烹饪', '商业与交通', 'food cooking kitchen', '制作过程、食材、餐饮环境；具体菜品检查实际画面。', ['mixkit', 'pexels', 'pixabay', 'coverr', 'adobe'], general, /美食|烹饪|餐饮|food|cooking|kitchen/i),
  topic('cars', '汽车与公路', '商业与交通', 'car road driving', '汽车、公路、驾驶与运输；指定车型核对品牌型号。', ['pond5', 'shutterstock', 'pexels', 'pixabay', 'archive'], general, /汽车|公路|驾驶|car|driving|road/i),
  topic('rail', '铁路与列车', '商业与交通', 'train railway station', '具名线路、机车与车站优先 Commons/档案目录。', ['commons', 'archive', 'pond5', 'pixabay', 'pexels'], ['commons', 'archive', 'pixabay'], /铁路|列车|火车|train|railway/i),
  topic('aviation', '航空与航海', '商业与交通', 'aircraft ship transport', '机型、舰船和港口等具体对象需要精确核对。', ['commons', 'pond5', 'archive', 'shutterstock', 'pixabay'], ['commons', 'archive', 'pixabay'], /航空|航海|飞机|舰船|aircraft|aviation|ship/i),
  topic('meditation', '睡眠与冥想', '氛围与视觉', 'relaxing nature rain forest', '适合长镜头、稳定画面；不要靠重复短片掩盖内容不足。', ['pixabay', 'pexels', 'mixkit', 'coverr'], general, /睡眠|冥想|白噪音|sleep|meditation|relaxing/i),
  topic('abstract', '抽象与动态图形', '氛围与视觉', 'abstract animation background', '区分实拍、动画与 AI 画面；本版也可手动导入自制动效。', ['storyblocks', 'adobe', 'shutterstock', 'pixabay'], ['pixabay', 'commons'], /抽象|动效|动画|abstract|animation|motion graphics/i),
  topic('seasons', '节日与季节', '氛围与视觉', 'season holiday celebration', '季节、庆祝、节日装饰；具体文化背景应核对。', ['pixabay', 'pexels', 'mixkit', 'commons', 'adobe'], general, /节日|季节|庆祝|season|holiday|celebration/i),
];

// The independently researched free-source directory supplements the first UI pass.
const accessLabels: Record<string, string> = {
  free_self_service_key: '免费 API · 登录申请 key',
  free_no_key: '无需 key · 公开 API',
  new_keys_paused: '新 key 暂停签发',
};
for (const source of research.providers) {
  const integrated = ['pixabay', 'pexels', 'commons', 'archive', 'nasa', 'coverr'].includes(source.id);
  libraries[source.id] = {
    name: source.name, url: source.key_application || source.api_docs || source.homepage,
    access: integrated ? source.id === 'pexels' ? '新 key 暂停 · 已有可接入' : ['commons', 'archive', 'nasa'].includes(source.id) ? '已接入 · 无需 key' : '已接入 · 需 key' : source.api_access === 'free_self_service_key' ? '可申请 key · 待接入' : source.api_access === 'free_no_key' ? '无 key API · 待接入' : '前往查找 · 查看使用条件',
    detail: source.rights_summary,
    ...(integrated ? { provider: source.id as Provider } : {}),
  };
  if (!source.media_types.includes('video')) libraries[source.id].access += ' · 图片/目录';
}
const extraQueries: Record<string, string> = {
  geology: 'volcano geology', weather: 'storm weather satellite', conservation: 'wildlife conservation', insects: 'insect macro flower', outdoors: 'hiking camping', military: 'military training', rescue: 'disaster rescue', logistics: 'cargo port logistics', crafts: 'craft woodworking', religion: 'temple ceremony', archaeology: 'archaeology ruins', biography: 'historical inventor', software: 'computer software', dance: 'dance performance', accessibility: 'accessibility elderly', maps: 'earth satellite geography',
};
for (const entry of research.topics) {
  const existing = topics.find((item) => item.id === entry.id);
  const sources = [...new Set([...entry.preferred_api_sources, ...entry.manual_or_later_sources])].filter((id) => libraries[id]);
  const supported = entry.preferred_api_sources.filter((id) => ['pixabay', 'pexels', 'commons', 'archive', 'nasa', 'coverr'].includes(id)) as Provider[];
  if (existing) {
    existing.sources = sources.length ? sources : existing.sources;
    existing.hint = entry.constraints;
    if (supported.length) existing.auto = supported;
  } else {
    topics.push({ id: entry.id, name: entry.name, group: entry.group, query: extraQueries[entry.id] || entry.name, hint: entry.constraints, sources, auto: supported.length ? supported : ['commons'], match: new RegExp(entry.name.split(/[、与]/).filter((word) => word.length > 1).join('|'), 'i') });
  }
}

export function inferTopic(text: string): Topic { return topics.find((item) => item.match.test(text)) || topics.find((item) => item.id === 'landscape')!; }
export function routeProviders(topicId: string, text: string, selected: Provider[]): Provider[] {
  const chosen = topics.find((item) => item.id === topicId) || inferTopic(text);
  const preferred = chosen.auto.filter((provider) => selected.includes(provider));
  if (preferred.includes('coverr')) preferred.sort((a, b) => Number(b === 'coverr') - Number(a === 'coverr'));
  return preferred.length ? preferred.slice(0, 2) : selected.filter((p) => p !== 'nasa').slice(0, 2);
}
