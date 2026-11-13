# 竖屏成片离线逐帧文件审计 · 2026-11-13

结论：这份现存导出文件的881帧全部实际解码并按原始720×1280像素扫描，音视频严格完整解码退出0；按下述阈值，近全黑、近全白、近单色空白候选均为0，包括四个镜头边界附近。该结论不等于浏览器无闪屏通过，也不证明听感或新生成成功。

## 输入与身份

- 文件：[portrait-generation-live-2026-11-12.mp4](portrait-generation-live-2026-11-12.mp4)，9,407,463字节。
- SHA-256：`2ea79cf62a32a3b10178b845274d3f75fca7abdf3cb04e3fad5aadafd4722234`，与[对应历史JSON](portrait-generation-live-2026-11-12.json)保存值完全相同。
- 项目`0e122c79-27bd-4e38-ad71-e14dec716bd1`；导出`ffb74b04-871c-4664-b781-ef82fa5b6fd9`。
- 本轮未调用模型、素材API或浏览器，未生成新片、修改任务、代码或TASKS，未启动/重启服务。

## 实际帧数、时间与解码

- H.264/yuv420p，720×1280，30/1 fps；`nb_frames`、`ffprobe -count_frames`与逐帧原始像素读取均为881。
- 时长29.366667秒；881/30=29.366666667秒。帧号从0起：首帧PTS=0，末帧880的PTS=29.333333秒；逐帧PTS间距均为1/30秒（容差2微秒），未检测到时间戳缺口。
- 共扫描811,929,600个亮度像素；每帧亮度及两个原生色度平面均用于近单色检测，无缩小或抽帧。
- AAC，48kHz立体声，流时长29.366667秒；视频原始解码与包含全部音视频流的`-xerror -err_detect explode`解码均退出0，无错误输出。
- AAC容器`nb_frames=1378`、实际解码音频帧`nb_read_frames=1377`是不同的编解码计数量；本轮未据该差值宣称缺音。解码通过不等于旁白连续性或自然度听审通过。

## 检测阈值

| 检测 | 明确定义 | 全片候选数 |
|---|---|---:|
| 近全黑 | 原生8bit亮度Y≤20的像素占比≥98% | 0 |
| 近全白 | 原生8bit亮度Y≥232的像素占比≥98% | 0 |
| 近单色/空白候选 | Y、U、V各平面均有≥98%样本落在某个连续5码值区间内 | 0 |
| 强亮度脉冲补查 | 连续1–3帧的每帧均比前后两帧亮或暗≥40个平均Y码值，且前后两帧均值差≤10 | 0 |

使用解码后的原生YUV420p值，不做色阶重映射。阈值覆盖常见视频范围与全范围黑白极值；这是一组明确的异常候选规则，不是所有闪烁的完备判定。近单色候选也不能替代内容相关性判断。

全片极值：

- 最大黑像素占比21.7447%，帧286/9.533333秒；距98%判定阈值很远。
- 最大白像素占比1.4115%，帧582/19.400000秒。
- 最低平均亮度Y=48.0687，帧869/28.966667秒；此帧亮度标准差=25.5642，不是平坦黑画面。
- 全片任意连续5亮度码值最多覆盖23.4903%，亮度标准差最低仍为25.5486；未出现近乎单色的整帧。

## 镜头边界逐帧覆盖

边界取自历史JSON的`sources.scenes`，每处扫描约±0.5秒完整帧（时间戳四舍五入容差1微秒）；所有881帧另已全片扫描。相邻帧MAE是对应像素亮度绝对差的平均值，用于定位变化，不单独把大变化判成闪屏。

