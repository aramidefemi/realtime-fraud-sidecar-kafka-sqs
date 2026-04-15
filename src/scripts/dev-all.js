import { spawn } from "node:child_process";

const commands = [
  ["npm", ["run", "bridge"]],
  ["npm", ["run", "worker:intake"]],
  ["npm", ["run", "worker:enrichment"]],
  ["npm", ["run", "worker:scoring"]],
  ["npm", ["run", "publisher:decision"]],
];

const procs = commands.map(([cmd, args]) =>
  spawn(cmd, args, {
    stdio: "inherit",
    shell: true,
  })
);

for (const proc of procs) {
  proc.on("exit", (code) => {
    if (code !== 0) {
      process.exitCode = code ?? 1;
      for (const p of procs) {
        if (!p.killed) p.kill("SIGTERM");
      }
    }
  });
}
