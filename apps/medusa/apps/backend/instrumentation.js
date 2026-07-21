// Instrumentation is optional for this project.
// Keep a JavaScript entry so production runtimes that do not load `.ts`
// files directly can resolve `/app/instrumentation` without failing.

function register() {}

module.exports = {
  register,
}