| 进入镜头 | 计划边界秒 | 声明转场 | 实际检查帧号/数量 | 最大相邻变化位置 | 最大黑/白占比 | 黑/白/单色候选 |
|---|---:|---|---|---|---|---|
| 2 | 2.540000 | cut | 62–91 / 30 | 帧76，2.533333s，MAE 42.813 | 0.3245% / 0.3854% | 0 / 0 / 0 |
| 3 | 7.000000 | cut | 195–225 / 31 | 帧210，7.000000s，MAE 53.919 | 2.9495% / 0.6387% | 0 / 0 / 0 |
| 4 | 13.866667 | dissolve | 401–431 / 31 | 帧417，13.900000s，MAE 20.711 | 16.2173% / 0.8304% | 0 / 0 / 0 |
| 5 | 21.700000 | cut | 636–666 / 31 | 帧651，21.700000s，MAE 83.183 | 2.8458% / 0.8709% | 0 / 0 / 0 |

2.54秒的计划点不在30fps整数网格上，像素变化最大出现在帧76/2.533333秒；这是离计划点0.006667秒的帧量化位置，不是缺帧。13.866667秒处声明0.266667秒叠化，约8个输出帧周期；21.7秒处声明硬切，亮度变化明显，但后续仍是有纹理的海岸画面，不能据变暗本身判成黑闪。

[边界证据图](portrait-frame-audit-2026-11-13-boundaries.png)按四个边界逐行排列。每行帧号依次为：

- 74、75、76、77、78、80、84。
- 208、209、210、211、212、214、218。
- 414、415、416、417、418、420、424。
- 649、650、651、652、653、655、659。

已实际查看这些从原文件提取的证据图：前两处是有内容的硬切，第三处为水面光影至日落岸边的叠化，第四处为日落至暗色岩岸的硬切。证据图为缩略呈现；数值检测使用全部原尺寸像素。

## 自然暗画面与空白的区别

[极值证据图](portrait-frame-audit-2026-11-13-extrema.png)从左到右为帧153、286、582、869。帧286含暗浪与金色倒影，帧869含岩岸、浪花和暗色海水；两者保留明显纹理及非黑区域。帧582的太阳与反光是局部高光。平均亮度低、局部黑水或太阳高光均不等于整帧黑/白/空白。

本报告只支持：该确定SHA的现存导出文件在881个完整帧上未触发这些黑/白/近单色及强短脉冲规则。仍不能排除任意颜色的插帧、局部或轻微闪烁、浏览器缓冲/解码/合成器造成的闪屏；未进行旁白/语言/人声/配乐听审，也未证明新版云生成、速度或同稿对标。

## 复现

完整逐帧指标、阈值、解码命令、实际边界、证据图提取命令和本次统计器C源码均保存在[同名JSON](portrait-frame-audit-2026-11-13.json)。以下从仓库根目录执行，只读取输入并在临时目录编译统计器：

```python
import csv, io, json, pathlib, subprocess, tempfile
d = json.loads(pathlib.Path("outputs/portrait-frame-audit-2026-11-13.json").read_text())
r = d["reproducibility"]
assert subprocess.run(r["strictAVDecodeCommand"]).returncode == 0
with tempfile.TemporaryDirectory() as folder:
    src = pathlib.Path(folder) / "stats.c"
    exe = pathlib.Path(folder) / "stats"
    src.write_text(r["statsSourceC"])
    subprocess.run(["cc", "-O3", "-std=c11", str(src), "-lm", "-o", str(exe)], check=True)
    raw = subprocess.Popen(r["rawVideoCommand"], stdout=subprocess.PIPE)
    scan = subprocess.Popen([str(exe), "720", "1280"], stdin=raw.stdout, stdout=subprocess.PIPE, text=True)
    raw.stdout.close()
    output, _ = scan.communicate()
    assert scan.returncode == 0 and raw.wait() == 0
    rows = list(csv.DictReader(io.StringIO(output)))
    assert len(rows) == 881
    black = [x["frame"] for x in rows if float(x["darkFraction"]) >= .98]
    white = [x["frame"] for x in rows if float(x["brightFraction"]) >= .98]
    flat = [x["frame"] for x in rows if min(float(x[k]) for k in ("modal5Y", "modal5U", "modal5V")) >= .98]
    print({"frames": len(rows), "nearBlack": black, "nearWhite": white, "nearUniform": flat})
```
