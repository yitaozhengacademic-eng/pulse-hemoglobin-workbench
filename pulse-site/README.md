# PULSE 教学研究网站

以指定的 2026-10-27 中英对照稿为界面与方法参考，以本机现存权重为数值实现。纯静态网页，适配 GitHub Pages。临床输入仅在浏览器运算，不上传病例，也不存入 localStorage。

## 使用

```sh
python3 -m http.server 8765 --directory dist
```

打开 `http://localhost:8765`，点击“载入虚拟示例”，或填写临床变量、城市及日期。点击“自动获取数据”可从站点环境库匹配 PM₂.₅，并在线刷新 ERA5 气象。预测可以导出 JSON、轨迹 CSV，也可打印。

城市支持当前原始环境资料中的 21 个城市。城市与入院日期只用于环境匹配；手术日期用于年度正余弦项。不能将两者混用。

## 必须保留的来源说明

配套教师说明记载：86 条记录的 144 个 POD2–7 Hb 单元格经过定向调整。这是教学情景，非未经改动的真实临床验证。来源文件是 `结果更正_20261026/既有教师说明.md` 和 `完整论文_整体分析_20261025/README_最终交付.md`。

本机现存 131 人联合环境模型 MAE=10.03189376，临床与日历 MAE=11.12357211；指定稿报告 5.87 与 10.95。这些数字不一致，网站已明确披露。不能以网站部署代替论文与数据核对。

轨迹模型使用各 15 个既存 checkpoint（5 折 × 3 种子）平均；网页集成预测没有单独验证。风险模型因原重复交叉验证脚本未保存 estimator，在相同 131 条合格教学记录上按 C=1 的岭逻辑回归重新拟合；网页风险不是 OOF 风险，不继承论文 AUC。没有重新训练或覆盖既存轨迹模型。

## 环境数据

- PM₂.₅：CNEMC 城市小时监测，经 https://quotsoft.net/air/ 存档。只取 PM2.5 而非 PM2.5_24h；日均至少 20 小时，排除负值与 >1500。
- 气象：ERA5，经 https://open-meteo.com/en/docs/historical-weather-api ，固定 `models=era5`、`timezone=Asia/Shanghai`，城市中心 2 m 日均温度、相对湿度。按 Open-Meteo 的 CC BY 4.0 数据条款署名，非商业免费接口的使用仍受服务限制。
- 窗口：入院前第 30 日至前 1 日；三项各至少 27 日。均值按有效日等权。缺失不填零、不填预测值、不用 CAMS 估算替换监测。
- ERA5 通常延迟约 5 天。近日期或源站缺测可能使覆盖不足；网站将只允许临床与日历结果。
- PM₂.₅ 源站不提供浏览器跨域读取许可，故由 GitHub Actions 每天北京时间 06:23 更新最近 40 日的公共城市数据；GitHub 的定时任务可能延后。ERA5 也可在网页按需读取。旧数据保留。
- 环境 CSV 导入只作用于所选城市与当前窗口；标记为来源未经网站核验。

## 核验

```sh
node --test tests/*.test.mjs
```

包含 24 组纯虚构输入与原 Python 输出的数值对照、缺失值、POD1 锚定、闰年、30日边界、27日门槛、20小时门槛、重复日期拒绝。`docs/checkpoint-audit.json` 保存现存 checkpoint 对应 223 条保存折外预测的复核差异，只有汇总值。

`scripts/export_models.py --source <本地完整分析目录>` 使用原科研 Python 环境导出参数和人工构造的测试向量；不导出病例。它会重新拟合网站专用风险模型，不影响来源目录。`scripts/prepare_environment.py --source <原环境sources目录>` 仅导出公开城市环境序列。

## GitHub 发布

用户于 2026-10-27 明确授权将 `yitaozhengacademic-eng/pulse-hemoglobin-workbench` 设为公开。网站地址：https://yitaozhengacademic-eng.github.io/pulse-hemoglobin-workbench/ 。源码位于 `pulse-site/`，仅 `pulse-site/dist` 作为网页发布；原始患者表不在仓库内。

`.github/workflows/pulse-pages.yml` 已安装并启用：推送更新时测试并部署；每天北京时间 06:23 获取最近 40 日的公共城市环境数据，然后部署。定时执行可能延后，上游数据也可能缺失。网页显示实际更新时间与覆盖天数。其他私密仓库的可见性不受影响。

上传脚本默认仍要求私密仓库；更新本仓库时必须明确传入 `--expected-visibility public`。该选项仅核对预期，不会修改仓库可见性。CLI 上传不改变已通过浏览器安装的工作流。

## 参考产品

- BMJ QCOVID: https://www.bmj.com/content/371/bmj.m3731 ；https://www.qcovid.org/
- Nature Medicine TrialTranslator: https://www.nature.com/articles/s41591-024-03352-5 ；https://www.trialtranslator.com/
- Lancet Digital Health SOPHIA: https://doi.org/10.1016/S2589-7500(23)00135-8 。工具链接经作者资料与 IHI 项目报道交叉确认，但本次未成功测试其在线交互。

仅借鉴输入、时间轨迹、模型来源与用途边界的组织方式。未复制第三方图像或标识，不暗示顶刊发表或第三方背书。
