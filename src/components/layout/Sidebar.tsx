import { useState } from "react";
import { BookOpen, Download, FileCode, Library, Upload } from "lucide-react";

import type { Demo } from "../../demos";
import { highlight } from "../../lib/highlight";

type Tab = "examples" | "reference" | "stdlib";

interface SidebarProps {
  demos: Record<string, Demo>;
  loadDemo: (key: string) => void;
  downloadCode: () => void;
  uploadCode: (name: string, text: string) => void;
}

// Language reference, following ../biton/README.md and grammar/biton.bnf.
const REFERENCE: Array<{ title: string; items: Array<{ code: string; note?: string }> }> = [
  {
    title: "Variables",
    items: [
      { code: "def x: int = 10;", note: "mutable, explicit type" },
      { code: "def pi = 3.14159;", note: "inferred (double)" },
      { code: "fix LIMIT: int = 100;", note: "immutable" },
      { code: "def p: Point;", note: "zero-initialised" },
    ],
  },
  {
    title: "Functions",
    items: [
      { code: "def add(a: int, b: int) => int {\n    give a + b;\n}", note: "give returns a value" },
      { code: "def log(msg: string) { }", note: "no return type" },
      { code: "def main() => int { give 0; }", note: "exit code of the program" },
      { code: "draw(x: 10, y: 20);", note: "named arguments" },
    ],
  },
  {
    title: "Control flow",
    items: [
      { code: "if x > 0 { } elif x < 0 { } else { }" },
      { code: "while i < 10 { i += 1; }" },
      { code: "for (def i: int = 0; i < n; i += 1) { }" },
      { code: "loop { exit; }", note: "exit/break, redo/continue" },
      { code: "outer: while true { break outer; }", note: "labelled loops" },
      { code: "when x {\n    1, 2, 3 -> give \"small\";\n    4..9    -> give \"medium\";\n    else    -> give \"large\";\n}" },
    ],
  },
  {
    title: "Types",
    items: [
      { code: "int  i8 i16 i32 i64  u8 u16 u32 u64", note: "int is 32-bit signed" },
      { code: "double  float  bool  char  string  any" },
      { code: "~int", note: "pointer" },
      { code: "int[10]  int[3][4]  int[]", note: "array, 2-D array, slice" },
      { code: "(int, bool)", note: "tuple; (a, b) = t;" },
      { code: "(int) -> int", note: "function type" },
      { code: "x as i64", note: "cast" },
    ],
  },
  {
    title: "Kinds, enums & unions",
    items: [
      { code: "kind Point { x: int, y: int };" },
      { code: "def q = Point { x: 1, y: 2 };" },
      { code: "impl Point {\n    def len2(self) => int {\n        give self.x * self.x + self.y * self.y;\n    }\n};", note: "self is a pointer to the receiver" },
      { code: "enum Color { Red, Green = 5, Blue };" },
      { code: "union Shape { Circle: double, Box: Rect };" },
      { code: "Shape::Circle as r -> give r * r;", note: "when arm with binding" },
      { code: "~>copy kind V { x: int };", note: "copied instead of moved" },
    ],
  },
  {
    title: "Generics & lambdas",
    items: [
      { code: "def id[T](x: T) => T { give x; }" },
      { code: "id<i64>(5)", note: "explicit type argument" },
      { code: "kind Cell[T] { value: T };", note: "Cell<int> { value: 3 }" },
      { code: "def f = |x: int| => int { give x * 2; };", note: "captures by value" },
    ],
  },
  {
    title: "Pointers, unsafe & defer",
    items: [
      { code: "def p: ~int = ref x;", note: "address-of" },
      { code: "unsafe { p~ = 99; }", note: "dereference only in unsafe" },
      { code: "unsafe { def y = p[2]; }", note: "pointer indexing" },
      { code: "defer x = 100;", note: "runs on scope exit, LIFO" },
      { code: "sizeof(int)  alignof(i64)  lengthof(xs)" },
    ],
  },
  {
    title: "Modules",
    items: [
      { code: "import std;", note: "then std::println_str(...)" },
      { code: "import std::{println_str, println_int};" },
      { code: "import std::math as m;" },
      { code: "pub def area() => int { give 0; }", note: "exported" },
      { code: "// line   /* nestable block */" },
    ],
  },
];

// Mirrors ../biton/lib/*.bit.
const STDLIB: Array<{ module: string; import: string; items: string[] }> = [
  {
    module: "std",
    import: "import std::{println_str, println_int};",
    items: [
      "print_str(s: string)",
      "println_str(s: string)",
      "print_int(v: int)",
      "println_int(v: int)",
      "print_bool(b: bool)",
      "println()",
    ],
  },
  {
    module: "std::math",
    import: "import std::math::{max, min};",
    items: [
      "abs(x: int) => int",
      "max(a: int, b: int) => int",
      "min(a: int, b: int) => int",
      "clamp(x: int, lo: int, hi: int) => int",
      "pow(base: int, exp: int) => int",
      "gcd(a: int, b: int) => int",
    ],
  },
  {
    module: "std::strings",
    import: "import std::strings::{length};",
    items: [
      "length(s: string) => int",
      "is_empty(s: string) => bool",
      "byte_at(s: string, i: int) => int",
      "starts_with(s: string, prefix: string) => bool",
    ],
  },
  {
    module: "std::collections",
    import: "import std::collections::{Buf, buf_push};",
    items: ["kind Buf[T]   // capacity 16", "buf_push(b: ~Buf<T>, v: T) => bool", "buf_get(b: ~Buf<T>, i: int) => T", "buf_len(b: ~Buf<T>) => int"],
  },
  {
    module: "std::box",
    import: "import std::box::{Box, box, unbox};",
    items: ["kind Box[T]   // owned heap value", "box(v: T) => Box<T>", "unbox(b: Box<T>) => T", "b.ptr() => ~T", "b.set(v: T)"],
  },
  {
    module: "std::mem",
    import: "import std::mem::{alloc, release};",
    items: ["alloc[T]() => ~T   // alloc<int>()", "release(p: ~T)", "replace(dst: ~T, v: T) => T"],
  },
];

