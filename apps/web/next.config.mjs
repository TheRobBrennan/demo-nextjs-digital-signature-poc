/** @type {import('next').NextConfig} */
const nextConfig = {
  // The workspace packages ship TypeScript source, not a build - Next compiles
  // them alongside the app. Same source Node runs directly for the CLI.
  transpilePackages: ["@sig/core", "@sig/adapters"],
  // Next generates its own CLAUDE.md/AGENTS.md by default. This repo has one
  // at the root already; a second, machine-written one competing with it is
  // worse than none.
  agentRules: false,
};

export default nextConfig;
