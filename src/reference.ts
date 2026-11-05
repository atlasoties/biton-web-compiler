// The Language and Stdlib tabs of the sidebar, following ../biton/README.md,
// grammar/biton.bnf and stdlib/*.bit (biton 1.0.0-beta syntax).

export interface ReferenceSection {
  title: string;
  items: Array<{ code: string; note?: string }>;
}

export const REFERENCE: ReferenceSection[] = [
  {
    title: "Variables",
    items: [
      { code: "x := 10", note: "type inferred (int)" },
      { code: "y: double = 2.5", note: "explicit type" },
      { code: "const LIMIT: int = 100", note: "immutable" },
      { code: "p: Point", note: "zero-initialised (or field defaults)" },
      { code: "a := 1; b := 2", note: "a newline ends a statement; `;` joins two" },
    ],
  },
  {
    title: "Functions",
    items: [
      { code: "fn add(a: int, b: int) int {\n    return a + b\n}", note: "return type after the parameters" },
      { code: "fn log(msg: string) { }", note: "no return type" },
      { code: "fn main() int { return 0 }", note: "the exit code of the program" },
      { code: "fn greet(name: string, times: int = 1) { }", note: "default parameter values" },
      { code: "draw(x: 10, y: 20)", note: "named arguments" },
      { code: "pub fn area() int { return 0 }", note: "visible to other modules" },
    ],
  },
  {
    title: "Printing",
    items: [
      { code: 'print("hello")', note: "any Show value, then a newline" },
      { code: 'print("x = {x}, sum = {a + b}")', note: "interpolation builds a Text" },
      { code: 'print(n, end: "")', note: "no newline" },
      { code: 'print("oops", err: true)', note: "to standard error" },
      { code: '"\\{ literal braces \\}"' },
    ],
  },
  {
    title: "Control flow",
    items: [
      { code: "if x > 0 { } elif x < 0 { } else { }" },
      { code: "while i < 10 { i += 1 }" },
      { code: "for i in 0..n { }", note: "0..n stops before n" },
      { code: "for i in 0..=n { }", note: "0..=n includes n" },
      { code: "for x in xs { }", note: "arrays, slices and Vec; x is the element" },
      { code: "for i, x in xs { }", note: "the index and the element" },
      { code: "for k, v in m { }", note: "keys and values of a Map (for k in m: keys)" },
      { code: "loop { break }", note: "break, continue" },
      { code: "outer: while true { break outer }", note: "labelled loops" },
      { code: 'when x {\n    1, 2, 3 -> print("small")\n    else -> print("large")\n}' },
      { code: 'size := when n { 0 -> "none", else -> "some" }', note: "when as an expression" },
      { code: "if a and not b or c { }", note: "logical operators are words" },
      { code: 'label := q > 0 ? "even" : "odd"', note: "conditional expression" },
    ],
  },
  {
    title: "Types",
    items: [
      { code: "int  i8 i16 i32 i64  u8 u16 u32 u64", note: "int is 32-bit signed" },
      { code: "double  float  bool  char  string  any", note: "char is a Unicode code point (32-bit)" },
      { code: "*int", note: "pointer" },
      { code: "[10]int  [3][4]int  []int", note: "array, 2-D array, slice" },
      { code: "xs[a..b]  xs[a..=b]  xs[a..]  xs[..b]", note: "slices; a view, except on a Text" },
      { code: "(int, bool)", note: "tuple; (a, b) = t" },
      { code: "fn(int) int", note: "the one function type: named functions, lambdas and closures" },
      { code: "T?   T!", note: "Option[T], and Result[T, error]" },
      { code: "x as i64", note: "cast" },
      { code: "sizeof(T)  alignof(T)  lengthof(xs)" },
    ],
  },
  {
    title: "Structs, enums & unions",
    items: [
      { code: "type Point { x: int, y: int }", note: "fields make a struct" },
      { code: "q := Point(x: 1, y: 2)", note: "fields by name; Point(1, 2) by order" },
      { code: 'type Config { name: string = "app" }', note: "field defaults" },
      { code: "type Color { Red, Green = 5, Blue }", note: "bare names make an enum" },
      { code: "type Shape { Circle(double), Dot }", note: "payloads make a union" },
      { code: "Circle(r) -> return r * r", note: "when arm; the type comes from the matched value" },
      { code: "light := Light.Red", note: "outside a pattern, name the variant's type" },
      { code: "Point(x: 0, y: _) -> ...", note: "struct pattern" },
      { code: "when &place { ... }", note: "match without moving; binds pointers" },
      { code: "@copy type V { x: int }", note: "copied instead of moved" },
    ],
  },
  {
    title: "Methods & traits",
    items: [
      {
        code: "extend Point {\n    fn len2(self) int {\n        return self.x * self.x + self.y * self.y\n    }\n}",
        note: "self is a pointer to the receiver",
      },
      { code: "extend Point { fn drop(self) { } }", note: "a destructor" },
      { code: "trait Area { fn area() double }" },
      { code: "extend Point: Show {\n    fn show(out: *Text) { out.append(\"({self.x}, {self.y})\") }\n}", note: "printable" },
      { code: "extend int: Ord { ... }", note: "builtin types take traits" },
      { code: "Self", note: "the implementing type" },
    ],
  },
  {
    title: "Generics & function values",
    items: [
      { code: "fn id[T](x: T) T { return x }" },
      { code: "id[i64](5)", note: "explicit type argument" },
      { code: "fn max[T: Ord + Show](a: T, b: T) T", note: "trait bounds" },
      { code: "type Pair[A, B] { a: A, b: B }", note: "Pair[int, double](a: 1, b: 2.0)" },
      { code: "f := fn(x: int) int { return x * 2 }", note: "lambda; captures by reference" },
      { code: "fn adder(n: int) fn(int) int {\n    return fn(x: int) int { return x + n }\n}", note: "a returned lambda keeps its captures" },
      { code: "fn apply(f: fn(int) int, x: int) int", note: "one function type accepts them all" },
    ],
  },
  {
    title: "Errors as values",
    items: [
      { code: "fn parse(s: string) int!" },
      { code: 'Result.Err(error(message: "bad", code: 2))' },
      { code: "n := try parse(s)", note: "the value, or return the error" },
      { code: "x ?? 0", note: "the value, or this when absent" },
      { code: "Option.Some(v)  Option.None" },
      { code: "some_or(o, 0)  ok_or(r, 0)", note: "the value or a default" },
      { code: "r.is_ok()  r.is_err()  o.is_some()  o.is_none()" },
      { code: "when r {\n    Ok(n) -> ...,\n    Err(e) -> ...\n}" },
    ],
  },
  {
    title: "Pointers, unsafe & defer",
    items: [
      { code: "p: *int = &x", note: "address-of" },
      { code: "unsafe { *p = 99 }", note: "dereference only in unsafe" },
      { code: "unsafe { y := p[2] }", note: "pointer indexing (unchecked)" },
      { code: "defer x = 100", note: "runs on scope exit, LIFO" },
      { code: "null" },
    ],
  },
  {
    title: "Modules",
    items: [
      { code: "import std.math", note: "then math.max(1, 2) or std.math.max(1, 2)" },
      { code: "import std.math.{max, min}" },
      { code: "import std.math as m", note: "then m.max(1, 2)" },
      { code: "import std.vec.{Vec}, std.math", note: "several modules in one statement" },
      { code: "pub import std.math.{max}", note: "re-export through this module" },
      { code: "// line   /* nestable /* block */ */" },
    ],
  },
];

