# biton-web-compiler

A web-based IDE and compiler for the pre-alpha programming language **biton**. Server-side lexer/parser/interpreter with a React frontend, HTML5 canvas rendering, and optional Gemini AI assistance.

## Features

- **Server-side compilation** — lexer, recursive-descent parser, and tree-walk interpreter (`src/compiler/aether.ts`)
- **Syntax-highlighted editor** — custom overlay editor with line numbers, undo/redo, and block-comment highlighting
- **Live canvas preview** — 320×320 HTML5 canvas renderer for `canvas.*` drawing primitives
- **Interactive terminal** — shell commands (`run`, `vars`, `sys.help`, `clear`) with history
- **AI Assistant** — Gemini-powered code explanation, error auto-fix, and code generation
- **Demo playground** — pre-loaded scripts showcasing animations, graphics, and math

## Language support

| Feature | Syntax |
|---|---|
| Variables | `let name = value;` |
| Functions | `fn name(a, b) { return a + b; }` |
| Conditionals | `if (x) { } else if (x) { } else { }` |
| Loops | `while (x) { break; continue; }` |
| Returns | `return value;` |
| Comments | `// line` and `/* block */` |
| Unary | `-x` |
| Print | `print("hello", x);` |
| Math | `math.pi`, `math.sin`, `math.cos`, `math.abs`, `math.sqrt`, `math.floor`, `math.ceil`, `math.random` |
| System | `sys.time()`, `sys.help()` |
| Canvas | `canvas.clear(color)`, `canvas.circle`, `canvas.rect`, `canvas.line`, `canvas.text` |

## Canvas API

```
canvas.clear("#080a14");
canvas.circle(x, y, radius, color);
canvas.rect(x, y, width, height, color);
canvas.line(x1, y1, x2, y2, strokeWidth, color);
canvas.text("text", x, y, size, color);
```

## Run locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```
   npm install
   ```
2. (Optional) Set `GEMINI_API_KEY` in `.env.local` to enable AI features.
3. Start the dev server:
   ```
   npm run dev
   ```
4. Open `http://localhost:3000`

## Available scripts

- `npm run dev` — start development server (Vite + Express)
- `npm run build` — production build
- `npm run start` — run production server
- `npm run lint` — TypeScript type check (`tsc --noEmit`)

## Architecture

- `src/compiler/aether.ts` — lexer, parser, interpreter, AST node types
- `src/compiler/types.ts` — shared token/symbol/environment types
- `server.ts` — Express API (`/api/compile`, `/api/gemini/explain`, `/api/gemini/fix-error`, `/api/gemini/generate`)
- `src/App.tsx` — main React UI (editor, terminal, canvas, AI panels)
- `src/components/` — editor, sidebar, header/footer, visualizer, right panel
