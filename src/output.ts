import { RallyResult, BatchResult, JudgeExplanation, Violation } from "./types";

export function toJSON(
  result: RallyResult | BatchResult,
  pretty = true,
): string {
  return pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result);
}

export function toMarkdownRally(result: RallyResult): string {
  const lines: string[] = [];
  lines.push(`# 回合判定报告：${result.rallyName}`);
  lines.push("");
  lines.push(`**回合ID**：\`${result.rallyId}\``);
  lines.push("");
  lines.push(`## 判定结果`);
  lines.push("");
  lines.push(`- **胜方**：${result.winner === "A" ? "A 队" : "B 队"}`);
  lines.push(`- **判定理由**：${result.reason}`);
  lines.push("");

  lines.push(`## 关键数据`);
  lines.push("");
  lines.push(`| 项目 | A 队 | B 队 |`);
  lines.push(`|------|------|------|`);
  lines.push(
    `| 触球次数（不含拦网） | ${result.state.touchesByTeam.A} | ${result.state.touchesByTeam.B} |`,
  );
  lines.push(
    `| 总触球历史 | ${result.state.touchHistory.filter((t) => t.team === "A").length} | ${result.state.touchHistory.filter((t) => t.team === "B").length} |`,
  );
  lines.push("");

  if (result.state.netCrossings.length > 0) {
    lines.push(`## 过网记录`);
    lines.push("");
    lines.push(`| 时间(s) | 高度(m) | 是否过网 | 是否触标志杆 |`);
    lines.push(`|---------|---------|----------|--------------|`);
    for (const nc of result.state.netCrossings) {
      lines.push(
        `| ${nc.time.toFixed(3)} | ${nc.height.toFixed(3)} | ${nc.cleared ? "✅" : "❌"} | ${nc.hitAntenna ? "✅" : "❌"} |`,
      );
    }
    lines.push("");
  }

  if (result.state.landings.length > 0) {
    lines.push(`## 落点记录`);
    lines.push("");
    lines.push(`| 时间(s) | X坐标(m) | Y坐标(m) | 落在哪边 | 界内 | 压线 |`);
    lines.push(`|---------|----------|----------|----------|------|------|`);
    for (const lp of result.state.landings) {
      lines.push(
        `| ${lp.time.toFixed(3)} | ${lp.x.toFixed(3)} | ${lp.y.toFixed(3)} | ${lp.teamSide} | ${lp.inBounds ? "✅" : "❌"} | ${lp.onLine ? "✅" : "❌"} |`,
      );
    }
    lines.push("");
  }

  lines.push(`## 裁判解释 - 逐步骤`);
  lines.push("");
  lines.push(`| 步骤 | 时间(s) | 事件 | 队 | 球员 | 动作 | 规则参考 | 结果 |`);
  lines.push(`|------|---------|------|----|------|------|----------|------|`);
  for (const exp of result.explanation) {
    lines.push(
      `| ${exp.step} | ${exp.time.toFixed(2)} | ${exp.eventType} | ${exp.team || "-"} | ${exp.player ?? "-"} | ${exp.action} | ${exp.ruleReference} | ${exp.outcome} |`,
    );
  }
  lines.push("");

  if (result.violations.length > 0) {
    lines.push(`## 违规记录`);
    lines.push("");
    lines.push(`| 时间(s) | 类型 | 队伍 | 详情 |`);
    lines.push(`|---------|------|------|------|`);
    for (const v of result.violations) {
      lines.push(
        `| ${v.time.toFixed(2)} | ${v.type} | ${v.team} | ${v.description} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function toMarkdownBatch(batch: BatchResult): string {
  const lines: string[] = [];
  lines.push(`# 批量判定报告`);
  lines.push("");
  lines.push(`## 汇总`);
  lines.push("");
  lines.push(`- **总回合数**：${batch.summary.totalRallies}`);
  lines.push(`- **A 队胜场**：${batch.summary.teamAWins}`);
  lines.push(`- **B 队胜场**：${batch.summary.teamBWins}`);
  lines.push(
    `- **最终比分**：A ${batch.matchScore.teamA} : ${batch.matchScore.teamB} B`,
  );
  lines.push("");

  lines.push(`## 比分过程`);
  lines.push("");
  lines.push(`| # | 回合名 | 胜方 | 此时比分 A:B |`);
  lines.push(`|---|--------|------|--------------|`);
  batch.matchScore.rallyResults.forEach((r, i) => {
    lines.push(
      `| ${i + 1} | ${r.rallyName} | ${r.winner} 队 | ${r.scoreAfter.A}:${r.scoreAfter.B} |`,
    );
  });
  lines.push("");

  lines.push(`## 各回合详情`);
  lines.push("");
  for (const r of batch.rallies) {
    lines.push(`### ${r.rallyName}（ID: ${r.rallyId}）`);
    lines.push("");
    lines.push(`- 胜方：${r.winner} 队`);
    lines.push(`- 理由：${r.reason}`);
    if (r.violations.length > 0) {
      lines.push(
        `- 违规：${r.violations.map((v) => `${v.team}队${v.type}`).join("、")}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function toMarkdown(result: RallyResult | BatchResult): string {
  if ("rallies" in result && "matchScore" in result) {
    return toMarkdownBatch(result as BatchResult);
  }
  return toMarkdownRally(result as RallyResult);
}

export function formatConsoleRally(result: RallyResult): string {
  const lines: string[] = [];
  const divider = "─".repeat(60);
  lines.push(divider);
  lines.push(` 🏐 回合 ${result.rallyId}: ${result.rallyName}`);
  lines.push(divider);
  lines.push(` 🏆 胜方: ${result.winner === "A" ? "A 队" : "B 队"}`);
  lines.push(` 📋 理由: ${result.reason}`);
  lines.push("");
  lines.push(" 📜 判定过程:");
  for (const exp of result.explanation) {
    const prefix =
      exp.outcome.includes("犯规") || exp.outcome.includes("❌")
        ? "   ⚠️ "
        : "   ✅ ";
    lines.push(
      `${prefix}[t=${exp.time.toFixed(2)}s] ${exp.action} → ${exp.outcome}`,
    );
  }
  if (result.violations.length > 0) {
    lines.push("");
    lines.push(" ❌ 违规:");
    for (const v of result.violations) {
      lines.push(`    队${v.team} - ${v.description}`);
    }
  }
  lines.push(divider);
  return lines.join("\n");
}

export function formatConsoleBatch(batch: BatchResult): string {
  const lines: string[] = [];
  const divider = "═".repeat(60);
  lines.push(divider);
  lines.push(` 📊 批量判定结果`);
  lines.push(divider);
  lines.push(
    ` 总回合: ${batch.summary.totalRallies}  |  A: ${batch.summary.teamAWins}胜  |  B: ${batch.summary.teamBWins}胜`,
  );
  lines.push(
    ` 最终比分: A ${batch.matchScore.teamA} : ${batch.matchScore.teamB} B`,
  );
  lines.push("");
  lines.push(" 📝 比分过程:");
  batch.matchScore.rallyResults.forEach((r, i) => {
    const mark = r.winner === "A" ? "🔵" : "🔴";
    lines.push(
      `   ${mark} 第${i + 1}轮 ${r.rallyName}: ${r.winner}队胜 (${r.scoreAfter.A}:${r.scoreAfter.B})`,
    );
  });
  lines.push(divider);
  return lines.join("\n");
}

export function writeOutput(
  result: RallyResult | BatchResult,
  basePath: string,
): { json: string; md: string } {
  const jsonContent = toJSON(result);
  const mdContent = toMarkdown(result);
  return { json: jsonContent, md: mdContent };
}
