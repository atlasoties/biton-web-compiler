<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Biton Web Editor - Pre-Alpha Compiler Interface

A web-based IDE for the pre-alpha programming language "biton" with integrated visual canvas rendering, AI assistance via Gemini, and real-time compilation feedback.

## Features

- **Code Editor**: Custom syntax-highlighted editor for biton language with line numbers and undo/redo support
- **Visual Canvas**: 320x320 pixel HTML5 canvas renderer for biton graphics (draw circles, rectangles, lines, text)
- **Live Compilation**: Server-side compile API with error diagnostics
- **AI Assistant**: Gemini-powered code explanation, error fixing, and code generation
- **Terminal Console**: Interactive shell with command history and output display
- **Demo Scripts**: Pre-loaded examples including animations and visual demos

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Run production server
- `npm run lint` - Run TypeScript type check

## Biton Language Syntax

```
let x = 10;                    // Variable declaration
fn add(a, b) {                 // Function declaration
  return a + b;
}
if (x > 10) { ... }            // Conditional
else if (x > 5) { ... }        // Else-if chain
else { ... }                    // Fallback branch
while (x < 100) {              // Loop
  if (x == 50) { break; }      // Early exit
  if (x % 2 == 0) { continue; } // Skip iteration
  x = x + 1;
}
return value;                   // Return from function
print("Hello");                  // Output
```

Block comments are supported:
```
/* This is a multi-line
   block comment */
let x = -5;                    // Unary minus supported
```

## Canvas API

```
canvas.clear("#080a14");
canvas.circle(x, y, radius, color);
canvas.rect(x, y, width, height, color);
canvas.line(x1, y1, x2, y2, strokeWidth, color);
canvas.text("text", x, y, size, color);
```

## Math API

```
math.pi, math.sin(x), math.cos(x), math.random(), math.abs(x)
```# biton-web-compiler
