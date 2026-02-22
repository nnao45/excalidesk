type LogPayload = Record<string, unknown> | undefined;

function format(message: string, meta?: LogPayload): string {
  if (!meta || Object.keys(meta).length === 0) return message;
  try {
    return `${message} ${JSON.stringify(meta)}`;
  } catch {
    return message;
  }
}

const logger = {
  debug(message: string, meta?: LogPayload) {
    if (process.env.LOG_LEVEL === "debug") {
      console.debug(format(message, meta));
    }
  },
  info(message: string, meta?: LogPayload) {
    console.log(format(message, meta));
  },
  warn(message: string, meta?: LogPayload) {
    console.warn(format(message, meta));
  },
  error(message: string, meta?: LogPayload) {
    console.error(format(message, meta));
  },
};

export default logger;
