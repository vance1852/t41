#!/usr/bin/env node
import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import { Rally, RallyResult, BatchResult } from "./types";
import { processRally, processBatch, explainRallyResult } from "./engine";
import {
  toJSON,
  toMarkdown,
  formatConsoleRally,
  formatConsoleBatch,
} from "./output";

const program = new Command();

program.name("vb-judge").description("排球训练营离线判定工具").version("1.0.0");

function loadRally(filePath: string): Rally {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`❌ 文件不存在: ${absPath}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(absPath, "utf-8");
  const data = JSON.parse(raw);
  if (Array.isArray(data)) {
    if (data.length === 0) {
      console.error("❌ JSON 数组为空");
      process.exit(1);
    }
    return data[0] as Rally;
  }
  if (data.rallies && Array.isArray(data.rallies)) {
    return data.rallies[0] as Rally;
  }
  return data as Rally;
}

function loadRallies(filePath: string): Rally[] {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`❌ 文件不存在: ${absPath}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(absPath, "utf-8");
  const data = JSON.parse(raw);
  if (Array.isArray(data)) return data as Rally[];
  if (data.rallies && Array.isArray(data.rallies))
    return data.rallies as Rally[];
  return [data as Rally];
}

function saveOutput(content: string, outPath: string): void {
  const absPath = path.resolve(outPath);
  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(absPath, content, "utf-8");
  console.log(`✅ 已写入: ${absPath}`);
}

function getBaseName(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

program
  .command("replay <file>")
  .description("单回合回放，输出裁判解释")
  .option("-j, --json <out>", "输出 JSON 到指定文件")
  .option("-m, --md <out>", "输出 Markdown 到指定文件")
  .option("-e, --event-id <id>", "仅解释指定事件 ID 的判罚")
  .option("-a, --all", "输出所有格式（在输入同目录）")
  .action((file, opts) => {
    const rally = loadRally(file);
    const result = processRally(rally);

    if (opts.eventId) {
      const explanation = result.explanation.find(
        (e) => e.eventId === opts.eventId,
      );
      if (!explanation) {
        console.error(`❌ 未找到事件 ID: ${opts.eventId}`);
        process.exit(1);
      }
      console.log("");
      console.log(`📋 判罚解释 - 事件 ${explanation.eventId}`);
      console.log(`────────────────────────────────`);
      console.log(`时间: ${explanation.time.toFixed(2)}s`);
      console.log(`事件类型: ${explanation.eventType}`);
      console.log(`动作: ${explanation.action}`);
      console.log(`规则参考: ${explanation.ruleReference}`);
      console.log(`结果: ${explanation.outcome}`);
      console.log("");
      return;
    }

    console.log(formatConsoleRally(result));

    if (opts.all) {
      const base = getBaseName(file);
      const dir = path.dirname(path.resolve(file));
      saveOutput(toJSON(result), path.join(dir, `${base}.result.json`));
      saveOutput(toMarkdown(result), path.join(dir, `${base}.result.md`));
    }

    if (opts.json) saveOutput(toJSON(result), opts.json);
    if (opts.md) saveOutput(toMarkdown(result), opts.md);
  });

program
  .command("batch <file>")
  .description("批量判定多回合，累计比分")
  .option("-s, --score <a:b>", '初始比分，格式 "A:B"，默认 0:0')
  .option("-j, --json <out>", "输出 JSON 到指定文件")
  .option("-m, --md <out>", "输出 Markdown 到指定文件")
  .option("-a, --all", "输出所有格式（在输入同目录）")
  .option("-v, --verbose", "同时显示每个回合详情")
  .action((file, opts) => {
    const rallies = loadRallies(file);
    let initialScore = { A: 0, B: 0 };

    if (opts.score) {
      const parts = String(opts.score).split(":");
      if (parts.length === 2) {
        const a = parseInt(parts[0], 10);
        const b = parseInt(parts[1], 10);
        if (!isNaN(a) && !isNaN(b)) {
          initialScore = { A: a, B: b };
        }
      }
    }

    const batch = processBatch(rallies, initialScore);
    console.log(formatConsoleBatch(batch));

    if (opts.verbose) {
      console.log("");
      for (const r of batch.rallies) {
        console.log(formatConsoleRally(r));
      }
    }

    if (opts.all) {
      const base = getBaseName(file);
      const dir = path.dirname(path.resolve(file));
      saveOutput(toJSON(batch), path.join(dir, `${base}.batch.json`));
      saveOutput(toMarkdown(batch), path.join(dir, `${base}.batch.md`));
    }

    if (opts.json) saveOutput(toJSON(batch), opts.json);
    if (opts.md) saveOutput(toMarkdown(batch), opts.md);
  });

program
  .command("explain <file> <eventId>")
  .description("解释某次判罚（同 replay -e）")
  .action((file, eventId) => {
    const rally = loadRally(file);
    const result = processRally(rally);
    const explanation = result.explanation.find((e) => e.eventId === eventId);
    if (!explanation) {
      console.error(`❌ 未找到事件 ID: ${eventId}`);
      process.exit(1);
    }
    console.log("");
    console.log(`📋 判罚解释 - 事件 ${explanation.eventId}`);
    console.log(`────────────────────────────────`);
    console.log(`时间: ${explanation.time.toFixed(2)}s`);
    console.log(`事件类型: ${explanation.eventType}`);
    if (explanation.team) console.log(`队伍: ${explanation.team} 队`);
    if (explanation.player !== undefined)
      console.log(`球员: ${explanation.player} 号`);
    console.log(`动作: ${explanation.action}`);
    console.log(`规则参考: ${explanation.ruleReference}`);
    console.log(`结果: ${explanation.outcome}`);
    console.log("");
  });

program
  .command("score <file>")
  .description("仅输出比分累计")
  .option("-s, --score <a:b>", '初始比分，格式 "A:B"')
  .action((file, opts) => {
    const rallies = loadRallies(file);
    let initialScore = { A: 0, B: 0 };
    if (opts.score) {
      const parts = String(opts.score).split(":");
      if (parts.length === 2) {
        const a = parseInt(parts[0], 10);
        const b = parseInt(parts[1], 10);
        if (!isNaN(a) && !isNaN(b)) initialScore = { A: a, B: b };
      }
    }
    const batch = processBatch(rallies, initialScore);
    console.log(
      `🏐 最终比分: A ${batch.matchScore.teamA} : ${batch.matchScore.teamB} B`,
    );
    console.log(`   回合数: ${batch.summary.totalRallies}`);
    console.log(
      `   A队胜: ${batch.summary.teamAWins}  B队胜: ${batch.summary.teamBWins}`,
    );
  });

program
  .command("samples")
  .description("列出内置样例回合")
  .action(() => {
    const samplesDir = path.resolve(__dirname, "..", "samples");
    if (!fs.existsSync(samplesDir)) {
      console.log("📁 样例目录: samples/");
      console.log("   - edge-ball.json      : 压线球（界内）");
      console.log("   - block-continue.json : 拦网后继续组织");
      console.log("   - serve-then-land.json: 发球擦网后落界内");
      console.log("   - interpolate-in.json : 插值落界内（采样点在界外）");
      console.log("   - out-of-order.json   : 事件时间乱序");
      console.log("   - rally-01.json       : 标准扣球回合");
      console.log("   - batch-01.json       : 批量回合集（含比分）");
      return;
    }
    const files = fs.readdirSync(samplesDir).filter((f) => f.endsWith(".json"));
    console.log(`📁 样例目录: ${samplesDir}`);
    for (const f of files) {
      console.log(`   - ${f}`);
    }
  });

program.parse();
