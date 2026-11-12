import { BenchApi } from "./api";
import { readSettings } from "./config";
import { downloadForms, generateCopies } from "./corpus";
import { runFields, runLabels } from "./run";

function parseFlags(args: string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;
    const next = args[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags.set(arg.slice(2), "true");
    } else {
      flags.set(arg.slice(2), next);
      i += 1;
    }
  }
  return flags;
}

export function requireFlag(flags: Map<string, string>, name: string): string {
  const value = flags.get(name);
  if (!value || value === "true") {
    throw new Error(`--${name} <value> is required`);
  }
  return value;
}

const USAGE = `Usage: tsx scripts/label-suggestions-bench/src/cli.ts <command> [flags]
Commands:
  ping                                     check the backend and API key
  download                                 fetch the forms in forms.json
  generate [--copies 20]                   fill and flatten copies with answer keys
  run-labels --name <run> --engine <text> [--copies 10] [--with-descriptions]
  run-fields --name <run> --engine <text>`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  switch (command) {
    case "ping": {
      const models = await new BenchApi(readSettings()).listTemplateModels();
      console.log(
        `Backend reachable; the group has ${models.length} template models.`,
      );
      return;
    }
    case "download":
      await downloadForms();
      return;
    case "generate":
      await generateCopies(Number(flags.get("copies") ?? "20"));
      return;
    case "run-labels": {
      const dir = await runLabels({
        name: requireFlag(flags, "name"),
        engine: requireFlag(flags, "engine"),
        copies: Number(flags.get("copies") ?? "10"),
        withDescriptions: flags.get("with-descriptions") === "true",
      });
      console.log(`Report: ${dir}/labels-report.md`);
      return;
    }
    case "run-fields": {
      const dir = await runFields({
        name: requireFlag(flags, "name"),
        engine: requireFlag(flags, "engine"),
      });
      console.log(`Report: ${dir}/fields-report.md`);
      return;
    }
    default:
      console.log(USAGE);
      process.exitCode = command ? 1 : 0;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
