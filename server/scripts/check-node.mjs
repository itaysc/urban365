// Fails fast with a clear message when the wrong Node version is active.
// (On Node < 22 the Nest CLI crashes with a cryptic ERR_REQUIRE_CYCLE_MODULE.)
const required = 22;
const major = Number(process.versions.node.split('.')[0]);
if (major < required) {
  console.error(
    `\nThis project needs Node ${required}+, but this terminal is using Node ${process.versions.node}.\n` +
      `Fix: run "nvm use" in the server folder (it reads .nvmrc), then try again.\n` +
      `To make Node ${required} your default: nvm alias default ${required}\n`,
  );
  process.exit(1);
}
