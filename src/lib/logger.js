const now = () => new Date().toISOString();

export const log = (scope, message, data = undefined) => {
  const payload = data === undefined ? "" : ` ${JSON.stringify(data)}`;
  process.stdout.write(`[${now()}] [${scope}] ${message}${payload}\n`);
};

export const logError = (scope, message, error) => {
  process.stderr.write(
    `[${now()}] [${scope}] ${message} ${JSON.stringify({
      name: error?.name,
      message: error?.message,
    })}\n`
  );
};
