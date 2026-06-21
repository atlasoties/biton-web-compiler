import React, { useState, useEffect, useRef } from "react";
import { CompilerError } from "./compiler/types";
import { 
  Play, 
  Terminal as TerminalIcon, 
  HelpCircle, 
  Code, 
  RefreshCw, 
  Database, 
  FileCode, 
  Cpu, 
  Sparkles, 
  Check, 
  AlertTriangle, 
  Info, 
  Settings, 
  ChevronRight, 
  Download, 
  Upload, 
  Video,
  Undo2,
  Redo2
} from "lucide-react";

// Pre-Alpha biton Demo Scripts
const DEMO_SCRIPTS: Record<string, { title: string; desc: string; code: string }> = {
  intro: {
    title: "biton Introduction",
    desc: "Syntax fundamentals: variable scopes, print console, and runtime math",
    code: `// Welcome to the pre-alpha programming language biton!
// Core traits: Structured, expression-oriented, visual canvas APIs.

let greeting = "Hello, biton Creator!";
let version = 0.12;
let isPreAlpha = true;

print(greeting);
print("Current compiler build:", version);
print("Pre-alpha runtime environment check:", isPreAlpha);

// Arithmetic computation
let factor = 100 + 45 / 3 - 5;
print("Computation output factor:", factor);

// Trigonometry
let angle = math.pi / 4;
let sineVal = math.sin(angle);
print("Trig math.sin(pi/4) =", sineVal);

sys.help();
`
  },
  radar: {
    title: "Pulsing Space Radar",
    desc: "Visual graphics using math.sin / math.cos and delta timestamps",
    code: `// Interactive Canvas Animation!
// Enable [Loop Frame Animation] on the right pane to start the drawing loop ticker.

let width = 320;
let height = 320;
let centerX = 160;
let centerY = 160;

// Draw deep void background
canvas.clear("#07070a");

// Pulsing rates calculated using sys.time() (millisecond timestamp)
let t = sys.time() / 1000;
let radial1 = 40 + math.sin(t * 3.5) * 20;
let radial2 = 80 + math.cos(t * 2.0) * 30;
let radial3 = 120 + math.sin(t * 1.2) * 45;

// Output active orbital tracks
canvas.circle(centerX, centerY, radial1, "#12102e");
canvas.circle(centerX, centerY, radial2, "#181442");
canvas.circle(centerX, centerY, radial3, "#0d0d18");

// Draw sensor scanning sweep line
let scanX = centerX + math.sin(t * 2.2) * 120;
let scanY = centerY + math.cos(t * 2.2) * 120;
canvas.line(centerX, centerY, scanX, scanY, 3, "#6366f1");

// Draw dynamic entities/beacons
canvas.circle(centerX, centerY, 14, "#4f46e5");
canvas.circle(scanX, scanY, 8, "#38bdf8");
canvas.circle(scanX - 35, scanY + 45, 5, "#f43f5e");
canvas.circle(100, 220, 4, "#fbbf24");

// HUD overlay
canvas.text("HUD COMSYSTEMS Active", 15, 25, 12, "#38bdf8");
canvas.text("SWEEP HZ: 2.2", 15, 45, 10, "#475569");
canvas.text("EPOCH TIME: " + sys.time(), 15, 295, 10, "#475569");
`
  },
  bento: {
    title: "Generative Bento Grid",
    desc: "Visual mock-dashboard styled entirely with system canvas elements",
    code: `// Pre-Alpha System Canvas styling demo.
// Clean modern design bento nodes rendered step-by-step.

canvas.clear("#08080c");

let margin = 15;
let cardW = 135;
let cardH = 85;

// Block A: Compiler Node
canvas.rect(margin, margin, cardW, cardH, "#11111d");
canvas.text("BITON FRAME", margin + 12, margin + 25, 10, "#818cf8");
canvas.text("ACTIVE v0.1", margin + 12, margin + 48, 14, "#ffffff");
canvas.text("HEALTH: 100%", margin + 12, margin + 68, 9, "#10b981");

// Block B: Memory Pool Output
canvas.rect(margin * 2 + cardW, margin, cardW, cardH, "#11111d");
canvas.text("MEMORY BUFFER", margin * 2 + cardW + 12, margin + 25, 10, "#f472b6");
canvas.text("28.4 KB", margin * 2 + cardW + 12, margin + 48, 14, "#ffffff");
canvas.text("STABLE POOL", margin * 2 + cardW + 12, margin + 68, 9, "#10b981");

// Block C: Dynamic Oscilloscope Wave
let graphX = margin;
let graphY = margin * 2 + cardH;
let graphW = cardW * 2 + margin;
canvas.rect(graphX, graphY, graphW, 180, "#0e0e16");
canvas.text("REAL-TIME CORE REVERB FREQUENCY", graphX + 15, graphY + 25, 10, "#a78bfa");

let px = 0;
while (px < 260) {
  let valY = graphY + 100 + math.sin(px * 0.04 + sys.time() / 200) * 35;
  canvas.circle(graphX + 15 + px, valY, 2, "#6366f1");
  px = px + 8;
}

canvas.text("SIGNAL FEED: 124.9 HZ", graphX + 15, graphY + 160, 9, "#fda4af");
`
  },
  orbits: {
    title: "Celestial Solar System",
    desc: "Advanced visual mapping demonstrating state parameters & loops",
    code: `// Multi-orbit complex gravitational simulation
canvas.clear("#07070d");

let cx = 160;
let cy = 160;

// Standard Solar core
let t = sys.time() / 1500;
let sunSize = 25 + math.sin(t * 3) * 3;
canvas.circle(cx, cy, sunSize, "#fbbf24");

// Planet Alpha
let r1 = 55;
let x1 = cx + math.sin(t * 1.8) * r1;
let y1 = cy + math.cos(t * 1.8) * r1;
canvas.circle(x1, y1, 8, "#38bdf8");
// Moon of Planet Alpha
let xm1 = x1 + math.sin(t * 6.0) * 14;
let ym1 = y1 + math.cos(t * 6.0) * 14;
canvas.circle(xm1, ym1, 3, "#94a3b8");

// Planet Beta
let r2 = 100;
let x2 = cx + math.sin(t * 0.9) * r2;
let y2 = cy + math.cos(t * 0.9) * r2;
canvas.circle(x2, y2, 13, "#ec4899");

// Orbit paths overlays
canvas.line(cx, cy, x1, y1, 1, "#1e293b");
canvas.line(cx, cy, x2, y2, 1, "#1e293b");

canvas.text("SOLAR ORBIT COHESION", 15, 25, 11, "#ec4899");
`
  },
  c_demo: {
    title: "Biton Functions & Math",
    desc: "Demonstrate biton functions, math operations, and canvas integration",
    code: `// Biton functions and math demo
// Using let declarations and fn for functions

let radius = 12.5;
let height = 5.0;

// Custom function
fn calculate_volume(r, h) {
  return math.pi * r * r * h;
}

let vol = calculate_volume(radius, height);
print("Volume:", vol);

// Canvas rendering
canvas.clear("#080a14");
canvas.rect(20, 20, 280, 280, "#111528");
canvas.text("BITON FUNCTION DEMO", 35, 55, 13, "#fda4af");
canvas.text("Built-ins: math.pi, math.sin, math.cos", 35, 95, 11, "#a78bfa");
canvas.text("Syntax: let, fn, return, print", 35, 125, 11, "#67e8f9");`
  }
};

