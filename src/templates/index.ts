// Starting points for a new project: an empty program, a small multi-file
// project that shows imports across folders, and a game.

export interface Template {
  key: string;
  title: string;
  desc: string;
  files: Record<string, string>;
  stdin?: string;
  args?: string[];
  /** Shown as the big card on the home screen. */
  showcase?: boolean;
}

/** `./dir/**` sources as project paths relative to `dir`. */
function folder(sources: Record<string, string>, dir: string): Record<string, string> {
  return Object.fromEntries(Object.entries(sources).map(([path, code]) => [path.slice(`./${dir}/`.length), code]));
}

const blank = import.meta.glob<string>("./blank.bit", { query: "?raw", import: "default", eager: true })["./blank.bit"];
const starter = import.meta.glob<string>("./starter/**/*.bit", { query: "?raw", import: "default", eager: true });
const crypt = import.meta.glob<string>("./crypt/**/*.bit", { query: "?raw", import: "default", eager: true });

export const TEMPLATES: Template[] = [
  {
    key: "crypt",
    title: "Crypt of the Biton Crystal",
    desc: "A roguelike: three generated dungeon levels, monsters, loot and an AI autopilot with path-finding. Type moves (wasd) in Input, or watch it play; the argument is the dungeon's seed.",
    files: folder(crypt, "crypt"),
    args: ["33"],
    showcase: true,
  },
  { key: "blank", title: "Empty project", desc: "One main.bit that prints a greeting", files: { "main.bit": blank } },
  {
    key: "starter",
    title: "Multi-file starter",
    desc: "main.bit importing a module and a module in a folder",
    files: folder(starter, "starter"),
  },
];

export const BLANK = TEMPLATES.find((t) => t.key === "blank")!;
