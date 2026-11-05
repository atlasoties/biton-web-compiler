import { parseArgs } from "../../lib/args";
import { cx } from "../ui";

interface InputPanelProps {
  args: string;
  setArgs: (v: string) => void;
  stdin: string;
  setStdin: (v: string) => void;
  maxStdinBytes?: number;
}

/** What the program is run with: its arguments (std.env) and standard input (std.io). */
export default function InputPanel({ args, setArgs, stdin, setStdin, maxStdinBytes }: InputPanelProps) {
  const parsed = parseArgs(args);
  const bytes = new TextEncoder().encode(stdin).length;
  const tooBig = maxStdinBytes !== undefined && bytes > maxStdinBytes;
  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto bg-surface p-4 gap-5">
      <section>
        <label htmlFor="program-args" className="block text-[12.5px] font-semibold text-fg">
          Arguments
        </label>
        <p className="text-[11.5px] text-faint mt-0.5 mb-2">
          Passed after the program's name; read them with <code className="font-mono text-muted">std.env.args()</code>. Quote to keep spaces.
        </p>
        <input
          id="program-args"
          value={args}
          onChange={(e) => setArgs(e.target.value)}
          placeholder={'one "two words"'}
          className="w-full h-9 px-3 rounded-md border border-line-strong bg-surface-2 font-mono text-[12.5px] text-fg placeholder:text-faint outline-none focus:border-accent"
          spellCheck={false}
          autoComplete="off"
        />
        {parsed.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {parsed.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-surface-3 font-mono text-[11.5px] text-fg">
                <span className="text-faint">{i}</span>
                {a === "" ? <span className="text-faint italic">empty</span> : a}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col flex-1 min-h-[160px]">
        <div className="flex items-baseline justify-between">
          <label htmlFor="program-stdin" className="block text-[12.5px] font-semibold text-fg">
            Standard input
          </label>
          <span className={cx("text-[11px] tabular-nums", tooBig ? "text-danger" : "text-faint")}>
            {bytes.toLocaleString()} {maxStdinBytes ? `/ ${maxStdinBytes.toLocaleString()} ` : ""}bytes
          </span>
        </div>
        <p className="text-[11.5px] text-faint mt-0.5 mb-2">
          Read line by line with <code className="font-mono text-muted">std.io.read_line()</code>.
        </p>
        <textarea
          id="program-stdin"
          value={stdin}
          onChange={(e) => setStdin(e.target.value)}
          placeholder="Type the program's input here"
          className={cx(
            "flex-1 w-full min-h-[120px] resize-none p-3 rounded-md border bg-surface-2 font-mono text-[12.5px] leading-[1.6] text-fg placeholder:text-faint outline-none",
            tooBig ? "border-danger" : "border-line-strong focus:border-accent",
          )}
          spellCheck={false}
        />
      </section>
    </div>
  );
}
