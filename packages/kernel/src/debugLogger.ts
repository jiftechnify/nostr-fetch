type BasicLogLevel = "verbose" | "info" | "warn" | "error";
export type LogLevel = BasicLogLevel | "all" | "none";

const scoreForlogLevel = {
  all: 0,
  verbose: 10,
  info: 20,
  warn: 30,
  error: 40,
  none: 50,
} satisfies Record<LogLevel, number>;

const logFnForlogLevel = {
  verbose: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
} satisfies Record<BasicLogLevel, typeof console.log>;

/**
 * Logger for debug logs.
 */
export class DebugLogger {
  #minLevel: LogLevel;
  #prefix: string;
  #renderedPrefix: string;

  /**
   * Instantiates a logger.
   *
   * @param minLevel minimum log level
   * @param prefix   prefix for log lines from this logger (optional)
   */
  public constructor(minLevel: LogLevel, prefix?: string) {
    this.#minLevel = minLevel;
    this.#prefix = prefix ?? "";
    this.#renderedPrefix = prefix ? `[${prefix}]` : "";
  }

  /**
   * Derives a sub-logger from this logger.
   *
   * Prefix of new logger will inherit prefix of this logger, and `subPrefix` will be appended to it.
   */
  public subLogger(subPrefix: string): DebugLogger {
    return this.#prefix
      ? new DebugLogger(this.#minLevel, `${this.#prefix}:${subPrefix}`)
      : new DebugLogger(this.#minLevel, subPrefix);
  }

  /**
   * Emits log with the specified level.
   */
  public log(lv: BasicLogLevel, msg: unknown, ...optionalParams: unknown[]) {
    if (scoreForlogLevel[lv] < scoreForlogLevel[this.#minLevel]) {
      return;
    }
    this.#renderedPrefix
      ? logFnForlogLevel[lv](`${this.#renderedPrefix} ${msg}`, ...optionalParams)
      : logFnForlogLevel[lv](msg, ...optionalParams);
  }
}
