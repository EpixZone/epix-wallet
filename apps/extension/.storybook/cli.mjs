import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Command } = require("commander");
const { build, withTelemetry } = require("@storybook/core-server");
const { cache } = require("@storybook/core-common");
const { logger } = require("@storybook/node-logger");

// Keep the supported Storybook 7 build APIs without the legacy CLI's unused
// extract command, Puppeteer downloader, and vulnerable ZIP extractor.
const program = new Command()
  .name("storybook")
  .version(require("@storybook/core-server/package.json").version);

function list(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function commonOptions(command) {
  return command
    .option(
      "--disable-telemetry",
      "Disable telemetry",
      Boolean(
        process.env.STORYBOOK_DISABLE_TELEMETRY &&
          process.env.STORYBOOK_DISABLE_TELEMETRY !== "false"
      )
    )
    .option("--enable-crash-reports", "Enable crash reports")
    .option("--debug", "Enable debug logs", false)
    .option("-s, --static-dir <directories>", "Static directories", list)
    .option("-c, --config-dir <directory>", "Storybook configuration directory")
    .option("--quiet", "Suppress verbose build output")
    .option("--loglevel <level>", "Logging level")
    .option("--debug-webpack", "Display Webpack configuration")
    .option("--webpack-stats-json [directory]", "Write Webpack statistics")
    .option("--preview-url <url>", "Use an external preview")
    .option("--force-build-preview", "Build the preview with --preview-url")
    .option("--docs", "Build documentation only");
}

async function run(command, cliOptions) {
  const environment = {
    staticDir: "SBCONFIG_STATIC_DIR",
    configDir: "SBCONFIG_CONFIG_DIR",
    ...(command === "dev"
      ? { port: "SBCONFIG_PORT", host: "SBCONFIG_HOSTNAME", ci: "CI" }
      : { outputDir: "SBCONFIG_OUTPUT_DIR" }),
  };
  for (const [option, variable] of Object.entries(environment)) {
    if (process.env[variable]) cliOptions[option] = process.env[variable];
  }
  if (cliOptions.port !== undefined) {
    const port = Number(cliOptions.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new RangeError("Port must be an integer between 0 and 65535");
    }
    cliOptions.port = port;
  }
  process.env.NODE_ENV ||= command === "dev" ? "development" : "production";
  logger.setLevel(cliOptions.loglevel);
  if (command === "build") {
    cliOptions.test =
      Boolean(cliOptions.test) || process.env.SB_TESTBUILD === "true";
  }

  const options = {
    ...cliOptions,
    mode: command === "dev" ? "dev" : "static",
    configDir: cliOptions.configDir || "./.storybook",
    ignorePreview:
      Boolean(cliOptions.previewUrl) && !cliOptions.forceBuildPreview,
    ...(command === "build"
      ? {
          outputDir: cliOptions.outputDir || "./storybook-static",
        }
      : {}),
    cache,
  };
  await withTelemetry(command, { cliOptions, presetOptions: options }, () =>
    build(options)
  );
}

commonOptions(program.command("dev"))
  .description("Start the extension's Storybook development server")
  .option("-p, --port <number>", "Server port")
  .option("-h, --host <hostname>", "Server hostname")
  .option("--https", "Serve over HTTPS")
  .option("--ssl-ca <certificates>", "SSL certificate authorities", list)
  .option("--ssl-cert <certificate>", "SSL certificate")
  .option("--ssl-key <key>", "SSL key")
  .option("--smoke-test", "Exit after a successful start")
  .option("--ci", "Skip prompts and opening the browser")
  .option("--no-open", "Do not open the browser")
  .option("--no-version-updates", "Skip the update check", true)
  .option("--initial-path [path]", "Initial browser path")
  .action((command) => run("dev", command.opts()));

commonOptions(program.command("build"))
  .description("Build the extension's static Storybook")
  .option("-o, --output-dir <directory>", "Static output directory")
  .option("--test", "Optimize the build for testing")
  .action((command) => run("build", command.opts()));

await program.parseAsync(process.argv);