function Code({ src }: { src: string }) {
  return <pre className="font-mono text-[11px] leading-6 whitespace-pre-wrap break-words">{highlight(src)}</pre>;
}

export default function Sidebar({ demos, loadDemo, downloadCode, uploadCode }: SidebarProps) {
  const [tab, setTab] = useState<Tab>("examples");
  const tabs: Array<[Tab, string]> = [
    ["examples", "Examples"],
    ["reference", "Language"],
    ["stdlib", "Stdlib"],
  ];

  return (
    <aside className="w-72 bg-[#051139] border-r border-[#6d5f50]/40 flex flex-col shrink-0">
      <div className="flex border-b border-[#6d5f50]/35 p-1 bg-[#0c122a] gap-1 shrink-0">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider text-center transition-all ${
              tab === key ? "bg-[#051139] text-[#fec153] border-b-2 border-[#fec153]" : "text-[#fcd389]/60 hover:text-[#fcd389]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
        {tab === "examples" && (
          <div className="space-y-4">
            <nav className="space-y-1">
              {Object.entries(demos).map(([key, item]) => (
                <button
                  key={key}
                  onClick={() => loadDemo(key)}
                  className="w-full text-left p-2 rounded transition-all group hover:bg-[#0c122a] flex items-start gap-2.5 border border-transparent hover:border-[#6d5f50]/40"
                >
                  <FileCode className="w-4 h-4 text-[#fec153] mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-white group-hover:text-[#ffa500] transition-colors">{item.title}</div>
                    <div className="text-[10px] text-[#fcd389]/60 leading-tight mt-0.5">{item.desc}</div>
                  </div>
                </button>
              ))}
            </nav>

            <div className="pt-3 border-t border-[#6d5f50]/30">
              <div className="text-[10px] font-extrabold text-[#fcd389]/50 uppercase tracking-widest mb-2 px-1">File</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={downloadCode}
                  className="flex items-center justify-center gap-1 py-1.5 px-2 bg-[#0c122a] text-[#fcd389]/85 hover:text-white rounded border border-[#6d5f50]/40 text-[10px] font-bold transition-all hover:border-[#ffa500]"
                >
                  <Download className="w-3 h-3" />
                  Download
                </button>
                <label className="flex items-center justify-center gap-1 py-1.5 px-2 bg-[#0c122a] text-[#fcd389]/85 hover:text-white rounded border border-[#6d5f50]/40 text-[10px] font-bold cursor-pointer transition-all hover:border-[#ffa500]">
                  <Upload className="w-3 h-3" />
                  Open .bit
                  <input
                    type="file"
                    accept=".bit,text/plain"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      file.text().then((text) => uploadCode(file.name, text));
                    }}
                  />
                </label>
              </div>
              <p className="text-[10px] text-[#fcd389]/45 mt-2 px-1 leading-relaxed">
                The editor holds one module. Imports of your own modules are not available here; the standard library is.
              </p>
            </div>
          </div>
        )}

        {tab === "reference" && (
          <div className="space-y-4">
            {REFERENCE.map((section) => (
              <div key={section.title}>
                <div className="text-[10px] font-bold text-[#fcd389]/50 uppercase tracking-widest mb-2 px-1 flex items-center gap-1.5">
                  <BookOpen className="w-3 h-3" />
                  {section.title}
                </div>
                <div className="space-y-1.5">
                  {section.items.map((item, i) => (
                    <div key={i} className="bg-[#0c122a] px-2 py-1 rounded border border-[#6d5f50]/20">
                      <Code src={item.code} />
                      {item.note && <div className="text-[10px] text-[#fcd389]/50 leading-tight pb-0.5">{item.note}</div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "stdlib" && (
          <div className="space-y-4">
            {STDLIB.map((m) => (
              <div key={m.module}>
                <div className="text-[10px] font-bold text-[#fec153] uppercase tracking-widest mb-1.5 px-1 flex items-center gap-1.5 font-mono">
                  <Library className="w-3 h-3" />
                  {m.module}
                </div>
                <div className="bg-[#0c122a] px-2 py-1 rounded border border-[#6d5f50]/20 mb-1.5">
                  <Code src={m.import} />
                </div>
                <div className="bg-[#0c122a] px-2 py-1 rounded border border-[#6d5f50]/20">
                  <Code src={m.items.join("\n")} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
