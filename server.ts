import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { tokenize, Parser, Interpreter } from "./src/compiler/aether";

dotenv.config();

// Ensure parsing JSON utility is configured
const app = express();
app.use(express.json());

const PORT = 3000;

// Lazy initialization of Gemini client to prevent crashes if key is initially absent
let aiInstance: GoogleGenAI | null = null;
function getAIClient(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is missing.");
    }
    aiInstance = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiInstance;
}

// 1. API Endpoint: Explain biton Source Code
app.post("/api/gemini/explain", async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "Code parameter is required." });
    }

    const ai = getAIClient();
    const systemPrompt = `You are the lead compiler architect and technical writer for the pre-alpha programming language "biton".
biton is an expression-oriented, structured, light-weight scripting language with embedded visual design APIs.
Explain the following code snippet concisely and informatively. Point out any syntax patterns, parameters, or functions.
Format in clear, high-contrast, beautiful Markdown. Keep it brief.`;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [
        {
          text: `Please explain this biton code:\n\n\`\`\`biton\n${code}\n\`\`\``,
        },
      ],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.3,
      },
    });

    res.json({ result: response.text });
  } catch (error: any) {
    console.error("Gemini Explain API error:", error);
    res.status(500).json({ error: error.message || "An error occurred with the AI assistant." });
  }
});

// 2. API Endpoint: Fix Compiler / Runtime Error
app.post("/api/gemini/fix-error", async (req, res) => {
  try {
    const { code, errorMessage } = req.body;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "Code param is required." });
    }

    const ai = getAIClient();
    const systemPrompt = `You are a compiler debugger assistant of the scripting language "biton".
biton syntax guidelines:
- Variable declarations: \`let name = value;\` or \`let name = expression;\`
- Conditionals: \`if (condition) { statements } else { statements }\`
- Functions: \`fn name(arg1, arg2) { statements; return expression; }\` or expressions
- Built-in canvas operations: 
  - \`canvas.clear(color);\` (e.g. "darkgray", "#ff0000")
  - \`canvas.circle(x, y, radius, color);\`
  - \`canvas.rect(x, y, width, height, color);\`
  - \`canvas.line(x1, y1, x2, y2, strokeWidth, color);\`
  - \`canvas.text(text, x, y, size, color);\`
- Built-in utility commands:
  - \`print(any);\` outputs values to console.
  - \`math.sin(val)\`, \`math.cos(val)\`, \`math.random(min, max)\`, \`math.pi\`
  - \`sys.time()\` (millisecond timestamps), \`sys.help()\`

The user has written biton code that fails with the provided error.
Analyze the syntax and semantics, fix the code, and return a clean JSON structure:
{
  "explanation": "Brief human explanation of what the bug was and how you fixed it in 1-2 sentences.",
  "fixedCode": "The full, complete fixed biton program with correct indentation and syntax."
}`;

    const promptMessage = `Code:
\`\`\`biton
${code}
\`\`\`

Reported compiler or system error message:
"${errorMessage || "Unknown Compilation / Semantic Error"}"`;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{ text: promptMessage }],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const parsedResponse = JSON.parse(response.text || "{}");
    if (parsedResponse.fixedCode) {
      parsedResponse.fixedCode = String(parsedResponse.fixedCode);
    }
    res.json(parsedResponse);
  } catch (error: any) {
    console.error("Gemini Fix API error:", error);
    res.status(500).json({ error: error.message || "An error occurred during error fixing auto-analysis." });
  }
});

// 2.5 API Endpoint: Server-Side Compiler & Executor
app.post("/api/compile", async (req, res) => {
  try {
    const { code } = req.body;
    if (typeof code !== "string") {
      return res.status(400).json({ success: false, error: "Code is required" });
    }

    const tStart = parseFloat(process.hrtime.bigint().toString()) / 1e6;
    const tokens = tokenize(code);
    const parser = new Parser(tokens);
    const ast = parser.parse();
    const parseEnd = parseFloat(process.hrtime.bigint().toString()) / 1e6;

    if (parser.errors.length > 0) {
      return res.json({
        success: false,
        compileTimeMs: parseFloat((parseEnd - tStart).toFixed(3)),
        errors: parser.errors,
        tokenCount: tokens.length,
        lineCount: code.split("\n").length,
        output: [],
        symbols: [],
        executionTimeMs: 0,
      });
    }

    // Execute the program
    const interpreter = new Interpreter();
    const output: string[] = [];
    interpreter.onPrint = (val: string) => output.push(val);
    
    let executionError: string | null = null;
    try {
      interpreter.evaluateProgram(ast);
    } catch (e: any) {
      executionError = e.message || "Runtime error occurred.";
    }
    
    const tEnd = parseFloat(process.hrtime.bigint().toString()) / 1e6;
    const compileTimeMs = parseFloat((tEnd - tStart).toFixed(3));

    const symbols = interpreter.getEnvironment().getAllSymbols();
    const canvasOps = interpreter.getCanvasOps();

    return res.json({
      success: true,
      compileTimeMs,
      tokenCount: tokens.length,
      lineCount: code.split("\n").length,
      errors: [],
      output,
      symbols,
      executionTimeMs: parseFloat((parseEnd - tStart).toFixed(3)),
      executionError,
      canvasOps,
    });
  } catch (error: any) {
    console.error("Compile API error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "An unexpected error occurred during server-side compilation.",
    });
  }
});

// 3. API Endpoint: Generate Custom Challenge/Demo Code
app.post("/api/gemini/generate", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt parameter is required." });
    }

    const ai = getAIClient();
    const systemPrompt = `You are the ultimate code simulator and demo generator for the pre-alpha language "biton".
Generate a working biton scripting program based on user requirements. Use full graphics if requested (using canvas.rect, canvas.circle, canvas.line, canvas.text, math.sin, math.cos, sys.time() animations, etc.) to show off capabilities.
Return a structured JSON output with the following format:
{
  "code": "The full syntactically valid biton program string.",
  "explanation": "A short, supportive guide on what the generated canvas art or script achieves."
}`;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{ text: `Generate biton code for: ${prompt}` }],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        temperature: 0.7,
      },
    });

    let parsed: any;
    try {
      parsed = JSON.parse(response.text || "{}");
    } catch (parseError: any) {
      console.error("JSON parse error:", parseError);
      return res.status(500).json({ error: "Failed to parse AI response." });
    }
    if (parsed.code) {
      parsed.code = String(parsed.code);
    }
    res.json(parsed);
  } catch (error: any) {
    console.error("Gemini Generate API error:", error);
    res.status(500).json({ error: error.message || "Could not generate sample code." });
  }
});

// Configure Vite middleware or production physical static routes
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Pre-Alpha Compiler Studio listening at http://0.0.0.0:${PORT}`);
  });
}

setupServer();