export interface StdlibModule {
  module: string;
  import: string;
  items: string[];
}

// Mirrors ../biton/stdlib/*.bit.
export const STDLIB: StdlibModule[] = [
  {
    module: "prelude",
    import: "// always available, no import",
    items: [
      "print[T: Show](value: T, end: string = \"\\n\", err: bool = false)",
      "flush()",
      "type Option[T] { Some(T), None }   // T?",
      "type Result[T, E] { Ok(T), Err(E) }   // T! is Result[T, error]",
      "type error { message: Text, code: int = 0, path: Text = \"\" }",
      "some_or[T](o: Option[T], default: T) T",
      "ok_or[T, E](r: Result[T, E], default: T) T",
      "trait Show { fn show(out: *Text) }",
      "trait Ord { fn cmp(other: *Self) int }",
      "trait Eq { fn eq(other: *Self) bool }",
      "trait Hash { fn hash() u64 }",
    ],
  },
  {
    module: "std.text",
    import: "import std.text.{text, fixed, pad_left}",
    items: [
      "type Text   // owned, growable; in the prelude",
      "text(s: string) Text",
      "t.append(\"{x}\")  t.push_str(s)  t.push_byte(b)  t.push_char(c)",
      "t.len()  t.is_empty()  t.as_str()  t.byte_at(i)  t.at(i)",
      "t.equals(&u)  t.equals_str(s)  t.truncate(n)  t.clear()",
      "t.slice(lo, hi)  t.slice_from(lo)   // a new Text; t[a..b] also",
      "t.find(s, start: 0) int?  t.find_last(s) int?  t.contains(s)  t.count(s)",
      "t.starts_with(s)  t.ends_with(s)",
      "t.trim()  t.trim_start()  t.trim_end()  t.replace(old, new)",
      "t.to_upper()  t.to_lower()  t.repeat(n)",
      "t.split(sep)  t.words()  t.lines()  t.chars()   // -> Vec[Text] / Vec[char]",
      "fixed(x: double, digits: int) Text",
      "pad_left[T: Show](v: T, width: int, fill: char = ' ') Text",
      "pad_right[T: Show](v: T, width: int, fill: char = ' ') Text",
      "hex(n: u64) Text",
    ],
  },
  {
    module: "std.vec",
    import: "import std.vec.{Vec, vec}",
    items: [
      "type Vec[T]   // v: Vec[int]  or  v := vec[int]()",
      "push(v: T)  pop() T?  insert(i, v)  remove(i) T",
      "get(i) T   // copy; elements without a destructor",
      "at(i) *T   // pointer to the element",
      "set(i, v)  swap(i, j)  clear()",
      "len() int  is_empty() bool  capacity() int  reserve(n)",
      "v.slice(lo, hi)  v.slice_from(lo)  v.as_slice()",
    ],
  },
  {
    module: "std.map",
    import: "import std.map.{Map, map}",
    items: [
      "type Map[K: Hash + Eq, V]   // m: Map[string, int]",
      "set(k: K, v: V)",
      "get(k: K) *V?",
      "contains(k: K) bool  remove(k: K) V?",
      "len() int  is_empty() bool  clear()",
      "i := m.next(-1)\nwhile i >= 0 { unsafe { print(\"{*m.key_at(i)}: {*m.value_at(i)}\") }; i = m.next(i) }",
    ],
  },
  {
    module: "std.sort",
    import: "import std.sort.{sort, sort_by}",
    items: [
      "sort[T: Ord](v: *Vec[T])",
      "sort_by[T](v: *Vec[T], cmp: fn(*T, *T) int)",
      "sort_slice[T: Ord](xs: []T)",
      "is_sorted[T: Ord](v: *Vec[T]) bool",
      "binary_search[T: Ord](v: *Vec[T], x: T) int?",
    ],
  },
  {
    module: "std.math",
    import: "import std.math.{max, sqrt, PI}",
    items: [
      "abs  max  min  clamp  pow  gcd   // on int",
      "sqrt  powf  exp  ln  log10  log2   // on double",
      "sin  cos  tan  asin  acos  atan  atan2",
      "floor  ceil  round  trunc  fabs  fmod  hypot  fmin  fmax  is_nan",
      "const PI: double  const E: double",
    ],
  },
  {
    module: "std.strings",
    import: "import std.strings.{parse_int}",
    items: [
      "length(s: string) int",
      "is_empty(s: string) bool",
      "byte_at(s: string, i: int) int",
      "starts_with(s: string, prefix: string) bool",
      "parse_int(s: string) i64?",
      "parse_float(s: string) double?",
    ],
  },
  {
    module: "std.io",
    import: "import std.io.{read_line}",
    items: ["read_line() Text?   // None at the end of input"],
  },
  {
    module: "std.env",
    import: "import std.env.{args, arg}",
    items: ["args() Vec[Text]   // after the program name", "arg(i: int) Text?", "arg_count() int", "env_var(name: string) Text?"],
  },
  {
    module: "std.random",
    import: "import std.random.{rng, seeded}",
    items: [
      "rng() Rng   // seeded by the system",
      "seeded(seed: u64) Rng   // reproducible",
      "r.range(lo: int, hi: int) int   // lo <= x < hi",
      "r.below(n: u64) u64  r.fraction() double  r.chance(p: double) bool",
      "r.next_u64() u64",
      "shuffle[T](r: *Rng, v: *Vec[T])",
    ],
  },
  {
    module: "std.time",
    import: "import std.time.{now_ns, elapsed_ms}",
    items: ["now_ns() i64  elapsed_ms(start: i64) i64   // monotonic", "unix_seconds() i64  unix_millis() i64", "sleep_ms(ms: int)"],
  },
  {
    module: "std.fs",
    import: "import std.fs.{read_file, write_file}",
    items: [
      "read_file(path: string) Text!",
      "write_file(path, contents: string) int!",
      "append_file  remove_file  file_exists",
      "make_dir  remove_dir  is_dir  list_dir  current_dir",
    ],
  },
  {
    module: "std.process",
    import: "import std.process.{exit}",
    items: ["exit(code: int)", "run(command: string) int!", "output(command: string) Text!"],
  },
  {
    module: "std.box",
    import: "import std.box.{Box, box, unbox}",
    items: ["type Box[T]   // an owned heap value", "box[T](v: T) Box[T]", "unbox[T](b: Box[T]) T", "b.ptr() *T  b.set(v: T)"],
  },
  {
    module: "std.mem",
    import: "import std.mem.{alloc, release}",
    items: [
      "alloc[T]() *T",
      "release[T](p: *T)",
      "replace[T](dst: *T, v: T) T",
      "view[T](p: *T, n: int) []T   // a slice over n elements",
      "data[T](xs: []T) *T   // the first element's address",
    ],
  },
  {
    module: "std.slicing",
    import: "// implicit: xs[a..b] becomes a call of these",
    items: [
      "xs[a..b]   // up to, not including b",
      "xs[a..=b]  // including b",
      "xs[a..]  xs[..b]",
      "// a view of an array, slice or Vec; a new Text for a Text; a range outside stops the program",
    ],
  },
  {
    module: "std.option",
    import: "// in the prelude: T? is Option[T]",
    items: [
      "type Option[T] { Some(T), None }",
      "type Result[T, E] { Ok(T), Err(E) }   // T! is Result[T, error]",
      "some_or[T](o: T?, default: T) T",
      "ok_or[T, E](r: Result[T, E], default: T) T",
    ],
  },
  {
    module: "std.error",
    import: "// in the prelude",
    items: ["type error { message: Text, code: int = 0, path: Text = \"\" }", "// returned by `try`, `!` and std.fs, std.process"],
  },
  {
    module: "std.rt",
    import: "import std.rt.{flush, stop}",
    items: [
      "flush()",
      "emit(p: *u8, n: int, err: bool)",
      "exit(code: int)",
      "stop(message: string)   // print the message and stop",
      "const STOPPED = 101   // the exit status of stop",
    ],
  },
];