export default function App() {
  const [code, setCode] = useState<string>(DEMO_SCRIPTS.intro.code);
  const [errors, setErrors] = useState<CompilerError[]>([]);

  // Undo/Redo history states and helper
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const updateCodeWithHistory = (newVal: string, immediate = false) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    if (newVal === code) return;

    if (immediate) {
      const currentVal = code;
      setUndoStack((prev) => {
        if (prev.length > 0 && prev[prev.length - 1] === currentVal) return prev;
        const nextStack = [...prev, currentVal];
        if (nextStack.length > 100) nextStack.shift();
        return nextStack;
      });
      setRedoStack([]);
    } else {
      const currentVal = code;
      // We clear the redo stack since it's a new manual update
      setRedoStack([]);
      saveTimerRef.current = setTimeout(() => {
        setUndoStack((prev) => {
          if (prev.length > 0 && prev[prev.length - 1] === currentVal) return prev;
          const nextStack = [...prev, currentVal];
          if (nextStack.length > 100) nextStack.shift();
          return nextStack;
        });
      }, 500);
    }
    setCode(newVal);
  };

  const handleUndo = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    if (undoStack.length > 0) {
      const prev = undoStack[undoStack.length - 1];
      const currentVal = code;

      setRedoStack((r) => [...r, currentVal]);
      setUndoStack((u) => u.slice(0, u.length - 1));
      setCode(prev);
      addTerminalRow("sys", "Action restored from editor history stack.");
    } else {
      addTerminalRow("sys", "No further undo history recorded.");
    }
  };

  const handleRedo = () => {
    if (redoStack.length > 0) {
      const next = redoStack[redoStack.length - 1];
      const currentVal = code;

      setUndoStack((u) => [...u, currentVal]);
      setRedoStack((r) => r.slice(0, r.length - 1));
      setCode(next);
      addTerminalRow("sys", "Action re-applied from editor history stack.");
    } else {
      addTerminalRow("sys", "No further redo actions in buffer.");
    }
  };

