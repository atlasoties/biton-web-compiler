// Example programs, loaded from the .bit files next to this module.

import { EXAMPLES, DEFAULT_EXAMPLE, type ExampleMeta } from "./manifest.ts";

export interface Example extends ExampleMeta {
  code: string;
}

const sources = import.meta.glob<string>("./*.bit", { query: "?raw", import: "default", eager: true });

export const EXAMPLE_LIST: Example[] = EXAMPLES.map((meta) => {
  const code = sources[`./${meta.key}.bit`];
  if (code === undefined) throw new Error(`example ${meta.key}.bit is missing`);
  return { ...meta, code };
});

export const EXAMPLE_BY_KEY: Record<string, Example> = Object.fromEntries(EXAMPLE_LIST.map((e) => [e.key, e]));

export { DEFAULT_EXAMPLE };