/** Public names of each std module (../biton/stdlib/<module>.bit), for completion. */
export const STDLIB_EXPORTS: Record<string, string[]> = {
  box: ["Box", "box", "unbox"],
  collections: ["Buf", "buf_push", "buf_get", "buf_len"],
  env: ["arg_count", "arg", "args", "env_var"],
  error: ["error"],
  fs: ["read_file", "write_file", "append_file", "file_exists", "remove_file", "make_dir", "remove_dir", "is_dir", "list_dir", "current_dir"],
  io: ["read_line"],
  map: ["Map", "map"],
  math: ["abs", "max", "min", "clamp", "pow", "gcd", "PI", "E", "sqrt", "powf", "exp", "ln", "log10", "log2", "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "floor", "ceil", "round", "trunc", "fabs", "fmod", "hypot", "fmin", "fmax", "is_nan"],
  mem: ["alloc", "release", "replace", "view", "data"],
  option: ["Option", "Result", "some_or", "ok_or"],
  process: ["exit", "run", "output"],
  random: ["Rng", "rng", "seeded", "shuffle"],
  rt: ["STOPPED", "flush", "emit", "exit", "stop", "stop_at"],
  slicing: [],
  sort: ["sort", "sort_by", "sort_slice", "is_sorted", "binary_search"],
  strings: ["length", "is_empty", "byte_at", "starts_with", "parse_int", "parse_float"],
  test: ["assert", "assert_eq", "fail"],
  text: ["Show", "Text", "text", "fixed", "pad_left", "pad_right", "hex"],
  time: ["now_ns", "elapsed_ms", "unix_seconds", "unix_millis", "sleep_ms"],
  traits: ["Ord", "Eq", "Hash", "mix64", "hash_bytes"],
  vec: ["Vec", "vec"],
};
