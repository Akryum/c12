import { promises as fsp, existsSync } from "node:fs";
import { resolve } from "pathe";
import * as dotenv from "dotenv";

export interface DotenvOptions {
  /**
   * The project root directory (either absolute or relative to the current working directory).
   */
  cwd: string;

  /**
   * What file to look in for environment variables (either absolute or relative
   * to the current working directory). For example, `.env`.
   */
  fileName?: string;

  /**
   * Whether to interpolate variables within .env.
   *
   * @example
   * ```env
   * BASE_DIR="/test"
   * # resolves to "/test/further"
   * ANOTHER_DIR="${BASE_DIR}/further"
   * ```
   */
  interpolate?: boolean;

  /**
   * An object describing environment variables (key, value pairs).
   */
  // eslint-disable-next-line no-undef
  env?: NodeJS.ProcessEnv;
}

export type Env = typeof process.env;

/**
 * Load and interpolate environment variables into `process.env`.
 * If you need more control (or access to the values), consider using `loadDotenv` instead
 *
 */
export async function setupDotenv(options: DotenvOptions): Promise<Env> {
  const targetEnvironment = options.env ?? process.env;

  // Load env
  const environment = await loadDotenv({
    cwd: options.cwd,
    fileName: options.fileName ?? ".env",
    env: targetEnvironment,
    interpolate: options.interpolate ?? true,
  });

  // Fill process.env
  for (const key in environment) {
    if (!key.startsWith("_") && targetEnvironment[key] === undefined) {
      targetEnvironment[key] = environment[key];
    }
  }

  return environment;
}

/** Load environment variables into an object. */
export async function loadDotenv(options: DotenvOptions): Promise<Env> {
  const environment = Object.create(null);

  const dotenvFile = resolve(options.cwd, options.fileName);

  if (existsSync(dotenvFile)) {
    const parsed = dotenv.parse(await fsp.readFile(dotenvFile, "utf8"));
    Object.assign(environment, parsed);
  }

  // Apply process.env
  if (!options.env._applied) {
    Object.assign(environment, options.env);
    environment._applied = true;
  }

  // Interpolate env
  if (options.interpolate) {
    interpolate(environment);
  }

  return environment;
}

// Based on https://github.com/motdotla/dotenv-expand
function interpolate(
  target: Record<string, any>,
  source: Record<string, any> = {},
  parse = (v: any) => v
) {
  function getValue(key: string) {
    // Source value 'wins' over target value
    return source[key] !== undefined ? source[key] : target[key];
  }

  function interpolate(value: unknown, parents: string[] = []) {
    if (typeof value !== "string") {
      return value;
    }
    const matches: string[] = value.match(/(.?\${?(?:[\w:]+)?}?)/g) || [];
    return parse(
      // eslint-disable-next-line unicorn/no-array-reduce
      matches.reduce((newValue, match) => {
        const parts = /(.?)\${?([\w:]+)?}?/g.exec(match);
        const prefix = parts[1];

        let value, replacePart: string;

        if (prefix === "\\") {
          replacePart = parts[0];
          value = replacePart.replace("\\$", "$");
        } else {
          const key = parts[2];
          replacePart = parts[0].slice(prefix.length);

          // Avoid recursion
          if (parents.includes(key)) {
            // eslint-disable-next-line no-console
            console.warn(
              `Please avoid recursive environment variables ( loop: ${parents.join(
                " > "
              )} > ${key} )`
            );
            return "";
          }

          value = getValue(key);

          // Resolve recursive interpolations
          value = interpolate(value, [...parents, key]);
        }

        return value !== undefined
          ? newValue.replace(replacePart, value)
          : newValue;
      }, value)
    );
  }

  for (const key in target) {
    target[key] = interpolate(getValue(key));
  }
}
