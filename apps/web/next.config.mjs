/** @type {import('next').NextConfig} */
const nextConfig = {
  // The workspace packages ship TypeScript source, not a build - Next compiles
  // them alongside the app. Same source Node runs directly for the CLI.
  // Standalone bundles a minimal server plus only the traced dependencies,
  // which is what infra/web.Dockerfile ships.
  output: "standalone",
  // The workspace root, not apps/web - otherwise tracing misses
  // packages/core and packages/adapters.
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  transpilePackages: ["@sig/core", "@sig/adapters"],
  // Next generates its own CLAUDE.md/AGENTS.md by default. This repo has one
  // at the root already; a second, machine-written one competing with it is
  // worse than none.
  agentRules: false,
};

export default nextConfig;
