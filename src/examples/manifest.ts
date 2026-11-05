// The example programs shown in the sidebar. Each `<key>.bit` here has a
// `<key>.out` next to it: what it prints when run with `stdin` and `args`.
// `npm run test:examples` compiles and runs every one with the real
// compiler and compares (UPDATE_EXAMPLES=1 rewrites the .out files).
// Keep this file free of imports: Node's test runner loads it directly.

export interface ExampleMeta {
  key: string;
  title: string;
  desc: string;
  /** Standard input the example is meant to be run with. */
  stdin?: string;
  /** Program arguments the example is meant to be run with. */
  args?: string[];
}

export const EXAMPLES: ExampleMeta[] = [
  { key: "basics", title: "Biton Basics", desc: "Variables, functions, if/elif, range loops, print and interpolation" },
  { key: "types", title: "Structs, Enums & Unions", desc: "type declarations, extend blocks, Show, when matching" },
  { key: "errors", title: "Errors as Values", desc: "T? and T!, error, try, ??, some_or / ok_or" },
  { key: "generics", title: "Generics & Traits", desc: "Generic functions and types, traits, bounds, extends for builtins" },
  { key: "closures", title: "Functions & Closures", desc: "Function values, lambdas, returned closures, named and default args" },
  { key: "collections", title: "Collections & Text", desc: "Arrays and slicing, Vec, Map, sorting, Text search and formatting" },
  { key: "memory", title: "Pointers & Ownership", desc: "&x / *p, unsafe, defer, drop, Box and a heap list" },
  { key: "linkedlist", title: "Linked List", desc: "A singly linked list on Box: push, pop, borrowing, recursion" },
  {
    key: "input",
    title: "Input & Arguments",
    desc: "read_line over stdin, program arguments with std.env, trimming and comment lines",
    stdin: "10\n20\n# 30 is a comment\n 12\nhello\n",
    args: ["one", "two words"],
  },
  { key: "simulation", title: "Maths & Randomness", desc: "Floating point, std.math, seeded random numbers, a histogram" },
];

export const DEFAULT_EXAMPLE = "basics";
