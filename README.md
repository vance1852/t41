# 排球训练营离线判定工具

根据排球回合事件和简化轨迹，自动判断得分方并输出裁判解释。

## 安装

```bash
npm install
```

## 命令行使用

所有命令通过 `npx ts-node src/cli.ts` 执行。

### 列出样例

```bash
npx ts-node src/cli.ts samples
```

### 单回合回放

```bash
npx ts-node src/cli.ts replay <回合文件.json>
npx ts-node src/cli.ts replay samples/rally-01.json
npx ts-node src/cli.ts replay samples/edge-ball.json -a   # 同时输出 JSON + Markdown 文件
```

### 批量判定

```bash
npx ts-node src/cli.ts batch <批量文件.json>
npx ts-node src/cli.ts batch samples/batch-01.json -v     # 显示每回合详情
npx ts-node src/cli.ts batch samples/batch-01.json -s 5:3 # 指定初始比分
```

### 比分累计

```bash
npx ts-node src/cli.ts score <批量文件.json>
npx ts-node src/cli.ts score samples/batch-01.json -s 10:8
```

### 解释某次判罚

```bash
npx ts-node src/cli.ts explain <回合文件.json> <事件ID>
npx ts-node src/cli.ts explain samples/block-continue.json e5
```

### 导出结果

`-a` 参数会在回合文件同目录生成 `.result.json` 和 `.result.md`：

```bash
npx ts-node src/cli.ts replay samples/rally-01.json -a
# 生成 samples/rally-01.result.json 和 samples/rally-01.result.md
```

## 样例说明

| 文件 | 场景 |
|------|------|
| `rally-01.json` | 标准扣球回合 |
| `edge-ball.json` | 压线球（球落在边线上） |
| `block-continue.json` | 拦网后继续组织（拦网不计入三次触球） |
| `serve-then-land.json` | 发球擦网后落界内 |
| `interpolate-in.json` | 采样点越界但插值落点在界内 |
| `out-of-order.json` | 事件时间乱序 |
| `challenge-review.json` | 挑战复核（推翻原判罚） |
| `batch-01.json` | 5回合批量样例 |

## 得分规则

- **球落在某队场区界内** → 对方得分
- **最后触球队把球打出界** → 对方得分
- **犯规（四次击球、连续触球、触网等）** → 犯规队对方得分
- **拦网触球不计入三次触球**，拦网后该队仍可触球三次
- **挑战复核成功** → 推翻原判，得分方反转

## 运行测试

```bash
npm test
```

测试覆盖：边界线判定、插值落点、触球次数、拦网特例、连续触球、事件乱序、挑战复核、批量比分。

## 项目结构

```
src/
  types.ts        类型定义
  court.ts        场地几何（界内判定、过网、落点插值）
  trajectory.ts   轨迹综合分析
  engine.ts       规则引擎（得分判定、犯规检测、挑战复核）
  output.ts       JSON / Markdown / Console 输出
  cli.ts          Commander CLI 入口
tests/
  court.test.ts
  trajectory.test.ts
  engine.test.ts
samples/
  *.json          回合样例
```
