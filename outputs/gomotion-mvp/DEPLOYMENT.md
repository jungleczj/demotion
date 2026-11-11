# 线上部署：同项目 Vercel API 与视频制作

## 当前状态

旧部署只有静态页面，配置及声音接口404。当前已补原生 [API入口](api/index.mjs) 与 [vercel.json](vercel.json)，正式域配置与声音目录均200，30声音/15语言；预览真实中文试听完整解码通过。详见[修复和验收记录](../vercel-native-connection-fix-2026-11-11.md)。

短试听单次返回完整音频，不依赖 Function 临时磁盘。原生API还支持短脚本写作；密钥只使用服务端环境变量，不要使用 `VITE_*`。现有设置页不会假装将线上凭证保存到某个临时函数实例。

## 同项目发布

当前项目 Root Directory 必须为 `outputs/gomotion-mvp`，Vite Build Command 为 `npm run build`，Output Directory 为 `dist`。CLI 从仓库根目录执行，以免重复追加嵌套目录：

```sh
vercel link --yes --project gomotion-mvp --scope signflow2
vercel deploy --yes --scope signflow2
```

服务端敏感变量：`VISION_API_KEY`（兼容 `GEMINI_API_KEY`）、`PIXABAY_API_KEY`、`COVERR_API_KEY`、`YOUTUBE_API_KEY`。可选 `PEXELS_API_KEY`、`VISION_BASE_URL`、`VISION_MODEL`、`TTS_MODEL`。Production 与 Preview 分别配置；不要将真实值写入本文、源码或Git。

先在预览验证配置、目录、按所选语言的声音和未知API的JSON错误，再发布正式版：

```sh
vercel deploy --prod --yes --scope signflow2
```

## 同项目完整视频后台

任务14已接入按任务启动的Sandbox执行器和private Blob持久任务/媒体，正式站一条真实短片已通过制作、视听审片、同域Range、完整下载与解码；记录见[任务14实施](../task-14-cloud-generation-progress-2026-11-11.md)及[结构化验收](../task-14-cloud-live-acceptance-2026-11-11.json)。这条恢复样片不能替代首次冷生成速度、长视频或实际浏览器验收。

云执行通过[云端API](server/cloud/api.mjs)与[独立worker](server/cloud/worker.mjs)，不把Function临时磁盘作为任务真相。发布前需要服务端配置：

| 变量 | 用途 |
|---|---|
| `BLOB_READ_WRITE_TOKEN`或`BLOB_STORE_ID` | 当前项目连接的private Blob；OIDC须有相应项目/环境权限 |
| `GOMOTION_SANDBOX_SNAPSHOT` | 已预装FFmpeg、字体和Linux依赖的执行快照 |
| `GOMOTION_CLOUD_SECRET` | 至少32字符的随机服务端签名密钥；不得放进VITE变量 |
| `GOMOTION_CLOUD_ENABLED=1` | 资源和实际预检通过后启用制作 |
| `GOMOTION_DAILY_PRODUCTIONS` | 本MVP共享每日制作额度，默认20；不改变各镜头检索并发 |
| `VISION_API_KEY`或`GEMINI_API_KEY`及素材源凭证 | 沿用上面的服务端连接 |

在已授权云端用量后运行[快照准备脚本](scripts/prepare-cloud-snapshot.mjs)；更新源代码时可用`--from=已有快照ID`复用依赖。快照不包含环境文件和提供方密钥，执行时单独注入；旧版本快照不会自动读取本地新代码，必须准备并配置新的执行快照。单次执行45分钟，既有生成流水线40分钟上限继续生效。

Production现已启用；Preview虽然已连接Blob，尚未配齐并启用上述执行变量，不能据此宣称预览环境也能制作。预览若启用Deployment Protection，worker回调还需对应的自动化绕过凭证，不能去掉整个站点保护代替鉴权。

项目隔离采用服务端签名、HttpOnly/Secure浏览器会话；私有媒体经同域授权后流式返回，凭证与签名URL不进入前端。此版本仍为MVP：没有正式账号体系、长期媒体清理和多租户计费，不应宣称生产SaaS的全部运营能力已完成。

## 可选：独立容器后台

以下保留给已有持久主机的部署方式，不是用户当前直接Vercel部署已完成的宣称。生成外部转发配置会覆盖当前原生 `vercel.json`，请只在明确切换后台架构时执行。

## 1. 启动真实后台

在有Docker Compose的Linux主机中，进入仓库的`outputs/gomotion-mvp`：

```sh
cp .env.example .env
```

编辑服务器上的`.env`，填入自己的素材和模型凭证，并加入允许访问的前端及后台来源（地址只是示例，需换成实际地址）：

```dotenv
APP_ORIGINS=https://gomotion-mvp.vercel.app,https://api.example.com
```

然后启动：

```sh
docker compose up -d --build
curl --fail http://127.0.0.1:3027/api/health
curl --fail http://127.0.0.1:3027/api/config
curl --fail http://127.0.0.1:3027/api/voices
```

[Dockerfile](Dockerfile)包括Node 26、FFmpeg、ffprobe与Noto中文字体；[Compose](compose.yaml)将任务、来源原件、旁白和播放缓存放进同一持久卷。该MVP使用单一后台实例。默认仅将端口发布到服务器本机；用实际HTTPS入口/反向代理连接该端口。已有访问控制应同时保护前端与后台；当前应用没有多用户账号和项目隔离，不能当作公共多租户SaaS发布。

容器运行参数可在托管容器平台配置：`HOST=0.0.0.0`、`PORT=3027`、`GOMOTION_DATA_DIR=/data`，并为`/data`挂载持久化磁盘。不要把运行中的主进程或数据卷删掉作为重新部署步骤。

## 2. 将Vercel的全部API转发到同一后台

先使后台的真实HTTPS地址可访问；在本机应用目录运行（替换示例域名）：

```sh
node scripts/configure-vercel.mjs https://api.example.com
```

该命令生成应用目录`vercel.json`：`/api/*`先转发到后台，其他页面使用SPA回退。配置覆盖声音、制作任务、旁白、素材播放、下载与导出；不能只转发配置和声音两个接口。

把生成的配置提交到GitHub并重新部署。Vercel项目Root Directory为`outputs/gomotion-mvp`，Build Command为`npm run build`，Output Directory为`dist`。前端保持同源`/api/*`请求；密钥只保存在后台环境中，不能配置成`VITE_*`打进前端。

如果全部部署在同一云服务器，也可以直接访问Node后台所提供的完整前端，无需Vercel转发。

## 验收要求

- 配置/声音/健康接口真实200 JSON，声音目录不预下载全部音频。
- 在目标平台实际点击不同语言试听；HTTP与完整解码不代替听审。
- 完整短视频制作后离开、返回/刷新仍是同一任务；部署与worker重启可恢复。
- 成片Range播放、下载、FFmpeg和字体在目标Linux环境实际通过。

本机独立Node进程、数据保留与重启已检查；本机无Docker CLI，Linux容器尚未运行。最终本地[241项回归](../vercel-native-final-regression-2026-11-11.txt)通过；这些证据不能替代云端完整制作验收。
