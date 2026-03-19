import pc from "picocolors";

export function printTable(rows: object[], columns?: string[]): void {
  if (rows.length === 0) {
    console.log(pc.dim("(no results)"));
    return;
  }

  const allRows = rows as Record<string, unknown>[];
  const keys = columns ?? Object.keys(allRows[0]);
  const widths = keys.map((k) =>
    Math.max(k.length, ...allRows.map((r) => String(r[k] ?? "").length)),
  );

  const header = keys.map((k, i) => pc.bold(k.padEnd(widths[i]))).join("  ");
  const divider = widths.map((w) => "─".repeat(w)).join("  ");

  console.log(header);
  console.log(pc.dim(divider));
  for (const row of allRows) {
    const line = keys.map((k, i) => String(row[k] ?? pc.dim("—")).padEnd(widths[i])).join("  ");
    console.log(line);
  }
}

export function printSuccess(msg: string): void {
  console.log(`${pc.green("✔")} ${msg}`);
}

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}