// Evaluation States
   const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
   const [environmentVariables, setEnvironmentVariables] = useState<any[]>([]);
   const [executionTime, setExecutionTime] = useState<number | null>(null);
   const [animating, setAnimating] = useState<boolean>(false);
   const [autoCompile, setAutoCompile] = useState<boolean>(true);
   const [compilingServer, setCompilingServer] = useState<boolean>(false);

   // Gemini API state parameters
   const [explanation, setExplanation] = useState<string>("");
   const [geminiLoading, setGeminiLoading] = useState<boolean>(false);
   const [geminiError, setGeminiError] = useState<string>("");
   const [aiGeneratorPrompt, setAiGeneratorPrompt] = useState<string>("");
   const [aiSuccessMessage, setAiSuccessMessage] = useState<string>("");

   // UI Panels / Selected workspace states
   const [activeTab, setActiveTab] = useState<"snippets" | "state" | "cheatsheet">("snippets");
   const [rightPanel, setRightPanel] = useState<"diagnostics" | "ai-helper">("diagnostics");

   // Interactive Terminal Log
   const [terminalHistory, setTerminalHistory] = useState<Array<{ type: "cmd" | "out" | "err" | "sys"; text: string }>>([
    { type: "sys", text: "biton pre-alpha compiler terminal environment activated." },
    { type: "sys", text: "Interactive mode ready. Type 'help' to audit compiler capabilities." }
  ]);
  const [terminalInput, setTerminalInput] = useState<string>("");

  // Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const terminalBottomRef = useRef<HTMLDivElement | null>(null);

  // Auto-compile on code changes
  useEffect(() => {
    if (!autoCompile) return;

    const compileCode = async () => {
      try {
        const response = await fetch("/api/compile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const result = await response.json();

        if (result.success === false) {
          setErrors(result.errors || []);
        } else {
          setErrors([]);
        }
      } catch (e) {
        // Server unavailable
      }
    };
compileCode();
  }, [code, autoCompile]);

  // Sync scroll positioning of textarea and styled highlights
  const handleScroll = () => {
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  /**
   * Run the compiled biton expression or script inside the runtime environment
   */
  const executeProgram = async (syncState = true) => {
    setConsoleLogs([]);
    const startTime = performance.now();

    setCompilingServer(true);
    addTerminalRow("sys", "Sending source code to compile server (v0.12-PRE_ALPHA)...");
    try {
      const response = await fetch("/api/compile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
      });
      const result = await response.json();
      setCompilingServer(false);

      if (!response.ok) {
        throw new Error(result.error || "Server connection compilation failure.");
      }

      if (result.success === false) {
        if (Array.isArray(result.errors)) {
          setErrors(result.errors);
          addTerminalRow("err", `[SERVER COMPILE] FAILED: Code base has ${result.errors.length} syntax issues.`);
          result.errors.forEach((err: any) => {
            addTerminalRow("err", `  Line ${err.line}, Col ${err.col}: ${err.message}`);
          });
        } else {
          addTerminalRow("err", "[SERVER COMPILE] FAILED: Unknown parsing error.");
        }
        return;
      }

setErrors([]);
       
      // Display server results
      const output = result.output || [];
      const symbols = result.symbols || [];
      const canvasOps = result.canvasOps || [];
      
      output.forEach((line: string) => addTerminalRow("out", line));
      setConsoleLogs(output);
      setEnvironmentVariables(symbols);
      
      addTerminalRow("sys", `[SERVER COMPILE] SUCCESS: ${result.tokenCount} tokens compiled in ${result.compileTimeMs}ms.`);
      
      // Execute canvas operations on the frontend canvas
      if (canvasRef.current && canvasOps.length > 0) {
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, 320, 320);
          ctx.fillStyle = "#0c122a";
          ctx.fillRect(0, 0, 320, 320);
          
          for (const op of canvasOps) {
            switch (op.type) {
              case "clear":
                ctx.fillStyle = op.args[0] || "#0f0f13";
                ctx.fillRect(0, 0, 320, 320);
                break;
              case "circle": {
                const [x, y, r, color] = op.args;
                ctx.beginPath();
                ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
                ctx.fillStyle = color || "#ff007f";
                ctx.fill();
                break;
              }
              case "rect": {
                const [x, y, w, h, color] = op.args;
                ctx.fillStyle = color || "#00e5ff";
                ctx.fillRect(x, y, w, h);
                break;
              }
              case "line": {
                const [x1, y1, x2, y2, stroke, color] = op.args;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.lineWidth = stroke || 2;
                ctx.strokeStyle = color || "#ffffff";
                ctx.stroke();
                break;
              }
              case "text": {
                const [text, x, y, size, color] = op.args;
                ctx.fillStyle = color || "#ffffff";
                ctx.font = `${size || 14}px 'JetBrains Mono', monospace`;
                ctx.fillText(String(text), x, y);
                break;
              }
            }
          }
        }
      }
      
      const duration = parseFloat((performance.now() - startTime).toFixed(2));
      setExecutionTime(duration);
    } catch (err: any) {
      setCompilingServer(false);
      const errStr = err.message || "Failed to reach backend compiler server.";
      addTerminalRow("err", `[SERVER WARNING] ${errStr}.`);
    }
  };

  /**
   * Animation Loop Frame triggers
   */
  useEffect(() => {
    let frameId: number;
    
    const tick = () => {
      executeProgram(false); // Evaluate ticks without heavy state inspections
      if (animating) {
        frameId = requestAnimationFrame(tick);
      }
    };

    if (animating) {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [animating, code]);

  /**
   * Submits custom command inputs inside Terminal Simulator
   */
  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = terminalInput.trim();
    if (!query) return;

    addTerminalRow("cmd", query);
    setTerminalInput("");

    const normalizedCmd = query.toLowerCase();

    if (normalizedCmd === "clear") {
      setTerminalHistory([]);
      return;
    }
    if (normalizedCmd === "help") {
      addTerminalRow("sys", "biton Shell utility commands:\n- run: Compiles and runs editor program code\n- clear: Purges shell console lines\n- vars: Prints current scope environment parameters\n- help: Displays this index manual\n- sys.info: Provides structural engine metadata");
      return;
    }
    if (normalizedCmd === "run") {
      addTerminalRow("sys", "Starting execution call of editor buffer...");
      executeProgram();
      return;
    }
    if (normalizedCmd === "vars") {
      if (environmentVariables.length === 0) {
        addTerminalRow("sys", "Current Environment Scope is empty. Run a program to declare constants.");
      } else {
        const listStr = environmentVariables
          .map((sym) => `  ${sym.name}: ${typeof sym.value === "object" ? JSON.stringify(sym.value) : sym.value} (${sym.type})`)
          .join("\n");
        addTerminalRow("sys", `Active Global symbols:\n${listStr}`);
      }
      return;
    }
    if (normalizedCmd === "sys.info") {
      addTerminalRow("sys", `Compiler Info Specs:\n- Lang: biton Virtual Executable Core\n- Engine: Webpack AST v0.12 Pre-Alpha\n- Frame constraints: HTML Canvas API Bindings\n- Architecture: Server-side compiler`);
      return;
    }

    // Interactive expressions require server connection
    addTerminalRow("err", "Interactive expression evaluation requires server connection. Use 'run' to execute code.");
  };

  const addTerminalRow = (type: "cmd" | "out" | "err" | "sys", text: string) => {
    setTerminalHistory((prev) => [...prev, { type, text }]);
  };

  // Helper for quick script selections
  const loadDemo = (key: keyof typeof DEMO_SCRIPTS) => {
    setAnimating(false);
    updateCodeWithHistory(DEMO_SCRIPTS[key].code, true);
    addTerminalRow("sys", `Loaded preset challenge: "${DEMO_SCRIPTS[key].title}" successfully.`);
  };

  /**
   * Gemini API integrations
   */
  const explainCurrentCode = async () => {
    setGeminiLoading(true);
    setGeminiError("");
    setExplanation("");
    setRightPanel("ai-helper");

    try {
      const response = await fetch("/api/gemini/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        throw new Error("Explain request returned an error code from compilation host.");
      }

      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setExplanation(data.result || "No explanation outline parsed.");
    } catch (err: any) {
      setGeminiError(err.message || "Failed connecting to smart assistant service.");
    } finally {
      setGeminiLoading(false);
    }
  };

  const askAiToFixCode = async () => {
    if (errors.length === 0) {
      addTerminalRow("sys", "AI Advisor: Code holds zero lexical warning compiler constraints. Pure!");
      return;
    }

    setGeminiLoading(true);
    setGeminiError("");
    setRightPanel("ai-helper");
    addTerminalRow("sys", "Consulting Gemini AI Developer agent to resolve parser constraints...");

    const errText = errors.map(e => `Line ${e.line}: ${e.message}`).join("\n");

    try {
      const response = await fetch("/api/gemini/fix-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, errorMessage: errText }),
      });

      if (!response.ok) {
        throw new Error("Unable to obtain standard auto-fix from compiler advisor.");
      }

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      if (data.fixedCode) {
        updateCodeWithHistory(data.fixedCode, true);
        setExplanation(`**Diagnostic AI Fix Applied!**\n\n${data.explanation || "Corrected compiler statement syntax error."}`);
        addTerminalRow("sys", "Gemini successfully repaired editor script block syntax!");
      } else {
        throw new Error("AI assistant returned blank correction instructions.");
      }
    } catch (err: any) {
      setGeminiError(err.message || "Could not debug program via cloud endpoints.");
    } finally {
      setGeminiLoading(false);
    }
  };

  const handleCreatePromptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiGeneratorPrompt.trim()) return;

    setGeminiLoading(true);
    setGeminiError("");
    setAiSuccessMessage("");
    setRightPanel("ai-helper");
    addTerminalRow("sys", `Requesting smart compiler boilerplate: "${aiGeneratorPrompt}"`);

    try {
      const response = await fetch("/api/gemini/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiGeneratorPrompt }),
      });

      if (!response.ok) {
        throw new Error("Model rejected prompt syntax parameter generation rules.");
      }

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      if (data.code) {
        updateCodeWithHistory(data.code, true);
        setAiSuccessMessage(data.explanation || "biton source code generated.");
        setAiGeneratorPrompt("");
        addTerminalRow("sys", "Smart generator script configured correctly on active editor pad.");
      }
    } catch (err: any) {
      setGeminiError(err.message || "Could not complete prompt generation rules.");
    } finally {
      setGeminiLoading(false);
    }
  };

  /**
   * Rendering biton syntax nodes inside high-contrast HTML elements with aligned spacing
   */
  const renderHighlightedKeywords = (codeText: string) => {
    if (!codeText) return <span className="text-zinc-600 font-mono">_</span>;

    // Direct token identification splits
    const lines = codeText.split("\n");
    return lines.map((line, lineI) => {
      // Syntax highlighter for biton language: let, fn, if, else, return, while, print, math.*, canvas.*, sys.*
      const tokenRegex = /(\/\*[\s\S]*?\*\/)|(\/\/.*)|(".*?"|'.*?')|(\b\d+(?:\.\d+)?\b)|(\b(?:let|fn|if|else|return|while|true|false)\b)|(canvas\.[a-zA-Z_][a-zA-Z0-9]*|math\.[a-zA-Z_][a-zA-Z0-9]*|sys\.[a-zA-Z_][a-zA-Z0-9]*)|(\bprint\b)|([a-zA-Z_][a-zA-Z0-9_]*)(?=\s*\()|([a-zA-Z_][a-zA-Z0-9_]*)|([{}();,.[\]+\-*/=<>!&|]+)/g;

      const elements: React.ReactNode[] = [];
      let lastIndex = 0;
      let match;

      while ((match = tokenRegex.exec(line)) !== null) {
        const textBefore = line.substring(lastIndex, match.index);
        if (textBefore) {
          elements.push(documentTextNode(elements.length, textBefore));
        }

        const [
          full,
          blockComment,
          comment,
          str,
          num,
          keyword,
          native,
          customFunc,
          identifier,
          symbol
        ] = match;

        if (blockComment) {
          elements.push(<span key={match.index} className="text-[#6d5f50] italic font-mono">{blockComment}</span>);
        } else if (comment) {
          elements.push(<span key={match.index} className="text-[#6d5f50] italic font-mono">{comment}</span>);
        } else if (str) {
          elements.push(<span key={match.index} className="text-[#fcd389] font-mono">{str}</span>);
        } else if (num) {
          elements.push(<span key={match.index} className="text-[#ffa500] font-mono">{num}</span>);
        } else if (keyword) {
          elements.push(<span key={match.index} className="text-[#fec153] font-semibold font-mono">{keyword}</span>);
        } else if (native) {
          elements.push(<span key={match.index} className="text-emerald-400 font-medium font-mono">{native}</span>);
        } else if (customFunc) {
          elements.push(<span key={match.index} className="text-[#fdcc74] font-medium font-mono">{customFunc}</span>);
        } else if (identifier) {
          elements.push(<span key={match.index} className="text-zinc-100 font-mono">{identifier}</span>);
        } else if (symbol) {
          elements.push(<span key={match.index} className="text-[#fcd389]/60 font-mono">{symbol}</span>);
        }

        lastIndex = tokenRegex.lastIndex;
      }

      const remainingText = line.substring(lastIndex);
      if (remainingText) {
        elements.push(documentTextNode(elements.length, remainingText));
      }

      // If line is blank, put a break line
      return (
        <div key={lineI} className="min-h-[20px] whitespace-pre-wrap break-all font-mono">
          {elements.length > 0 ? elements : " "}
        </div>
      );
    });
  };

  const documentTextNode = (keyId: number, child: string) => {
    return <span key={`text-${keyId}`} className="text-zinc-400 font-mono">{child}</span>;
  };

  // Quick helper to download current source program
  const downloadCode = () => {
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "program.bt";
    link.click();
    addTerminalRow("sys", "Source file program.bt compiled and downloaded.");
  };

  /**
   * Main Applet UI Container - Executing "Sophisticated Dark" Design Rules (Widescreen layout)
   */
  return (
    <div className="flex flex-col h-screen min-h-[640px] bg-[#0c122a] text-[#fcd389]/90 font-sans selection:bg-[#ffa500]/20 overflow-hidden" id="biton-studio-container">
      
      {/* 1. Header Area with λ Indicator / Hexagon Brand Logo */}
      <header className="flex items-center justify-between px-4 py-3 bg-[#051139] border-b border-[#6d5f50]/40 shrink-0" id="header-bar-biton">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 shrink-0 animate-fade-in" id="biton-logo-wrapper">
            <svg viewBox="0 0 100 110" className="w-full h-full" referrerPolicy="no-referrer">
              {/* Deep midnight navy hexagon matching the brand logo color spec */}
              <polygon points="50,5 93,30 93,80 50,105 7,80 7,30" fill="#0c122a" stroke="#ffa500" strokeWidth="2.5" />
              
              {/* Dynamic golden brand markings inside */}
              {/* Vertical accent pointing down */}
              <line x1="50" y1="23" x2="50" y2="48" stroke="#fec153" strokeWidth="5.5" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 8px rgba(254,193,83,0.4))" }} />
              
              {/* Outer Wave / dipping chevron */}
              <path d="M 23,50 L 37,50 L 50,76 L 63,50 L 77,50" fill="none" stroke="#fdcc74" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              
              {/* Inner chevron */}
              <path d="M 40,56 L 50,75 L 60,56" fill="none" stroke="#ffba3c" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-extrabold tracking-widest text-white uppercase font-sans">biton <span className="text-[#fec153]">Standard Compiler</span></h1>
              <span className="text-[10px] bg-[#0c122a] border border-[#6d5f50]/40 px-2 py-0.5 rounded text-[#ffa500] font-bold tracking-wider uppercase">v0.12-PRE_ALPHA</span>
            </div>
            <p className="text-[10px] text-[#fcd389]/60 uppercase tracking-widest mt-0.5 font-mono">environment: client_sandbox_vtx</p>
          </div>
        </div>

        {/* Compile Controls Button Suite */}
        <div className="flex items-center gap-2">
          {/* Loop Animation toggle */}
          <button 
            onClick={() => setAnimating(!animating)}
            className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-2 transition-all ${
              animating 
                ? "bg-emerald-600/20 border border-emerald-500/60 text-emerald-400 shadow-sm" 
                : "bg-[#0c122a] border border-[#6d5f50]/40 hover:border-[#fdcc74] text-[#fcd389]/80 hover:text-white"
            }`}
            title="Starts RequestAnimationFrame loops drawing dynamic canvases."
            id="btn-loop-animation"
          >
            <Video className={`w-3.5 h-3.5 ${animating ? "animate-pulse" : ""}`} />
            <span>{animating ? "Looping Canvas" : "Loop Animation"}</span>
          </button>

          {/* Core Evaluate Trigger */}
          <button 
            onClick={() => executeProgram()}
            disabled={compilingServer}
            className="px-4 py-1.5 bg-[#ffa500] hover:bg-[#ffba3c] active:bg-[#fec153] text-[#051139] disabled:opacity-75 rounded text-xs font-black flex items-center gap-2 transition-all shadow-md shadow-[#ffa500]/20 hover:scale-[1.03]"
            id="btn-run-program"
          >
            {compilingServer ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin stroke-[#051139]" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-[#051139] stroke-[#051139]" />
            )}
            <span>{compilingServer ? "COMPILING..." : "RUN PROGRAM"}</span>
          </button>

          {/* Reset program */}
          <button
            onClick={() => {
              updateCodeWithHistory(DEMO_SCRIPTS.intro.code, true);
              setConsoleLogs([]);
              setEnvironmentVariables([]);
              setExecutionTime(null);
              setAnimating(false);
              addTerminalRow("sys", "Core environment resets correctly. Text editor restored.");
            }}
            className="p-1.5 bg-[#0c122a] border border-[#6d5f50]/40 hover:border-[#ffa500] rounded text-[#fcd389]/70 hover:text-white transition-colors"
            title="Reset code editor"
            id="btn-compiler-reset"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. Main Area (Flexible split) */}
      <div className="flex flex-1 overflow-hidden" style={{ backgroundColor: "#0c122a" }}>
        
        {/* LEFT COLUMN: Explorer Workspace, Pre-loaded snippets & CheatSheet */}
        <aside className="w-56 bg-[#051139] border-r border-[#6d5f50]/40 flex flex-col shrink-0" id="explorer-sidebar">
          
          {/* Sidebar Segment Tabs */}
          <div className="flex border-b border-[#6d5f50]/35 p-1 bg-[#0c122a] gap-1 shrink-0">
            <button 
              onClick={() => setActiveTab("snippets")}
              className={`flex-1 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider text-center transition-all ${activeTab === "snippets" ? "bg-[#051139] text-[#fec153] border-b-2 border-[#fec153] shadow-sm" : "text-[#fcd389]/60 hover:text-[#fcd389]"}`}
              id="sidebar-tab-snippets"
            >
              Files
            </button>
            <button 
              onClick={() => setActiveTab("state")}
              className={`flex-1 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider text-center transition-all ${activeTab === "state" ? "bg-[#051139] text-[#fec153] border-b-2 border-[#fec153] shadow-sm" : "text-[#fcd389]/60 hover:text-[#fcd389]"}`}
              id="sidebar-tab-state"
            >
              Env Variables
            </button>
            <button 
              onClick={() => setActiveTab("cheatsheet")}
              className={`flex-1 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider text-center transition-all ${activeTab === "cheatsheet" ? "bg-[#051139] text-[#fec153] border-b-2 border-[#fec153] shadow-sm" : "text-[#fcd389]/60 hover:text-[#fcd389]"}`}
              id="sidebar-tab-cheatsheet"
            >
              Help API
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 scrollbar-thin" id="explorer-content-container">
            {activeTab === "snippets" && (
              <div className="space-y-4">
                <div>
                  <div className="text-[10px] font-extrabold text-[#fcd389]/50 uppercase tracking-widest mb-2 px-1">WORKSPACE SNIPPETS</div>
                  <nav className="space-y-1">
                    {Object.entries(DEMO_SCRIPTS).map(([key, item]) => (
                      <button
                        key={key}
                        onClick={() => loadDemo(key)}
                        className="w-full text-left p-2 rounded transition-all group hover:bg-[#0c122a] flex items-start gap-2.5 border border-transparent hover:border-[#6d5f50]/40"
                        id={`snippet-${key}`}
                      >
                        <FileCode className="w-4 h-4 text-[#fec153] mt-0.5 shrink-0 group-hover:scale-105 transition-transform" />
                        <div>
                          <div className="text-xs font-semibold text-white group-hover:text-[#ffa500] transition-colors">{item.title}</div>
                          <div className="text-[10px] text-[#fcd389]/60 leading-tight mt-0.5 line-clamp-2">{item.desc}</div>
                        </div>
                      </button>
                    ))}
                  </nav>
                </div>

                <div className="pt-3 border-t border-[#6d5f50]/30 animate-fade-in">
                  <div className="text-[10px] font-extrabold text-[#fcd389]/50 uppercase tracking-widest mb-2 px-1">Import/Export</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={downloadCode}
                      className="flex items-center justify-center gap-1 py-1.5 px-2 bg-[#0c122a] hover:bg-[#0c122a]/70 text-[#fcd389]/85 hover:text-white rounded border border-[#6d5f50]/40 text-[10px] font-bold transition-all hover:border-[#ffa500]"
                      id="btn-download-ae"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download</span>
                    </button>
                    <label 
                      className="flex items-center justify-center gap-1 py-1.5 px-2 bg-[#0c122a] hover:bg-[#0c122a]/70 text-[#fcd389]/85 hover:text-white rounded border border-[#6d5f50]/40 text-[10px] font-bold cursor-pointer transition-all hover:border-[#ffa500]"
                      id="btn-upload-ae"
                    >
                      <Upload className="w-3 h-3" />
                      <span>Upload</span>
                      <input 
                        type="file" 
                        accept=".bt,.txt,.biton" 
                        className="hidden" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (evt) => {
                            if (evt.target?.result && typeof evt.target.result === "string") {
                              updateCodeWithHistory(evt.target.result, true);
                              addTerminalRow("sys", `Successfully loaded external file "${file.name}".`);
                            }
                          };
                          reader.readAsText(file);
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "state" && (
              <div className="space-y-3">
                <div className="text-[10px] font-extrabold text-[#fcd389]/50 uppercase tracking-widest px-1">BITON EVALUATOR MEMORY</div>
                
                {environmentVariables.length === 0 ? (
                  <div className="p-3 bg-[#0c122a] rounded border border-[#6d5f50]/30 text-center">
                    <Database className="w-5 h-5 text-[#fcd389]/30 mx-auto mb-1.5" />
                    <p className="text-[10px] text-[#fcd389]/50 leading-relaxed">No active scope variables. Run the compiler code to register dynamic symbols.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {environmentVariables.map((sym, index) => (
                      <div 
                        key={index}
                        className="p-2 bg-[#0c122a] border border-[#6d5f50]/40 rounded flex flex-col gap-1 transition-all hover:bg-[#0c122a]/80"
                        id={`symbol-card-${sym.name}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-[#fec153]">{sym.name}</span>
                          <span className="text-[9px] bg-[#ffa500]/10 text-[#ffa500] px-1 py-0.2 rounded font-mono uppercase shrink-0">
                            {sym.type}
                          </span>
                        </div>
                        <div className="font-mono text-[11px] text-[#fcd389] truncate bg-[#051139] px-1.5 py-1 rounded">
                          {typeof sym.value === "object" ? "[Internal API Object]" : String(sym.value)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "cheatsheet" && (
              <div className="space-y-4 text-xs">
<div>
                   <span className="text-[10px] font-bold text-[#fcd389]/50 uppercase tracking-widest block mb-2 px-1">LANGUAGE SYNTAX</span>
                   <div className="space-y-2 font-mono text-[11px]">
                      <div className="bg-[#0c122a] p-2 rounded border border-[#6d5f50]/20 text-[#fcd389]/80">
                        <span className="text-pink-400 font-semibold">let</span> x = <span className="text-[#ffa500]">10</span>;
                      </div>
                      <div className="bg-[#0c122a] p-2 rounded border border-[#6d5f50]/20 text-[#fcd389]/80">
                        <span className="text-pink-400 font-semibold">fn</span> add(a, b) &#123;<br/>
                        &nbsp;&nbsp;<span className="text-pink-400 font-semibold">return</span> a + b;<br/>
                        &#125;
                      </div>
                      <div className="bg-[#0c122a] p-2 rounded border border-[#6d5f50]/20 text-[#fcd389]/80">
                        <span className="text-pink-400 font-semibold">if</span> (x &gt; 5) &#123; ... &#125;
                      </div>
                      <div className="bg-[#0c122a] p-2 rounded border border-[#6d5f50]/20 text-[#fcd389]/80">
                        <span className="text-pink-400 font-semibold">else if</span> (x &gt; 3) &#123; ... &#125;
                      </div>
                      <div className="bg-[#0c122a] p-2 rounded border border-[#6d5f50]/20 text-[#fcd389]/80">
                        <span className="text-pink-400 font-semibold">while</span> (x &lt; 100) &#123;
                          <span className="text-pink-400 font-semibold">break</span>;
                          <span className="text-pink-400 font-semibold">continue</span>;
                        &#125;
                      </div>
                      <div className="bg-[#0c122a] p-2 rounded border border-[#6d5f50]/20 text-[#fcd389]/80">
                        <span className="text-[#ffa500]">-x</span>, <span className="text-pink-400 font-semibold">return</span> <span className="text-[#ffa500]">value</span>;
                      </div>
                   </div>
                 </div>

                 <div className="pt-2 border-t border-[#6d5f50]/30">
                   <span className="text-[10px] font-bold text-[#fcd389]/50 uppercase tracking-widest block mb-2 px-1">BUILTIN APIS</span>
                   <div className="space-y-1 font-mono text-[10px] text-[#fcd389]/80">
                      <div className="bg-[#0c122a] p-1.5 rounded border border-[#6d5f50]/20 truncate" title="print(values...)">
                        <span className="text-emerald-400">print</span>(val, ...)
                      </div>
                      <div className="bg-[#0c122a] p-1.5 rounded border border-[#6d5f50]/20 truncate" title="math.pi">
                        <span className="text-emerald-400">math.pi</span>, <span className="text-emerald-400">math.sin</span>(<span className="text-[#fdcc74]">x</span>), <span className="text-emerald-400">math.cos</span>(<span className="text-[#fdcc74]">x</span>), <span className="text-emerald-400">math.abs</span>(<span className="text-[#fdcc74]">x</span>)
                      </div>
                      <div className="bg-[#0c122a] p-1.5 rounded border border-[#6d5f50]/20 truncate" title="math.sqrt">
                        <span className="text-emerald-400">math.sqrt</span>(<span className="text-[#fdcc74]">x</span>), <span className="text-emerald-400">math.floor</span>(<span className="text-[#fdcc74]">x</span>), <span className="text-emerald-400">math.ceil</span>(<span className="text-[#fdcc74]">x</span>)
                      </div>
                      <div className="bg-[#0c122a] p-1.5 rounded border border-[#6d5f50]/20 truncate" title="math.random">
                        <span className="text-emerald-400">math.random</span>() | <span className="text-emerald-400">math.random</span>(min, max)
                      </div>
                      <div className="bg-[#0c122a] p-1.5 rounded border border-[#6d5f50]/20 truncate" title="sys.time()">
                        <span className="text-emerald-400">sys.time</span>() - timestamp in ms
                      </div>
                   </div>
                 </div>

                 <div className="pt-2 border-t border-[#6d5f50]/30">
                   <span className="text-[10px] font-bold text-[#fcd389]/50 uppercase tracking-widest block mb-2 px-1">CANVAS API</span>
                   <div className="space-y-1 font-mono text-[10px] text-[#fcd389]/80">
                     <div className="bg-[#0c122a] p-1.5 rounded border border-[#6d5f50]/20 truncate" title="canvas.clear(color)">
                       <span className="text-emerald-400">canvas.clear</span>(<span className="text-[#fdcc74]">"#080a14"</span>)
                     </div>
                     <div className="bg-[#0c122a] p-1.5 rounded border border-[#6d5f50]/20 truncate" title="canvas.circle(x, y, radius, color)">
                       <span className="text-emerald-400">canvas.circle</span>(<span className="text-[#fdcc74]">x</span>, <span className="text-[#fdcc74]">y</span>, <span className="text-[#fdcc74]">r</span>, <span className="text-[#fdcc74]">c</span>)
                     </div>
                     <div className="bg-[#0c122a] p-1.5 rounded border border-[#6d5f50]/20 truncate" title="canvas.rect(x, y, wid, hgt, color)">
                       <span className="text-emerald-400">canvas.rect</span>(<span className="text-[#fdcc74]">x</span>, <span className="text-[#fdcc74]">y</span>, <span className="text-[#fdcc74]">w</span>, <span className="text-[#fdcc74]">h</span>, <span className="text-[#fdcc74]">c</span>)
                     </div>
                     <div className="bg-[#0c122a] p-1.5 rounded border border-[#6d5f50]/20 truncate" title="canvas.line(x1, y1, x2, y2, weight, color)">
                       <span className="text-emerald-400">canvas.line</span>(<span className="text-[#fdcc74]">x1</span>,<span className="text-[#fdcc74]">y1</span>, <span className="text-[#fdcc74]">x2</span>,<span className="text-[#fdcc74]">y2</span>, <span className="text-[#fdcc74]">w</span>, <span className="text-[#fdcc74]">c</span>)
                     </div>
                     <div className="bg-[#0c122a] p-1.5 rounded border border-[#6d5f50]/20 truncate" title="canvas.text(txt, x, y, size, color)">
                       <span className="text-emerald-400">canvas.text</span>(<span className="text-[#fdcc74]">txt</span>, <span className="text-[#fdcc74]">x</span>, <span className="text-[#fdcc74]">y</span>, <span className="text-[#fdcc74]">s</span>, <span className="text-[#fdcc74]">c</span>)
                     </div>
                   </div>
                 </div>
              </div>
            )}
          </div>

          {/* Project Health meter matching design spec */}
          <div className="p-4 bg-[#0c122a] border-t border-[#6d5f50]/30" id="project-health-panel">
            <div className="text-[10px] text-[#fcd389]/50 mb-1.5 uppercase tracking-wider font-mono font-bold">PROJECT COMPILE HEALTH</div>
            <div className="flex items-center gap-2">
              <div className="w-full bg-[#051139] h-2 rounded-full overflow-hidden border border-[#6d5f50]/20">
                <div 
                  className={`h-full rounded-full transition-all duration-300 ${errors.length > 0 ? "bg-red-500 w-[30%]" : "bg-emerald-500 w-[100%]"}`} 
                />
              </div>
              <span className="text-[10px] font-mono font-bold text-zinc-400">
                {errors.length > 0 ? "30%" : "100%"}
              </span>
            </div>
          </div>
        </aside>

        {/* MIDDLE COLUMN: Text Editor Code block and Terminal execution output */}
        <main className="flex-1 flex flex-col bg-[#0c122a] overflow-hidden" id="editor-workspace">
          
          {/* Editor Header stats */}
          <section className="bg-[#051139] px-4 py-2 border-b border-[#6d5f50]/40 flex items-center justify-between text-xs text-[#fcd389]/60 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-emerald-500 font-bold font-mono">●</span>
              <span className="text-white font-mono font-bold">scratchpad.bt</span>
              <span className="text-[#6d5f50] font-bold">|</span>
              <span className="text-[10px] bg-[#0c122a] border border-[#6d5f50]/20 px-1.5 py-0.5 rounded text-[#fec153] uppercase font-mono font-bold">biton language syntax</span>
            </div>
            
            <div className="flex items-center gap-4">
              {executionTime !== null && (
                <div className="font-mono text-[10px] text-emerald-400 animate-pulse">
                  last evaluation: <span className="font-bold">{executionTime}ms</span>
                </div>
              )}
              <div className="flex items-center gap-3">
                {/* Undo/Redo History controls */}
                <div className="flex items-center gap-1 border-r border-[#6d5f50]/40 pr-3 mr-1">
                  <button
                    onClick={handleUndo}
                    disabled={undoStack.length === 0}
                    className="p-1 rounded text-[#fcd389]/75 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:bg-[#0c122a] border border-transparent hover:border-[#6d5f50]/30"
                    title="Undo (Ctrl+Z)"
                    id="btn-editor-undo"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleRedo}
                    disabled={redoStack.length === 0}
                    className="p-1 rounded text-[#fcd389]/75 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:bg-[#0c122a] border border-transparent hover:border-[#6d5f50]/30"
                    title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
                    id="btn-editor-redo"
                  >
                    <Redo2 className="w-3.5 h-3.5" />
                  </button>
                  {/* Subtle state indicator */}
                  {(undoStack.length > 0 || redoStack.length > 0) && (
                    <span className="text-[9px] font-mono text-[#fec153] px-1.5 py-0.2 rounded bg-[#fec153]/10 ml-1 select-none border border-[#fec153]/20 font-bold">
                      {undoStack.length}h
                    </span>
                  )}
                </div>

                {/* Format Code Action - hidden since lexer removed */}
                <div className="text-[10px] text-[#fcd389]/70 font-medium">Server-side compile</div>
              </div>
            </div>
          </section>

          {/* Code Workspace IDE Box */}
          <div className="flex-1 flex overflow-hidden relative" id="code-highlighter-wrapper">
            
            {/* Real-time Dynamic Line Numbers count */}
            <div className="w-11 bg-[#051139] font-mono text-[11px] text-[#fcd389]/40 text-right pr-2.5 pt-4 select-none border-r border-[#6d5f50]/35 select-none leading-6 shrink-0">
              {code.split("\n").map((_, i) => (
                <div key={i} className="min-h-[20px]">{i + 1}</div>
              ))}
            </div>

            {/* Overlaing Synchronized text Editor Area */}
            <div className="flex-1 relative h-full bg-[#0c122a] overflow-hidden">
              
              {/* Highlight Overlay beneath */}
              <pre 
                ref={preRef}
                className="absolute inset-0 w-full h-full p-4 m-0 pointer-events-none overflow-hidden font-mono text-sm leading-6 whitespace-pre break-all select-none"
                style={{ fontFamily: "'JetBrains Mono', Consolas, monospace" }}
                id="syntax-highlights-pre"
              >
                {renderHighlightedKeywords(code)}
              </pre>

              {/* Textarea Input Overlay */}
              <textarea
                ref={textareaRef}
                value={code}
                onChange={(e) => updateCodeWithHistory(e.target.value, false)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && !e.altKey) {
                    if (e.key.toLowerCase() === 'z') {
                      e.preventDefault();
                      if (e.shiftKey) {
                        handleRedo();
                      } else {
                        handleUndo();
                      }
                    } else if (e.key.toLowerCase() === 'y') {
                      e.preventDefault();
                      handleRedo();
                    }
                  }
                }}
                onScroll={handleScroll}
                className="absolute inset-0 w-full h-full p-4 m-0 bg-transparent text-transparent caret-white resize-none border-0 outline-none focus:ring-0 font-mono text-sm leading-6 whitespace-pre break-all scrollbar-thin"
                style={{ 
                  fontFamily: "'JetBrains Mono', Consolas, monospace",
                  WebkitTextFillColor: "transparent"
                }}
                spellCheck={false}
                id="interactive-code-textarea"
                placeholder="// Type biton code syntax..."
              />
            </div>
          </div>

          {/* 3. TERMINAL EMULATOR: Full command simulator directly inside branded widget */}
          <section className="h-56 bg-[#0c122a] border-t border-[#6d5f50]/40 flex flex-col font-mono shrink-0" id="terminal-emulator">
            
            {/* Terminal Top bar controls */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#051139] border-b border-[#6d5f50]/35 select-none">
              <div className="flex items-center gap-2">
                <TerminalIcon className="w-3.5 h-3.5 text-[#fec153]" />
                <span className="text-[10px] font-bold text-[#fcd389]/70 uppercase tracking-widest font-mono">Terminal Console — biton-shell</span>
              </div>
              
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setTerminalHistory([{ type: "sys", text: "Interactive terminal console flushed." }])}
                  className="text-[10px] text-[#fcd389]/55 hover:text-white hover:underline uppercase transition-all font-bold"
                  id="btn-clear-terminal-logs"
                >
                  Clear Console
                </button>
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#0c122a] border border-[#6d5f50]/40"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-[#ffa500]/40"></div>
                </div>
              </div>
            </div>

            {/* Scrollable Shell Output Rows */}
            <div className="flex-1 p-3 overflow-y-auto text-[11px] leading-relaxed space-y-1.5 scrollbar-thin font-mono text-[#fcd389]/85">
              {terminalHistory.map((row, idx) => {
                if (row.type === "cmd") {
                  return (
                    <div key={idx} className="flex items-start gap-1 font-mono text-[#fcd389]/60">
                      <span className="text-[#6d5f50] select-none font-bold">$</span>
                      <span className="whitespace-pre-wrap">{row.text}</span>
                    </div>
                  );
                }
                if (row.type === "err") {
                  return (
                    <div key={idx} className="bg-red-950/25 text-red-300 px-2.5 py-1.5 rounded border border-red-500/30 font-mono whitespace-pre-wrap">
                      {row.text}
                    </div>
                  );
                }
                if (row.type === "out") {
                  return (
                    <div key={idx} className="text-emerald-400 font-mono whitespace-pre-wrap font-semibold">
                      {row.text}
                    </div>
                  );
                }
                // Default 'sys' metadata statements
                return (
                  <div key={idx} className="text-[#ffa500]/90 font-mono whitespace-pre-wrap italic font-medium">
                    [SYSTEM] {row.text}
                  </div>
                );
              })}
              <div ref={terminalBottomRef} />
            </div>

            {/* Terminal Command Input Form */}
            <form onSubmit={handleTerminalSubmit} className="border-t border-[#6d5f50]/30 flex items-center bg-[#051139] px-3 shrink-0">
              <span className="text-[#fec153] font-bold mr-2 select-none">$</span>
              <input 
                type="text"
                value={terminalInput}
                onChange={(e) => setTerminalInput(e.target.value)}
                placeholder="Type raw commands or expressions eg: print(math.sin(5)); or variables"
                className="flex-1 bg-transparent py-2 outline-none text-[#fcd389] placeholder-[#fcd389]/30 text-[11px] font-mono border-0 focus:ring-0"
                id="terminal-cli-input"
              />
            </form>
          </section>
        </main>

        {/* RIGHT PANEL: Live Visual Preview and Dynamic AI Compiler Assistant */}
        <aside className="w-80 bg-[#051139] border-l border-[#6d5f50]/40 flex flex-col shrink-0 overflow-hidden" id="visualizer-bar">
          
          {/* Section 1: Live graphics screen canvas (HTML5 output) */}
          <section className="p-3 border-b border-[#6d5f50]/40 bg-[#0c122a] shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-[#fec153]" />
                <span className="text-[10px] font-bold text-[#fcd389]/70 uppercase tracking-widest">BITON GRAPHICS SCREEN</span>
              </div>
              <span className="text-[9px] text-[#ffa500] bg-[#ffa500]/10 border border-[#ffa500]/25 px-1.5 rounded uppercase font-mono tracking-wide font-black">
                RENDERER OK
              </span>
            </div>

            {/* Custom Interactive HTML5 target output canvas */}
            <div className="w-full flex items-center justify-center bg-[#0c122a] rounded border border-[#6d5f50]/40 p-1 shadow-inner relative group">
              <canvas 
                ref={canvasRef}
                width={320}
                height={320}
                className="w-full aspect-square bg-[#0c122a] rounded outline-none transition-shadow group-hover:shadow-lg"
                id="biton-graphics-canvas"
              />
              
              <div className="absolute top-2 right-2 bg-[#051139]/95 text-[9px] px-1.5 py-0.5 rounded font-mono text-[#fcd389]/50 select-none border border-[#6d5f50]/20">
                320px x 320px
              </div>
            </div>

            {/* Canvas Actions bar */}
            <div className="flex items-center justify-between mt-2">
              <p className="text-[10px] text-[#fcd389]/60 italic">Call <code className="text-emerald-400 font-mono">canvas.*</code> to draw live pixels</p>
              <button
                onClick={() => {
                  if (canvasRef.current) {
                    const ctx = canvasRef.current.getContext("2d");
                    if (ctx) {
                      ctx.clearRect(0, 0, 320, 320);
                      ctx.fillStyle = "#0c122a";
                      ctx.fillRect(0, 0, 320, 320);
                    }
                  }
                  addTerminalRow("sys", "Graphics canvas buffer cleared.");
                }}
                className="text-[10px] bg-[#0c122a] border border-[#6d5f50]/40 hover:border-[#ffa500] hover:text-white text-[#fcd389]/75 px-2.5 py-1 rounded transition-colors font-bold"
                id="btn-clear-canvas"
              >
                Clear Screen
              </button>
            </div>
          </section>

          {/* Tab Selection for right side pane */}
          <div className="flex border-b border-[#6d5f50]/30 bg-[#0c122a] shrink-0 p-1">
            <button
              onClick={() => setRightPanel("diagnostics")}
              className={`flex-1 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider text-center transition-all ${
                rightPanel === "diagnostics" 
                  ? "bg-[#051139] text-[#fec153] border-b-2 border-[#fec153]" 
                  : "text-[#fcd389]/60 hover:text-[#fcd389]"
              }`}
              id="right-panel-tab-diagnostics"
            >
              Diagnostics
            </button>
            <button
              onClick={() => setRightPanel("ai-helper")}
              className={`flex-1 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider text-center transition-all ${
                rightPanel === "ai-helper" 
                  ? "bg-[#051139] text-[#fec153] border-b-2 border-[#fec153]" 
                  : "text-[#fcd389]/60 hover:text-[#fcd389]"
              }`}
              id="right-panel-tab-ai"
            >
              AI Assistant
            </button>
          </div>

          {/* Section 2: Split dynamic view (Diagnostics or AI assistance) */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-between bg-[#0c122a]" id="right-panel-scroll-container">
            {rightPanel === "diagnostics" ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-extrabold text-[#fcd389]/50 uppercase tracking-widest font-mono">LEXICAL DIAGNOSTICS</div>
                  {errors.length > 0 && (
                    <span className="text-[10px] bg-red-950/40 text-red-400 border border-red-500/35 px-1.5 rounded font-mono">
                      {errors.length} ERRORS
                    </span>
                  )}
                </div>

                {errors.length === 0 ? (
                  <div className="bg-[#051139] border border-[#6d5f50]/30 p-3 rounded flex items-start gap-2.5 shadow-sm">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-[#fcd389]">AST Tree Evaluator: Green</div>
                      <p className="text-[10px] text-[#fcd389]/60 mt-0.5 leading-relaxed">No static syntax blocks violated lexical compliance parameters.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {errors.map((err, idx) => (
                      <div 
                        key={idx} 
                        className="bg-red-950/15 p-3 rounded border-l-3 border-red-500 border border-red-900/30 animate-fade-in"
                        id={`diagnostic-error-${idx}`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-red-500" />
                            ERROR
                          </span>
                          <span className="text-[9px] text-[#fcd389]/50 font-mono">line {err.line}, col {err.col}</span>
                        </div>
                        <p className="text-[11px] text-zinc-300 leading-normal font-mono">{err.message}</p>
                        
                        <button 
                          onClick={askAiToFixCode}
                          className="mt-2 text-[10px] bg-red-900/25 text-red-300 border border-red-500/20 px-2.5 py-0.5 rounded hover:bg-red-900/40 transition-all font-mono"
                          id={`diagnostics-fix-${idx}`}
                        >
                          ⚡ Auto-fix via Gemini
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Additional Code Analysis Telemetry */}
                <div className="pt-3 border-t border-[#6d5f50]/30 space-y-2.5">
                  <div className="text-[10px] font-bold text-[#fcd389]/50 uppercase font-mono">COMPILE RESULT</div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                    <div className="bg-[#051139] border border-[#6d5f50]/20 p-2 rounded">
                      <div className="text-[#fcd389]/50 font-bold">STATUS</div>
                      <div className="text-xs font-bold text-[#fec153] mt-0.5">{errors.length > 0 ? "ERROR" : "OK"}</div>
                    </div>
                    <div className="bg-[#051139] border border-[#6d5f50]/20 p-2 rounded">
                      <div className="text-[#fcd389]/50 font-bold">ERRORS</div>
                      <div className="text-xs font-bold text-[#ffa500] mt-0.5">{errors.length}</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              // AI WORKSPACE INTEGRATIONS
              <div className="flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#fcd389]/50 uppercase tracking-widest font-mono">GEMINI EXPERT COPILOT</span>
                    <Sparkles className="w-4 h-4 text-[#ffa500] animate-pulse" />
                  </div>

                  {/* AI Quick buttons */}
                  <div className="grid grid-cols-2 gap-2 shrink-0">
                    <button
                      onClick={explainCurrentCode}
                      disabled={geminiLoading}
                      className="py-1.5 px-2.5 bg-[#fec153]/10 hover:bg-[#fec153]/25 border border-[#fec153]/20 rounded font-bold text-[#fec153] text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                      id="btn-ai-explain"
                    >
                      <Info className="w-3.5 h-3.5" />
                      <span>Explain Code</span>
                    </button>
                    <button
                      onClick={askAiToFixCode}
                      disabled={geminiLoading}
                      className="py-1.5 px-2.5 bg-red-950/15 hover:bg-red-950/30 border border-red-500/25 rounded font-bold text-red-300 text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                      id="btn-ai-fix"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Fix Error</span>
                    </button>
                  </div>

                  {/* API wait loader UI */}
                  {geminiLoading && (
                    <div className="p-4 bg-[#ffa500]/5 border border-[#ffa500]/20 rounded flex items-center gap-3 animate-pulse">
                      <RefreshCw className="w-4 h-4 text-[#ffa500] animate-spin" />
                      <span className="text-[11px] text-[#fcd389]/75">Consulting pre-alpha language model instructions...</span>
                    </div>
                  )}

                  {/* Error display */}
                  {geminiError && (
                    <div className="p-3 bg-red-950/20 border border-red-900/35 rounded text-[11px] text-red-400 font-mono">
                      [AI ERROR] {geminiError}
                    </div>
                  )}

                  {/* Explain / Generated output result format */}
                  {explanation && (
                    <div className="p-3 bg-[#051139] border border-[#6d5f50]/35 rounded text-[11px] text-zinc-200 font-mono leading-relaxed space-y-2 max-h-[220px] overflow-y-auto scrollbar-thin">
                      <div className="text-[10px] text-[#fec153] uppercase font-bold tracking-wider mb-1">ANALYZED RESULT</div>
                      <div className="whitespace-pre-wrap break-words">{explanation}</div>
                    </div>
                  )}

                  {aiSuccessMessage && (
                    <div className="p-3 bg-[#ffa500]/5 border border-[#ffa500]/25 rounded text-[11px] text-zinc-200 font-mono leading-relaxed max-h-[160px] overflow-y-auto scrollbar-thin">
                      <div className="text-emerald-400 font-bold mb-1 font-mono uppercase text-[9px] tracking-wide">GENERATED SCRIPT OUTLINE</div>
                      <p>{aiSuccessMessage}</p>
                    </div>
                  )}
                </div>

                {/* Boilerplate generator code creator prompt */}
                <form onSubmit={handleCreatePromptSubmit} className="pt-3 border-t border-[#6d5f50]/30 space-y-2">
                  <label className="text-[10px] font-bold text-[#fcd389]/50 uppercase tracking-wider block font-mono">
                    Describe a canvas drawing or calculation program:
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={aiGeneratorPrompt}
                      onChange={(e) => setAiGeneratorPrompt(e.target.value)}
                      placeholder="e.g. Draw dynamic grid waveform canvas art..."
                      className="flex-1 bg-[#051139] border border-[#6d5f50]/35 focus:border-[#ffa500] rounded px-2.5 py-1.5 text-xs text-zinc-100 outline-none placeholder-[#fcd389]/30"
                      disabled={geminiLoading}
                      id="ai-prompt-creator-input"
                    />
                    <button
                      type="submit"
                      disabled={geminiLoading || !aiGeneratorPrompt.trim()}
                      className="px-2.5 bg-[#ffa500] hover:bg-[#ffba3c] active:bg-[#fec153] disabled:bg-zinc-800 text-[#051139] font-black rounded text-xs transition-colors cursor-pointer"
                      id="btn-ai-prompt-submit"
                    >
                      Create
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* 4. Bottom Status telemetry metadata bar */}
      <footer className="h-6 bg-[#051139] border-t border-[#6d5f50]/40 text-[#fcd389]/70 flex items-center justify-between px-3 text-[10px] font-semibold shrink-0 font-mono select-none" id="footer-comp-status">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
            <span className="font-mono">✔</span>
            <span>BITON ADAPTER ACTIVE</span>
          </div>
          <div className="text-[#fcd389]/50 font-bold">ISO/UTF-8</div>
          <div className="text-[#fcd389]/50 font-bold">TARGET: GC_WASM</div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-[#fcd389]/50 font-bold">ERRORS: {errors.length}</div>
          <div className="text-[#fcd389]/50 italic">Pre-Alpha SDK v1.0.4</div>
          <div className="bg-[#0c122a] border-l border-[#6d5f50]/40 text-[#ffa500] px-3 h-full flex items-center font-extrabold font-mono tracking-widest text-[9px]">
            STUDIO MODE
          </div>
        </div>
      </footer>
    </div>
  );
}
