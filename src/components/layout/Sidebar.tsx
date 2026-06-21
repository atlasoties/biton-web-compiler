import { FileCode, Database, Download, Upload } from "lucide-react";
import React from "react";

interface SidebarProps {
  activeTab: "snippets" | "state" | "cheatsheet";
  setActiveTab: (tab: "snippets" | "state" | "cheatsheet") => void;
  DEMO_SCRIPTS: Record<string, { title: string; desc: string; code: string }>;
  loadDemo: (key: keyof SidebarProps["DEMO_SCRIPTS"]) => void;
  updateCodeWithHistory: (code: string, immediate: boolean) => void;
  addTerminalRow: (type: "cmd" | "out" | "err" | "sys", text: string) => void;
  environmentVariables: any[];
  errors: any[];
  downloadCode: () => void;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  DEMO_SCRIPTS,
  loadDemo,
  updateCodeWithHistory,
  addTerminalRow,
  environmentVariables,
  errors,
  downloadCode,
}: SidebarProps) {
  return (
    <>
      <aside className="w-56 bg-[#051139] border-r border-[#6d5f50]/40 flex flex-col shrink-0" id="explorer-sidebar">
        {/* Sidebar Segment Tabs */}
        <div className="flex border-b border-[#6d5f50]/35 p-1 bg-[#0c122a] gap-1 shrink-0">
          <button 
            onClick={() => setActiveTab("snippets")}
            className={`flex-1 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider text-center transition-all ${activeTab === "snippets" ? "bg-[#051139] text-[#fec153] border-b-2 border-[#fec153] shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`}
            id="sidebar-tab-snippets"
          >
            Files
          </button>
          <button 
            onClick={() => setActiveTab("state")}
            className={`flex-1 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider text-center transition-all ${activeTab === "state" ? "bg-[#051139] text-[#fec153] border-b-2 border-[#fec153] shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`}
            id="sidebar-tab-state"
          >
            Env Variables
          </button>
          <button 
            onClick={() => setActiveTab("cheatsheet")}
            className={`flex-1 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider text-center transition-all ${activeTab === "cheatsheet" ? "bg-[#051139] text-[#fec153] border-b-2 border-[#fec153] shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`}
            id="sidebar-tab-cheatsheet"
          >
            Help API
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 scrollbar-thin" id="explorer-content-container">
          {activeTab === "snippets" && (
            <div className="space-y-4">
              <div>
                <div className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest mb-2 px-1">WORKSPACE SNIPPETS</div>
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
                        <div className="text-[10px] text-zinc-500 leading-tight mt-0.5 line-clamp-2">{item.desc}</div>
                      </div>
                    </button>
                  ))}
                </nav>
              </div>

              <div className="pt-3 border-t border-[#6d5f50]/30 animate-fade-in">
                <div className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest mb-2 px-1">Import/Export</div>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={downloadCode}
                    className="flex items-center justify-center gap-1 py-1.5 px-2 bg-[#0c122a] hover:bg-[#0c122a]/70 text-zinc-400 hover:text-white rounded border border-[#6d5f50]/40 text-[10px] font-bold transition-all hover:border-[#ffa500]"
                    id="btn-download-ae"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download</span>
                  </button>
                  <label 
                    className="flex items-center justify-center gap-1 py-1.5 px-2 bg-[#0c122a] hover:bg-[#0c122a]/70 text-zinc-400 hover:text-white rounded border border-[#6d5f50]/40 text-[10px] font-bold cursor-pointer transition-all hover:border-[#ffa500]"
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
              <div className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest px-1">BITON EVALUATOR MEMORY</div>
              
              {environmentVariables.length === 0 ? (
                <div className="p-3 bg-[#0c122a] rounded border border-[#6d5f50]/30 text-center">
                  <Database className="w-5 h-5 text-zinc-500 mx-auto mb-1.5" />
                  <p className="text-[10px] text-zinc-500 leading-relaxed">No active scope variables. Run the compiler code to register dynamic symbols.</p>
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
                      <div className="font-mono text-[11px] text-zinc-300 truncate bg-[#051139] px-1.5 py-1 rounded">
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
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2 px-1">LANGUAGE SYNTAX</span>
                <div className="space-y-2 font-mono text-[11px]">
                  <div className="bg-[#0c122a] p-2 rounded border border-[#6d5f50]/20 text-zinc-300">
                    <span className="text-pink-400 font-semibold">let</span> x = <span className="text-orange-400">10</span>;
                  </div>
                  <div className="bg-[#0c122a] p-2 rounded border border-[#6d5f50]/20 text-zinc-300">
                    <span className="text-pink-400 font-semibold">fn</span> add(a, b) {'{'}<br/>
                    &nbsp;&nbsp;<span className="text-pink-400 font-semibold">return</span> a + b;<br/>
                    {'}'}
                  </div>
                  <div className="bg-[#0c122a] p-2 rounded border border-[#6d5f50]/20 text-zinc-300">
                    <span className="text-pink-400 font-semibold">if</span> (x &gt; 5) {'{'} ... {'}'}
                  </div>
                  <div className="bg-[#0c122a] p-2 rounded border border-[#6d5f50]/20 text-zinc-300">
                    <span className="text-pink-400 font-semibold">while</span> (x &lt; 100) {'{'} x = x + 1; {'}'}
                  </div>
                  <div className="bg-[#0c122a] p-2 rounded border border-[#6d5f50]/20 text-zinc-300">
                    <span className="text-pink-400 font-semibold">return</span> <span className="text-orange-400">value</span>;
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-[#6d5f50]/30">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2 px-1">BUILTIN APIS</span>
                <div className="space-y-1 font-mono text-[10px] text-zinc-300">
                  <div className="bg-[#0c122a] p-1.5 rounded border border-[#6d5f50]/20 truncate" title="print(values...)">
                    <span className="text-emerald-400">print</span>(val, ...)
                  </div>
                  <div className="bg-[#0c122a] p-1.5 rounded border border-[#6d5f50]/20 truncate" title="math.pi">
                    <span className="text-emerald-400">math.pi</span>, <span className="text-emerald-400">math.sin</span>(<span className="text-amber-300">x</span>), <span className="text-emerald-400">math.cos</span>(<span className="text-amber-300">x</span>)
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
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2 px-1">CANVAS API</span>
                <div className="space-y-1 font-mono text-[10px] text-zinc-300">
                  <div className="bg-[#0c122a] p-1.5 rounded border border-[#6d5f50]/20 truncate" title="canvas.clear(color)">
                    <span className="text-emerald-400">canvas.clear</span>(<span className="text-amber-300">"#080a14"</span>)
                  </div>
                  <div className="bg-[#0c122a] p-1.5 rounded border border-[#6d5f50]/20 truncate" title="canvas.circle(x, y, radius, color)">
                    <span className="text-emerald-400">canvas.circle</span>(<span className="text-amber-300">x</span>, <span className="text-amber-300">y</span>, <span className="text-amber-300">r</span>, <span className="text-amber-300">c</span>)
                  </div>
                  <div className="bg-[#0c122a] p-1.5 rounded border border-[#6d5f50]/20 truncate" title="canvas.rect(x, y, wid, hgt, color)">
                    <span className="text-emerald-400">canvas.rect</span>(<span className="text-amber-300">x</span>, <span className="text-amber-300">y</span>, <span className="text-amber-300">w</span>, <span className="text-amber-300">h</span>, <span className="text-amber-300">c</span>)
                  </div>
                  <div className="bg-[#0c122a] p-1.5 rounded border border-[#6d5f50]/20 truncate" title="canvas.line(x1, y1, x2, y2, weight, color)">
                    <span className="text-emerald-400">canvas.line</span>(<span className="text-amber-300">x1</span>,<span className="text-amber-300">y1</span>, <span className="text-amber-300">x2</span>,<span className="text-amber-300">y2</span>, <span className="text-amber-300">w</span>, <span className="text-amber-300">c</span>)
                  </div>
                  <div className="bg-[#0c122a] p-1.5 rounded border border-[#6d5f50]/20 truncate" title="canvas.text(txt, x, y, size, color)">
                    <span className="text-emerald-400">canvas.text</span>(<span className="text-amber-300">txt</span>, <span className="text-amber-300">x</span>, <span className="text-amber-300">y</span>, <span className="text-amber-300">s</span>, <span className="text-amber-300">c</span>)
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Project Health meter matching design spec */}
        <div className="p-4 bg-[#0c122a] border-t border-[#6d5f50]/30" id="project-health-panel">
          <div className="text-[10px] text-zinc-500 mb-1.5 uppercase tracking-wider font-mono font-bold">PROJECT COMPILE HEALTH</div>
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
    </>
  );
}