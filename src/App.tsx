// The app shell: the project list (home) or one open project (?p=<id>),
// sign-in for both, and share links, which open as a new project.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Braces } from "lucide-react";

import Home from "./components/home/Home";
import SignInDialog from "./components/auth/SignInDialog";
import { cx } from "./components/ui";
import { formatArgs } from "./lib/args";
import { ProjectStore } from "./lib/projects";
import { decodeShare } from "./lib/share";
import { useAuth } from "./lib/useAuth";
import { zip } from "./lib/zip";
import Workspace from "./Workspace";

interface Toast {
  text: string;
  action?: { label: string; run: () => void };
  tone?: "error";
}

const readRoute = () => new URLSearchParams(window.location.search).get("p");

function setRouteInUrl(id: string | null, replace = false) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("p", id);
  else url.searchParams.delete("p");
  window.history[replace ? "replaceState" : "pushState"](null, "", url.pathname + url.search + url.hash);
}

export default function App() {
  const store = useMemo(() => new ProjectStore(), []);
  const [route, setRoute] = useState<string | null>(readRoute);
  /** Bumped when stored projects change, so names and lists re-read. */
  const [version, setVersion] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const notify = useCallback((t: Toast | string) => setToast(typeof t === "string" ? { text: t } : t), []);
  const auth = useAuth(notify);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.action ? 8000 : 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const navigate = useCallback((id: string | null, replace = false) => {
    setRouteInUrl(id, replace);
    setRoute(id);
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(readRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // A link to a project this browser does not have (deleted, or another browser's).
  const meta = route ? store.get(route) : null;
  const doc = useMemo(() => (route && meta ? store.load(route) : null), [route, meta?.id, store]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (route && (!meta || !doc)) {
      navigate(null, true);
      notify({ text: "That project isn't in this browser. Projects are saved per browser; import its .zip to open it here.", tone: "error" });
    } else if (route) {
      store.touch(route);
      document.title = `${meta!.name} · Biton`;
    } else {
      document.title = "Biton Web Compiler";
    }
  }, [route]); // eslint-disable-line react-hooks/exhaustive-deps

  // URL fragments: sign-in results, and share links (opened as a new project).
  const handled = useRef<string | null>(null);
  useEffect(() => {
    const open = async () => {
      const hash = window.location.hash;
      // Once per fragment (React runs effects twice in development).
      if (!hash || handled.current === hash) return;
      handled.current = hash;
      const h = hash.replace(/^#/, "");
      const clear = () => window.history.replaceState(null, "", window.location.pathname + window.location.search);
      if (await auth.handleHash(h)) {
        clear();
        return;
      }
      const shared = await decodeShare(hash);
      if (!shared) {
        if (h.startsWith("s=")) notify({ text: "This share link is damaged and could not be opened.", tone: "error" });
        return;
      }
      clear();
      const files = shared.files ?? { "main.bit": shared.code };
      const created = store.create(shared.files ? "Shared project" : "Shared program", {
        files,
        entry: shared.entry,
        activeFile: shared.active,
        tabs: shared.active ? [shared.active] : undefined,
        stdin: shared.stdin,
        args: formatArgs(shared.args ?? []),
      });
      if (!created) {
        notify({ text: "Browser storage is full, so the shared program could not be saved. Delete a project and open the link again.", tone: "error" });
        return;
      }
      notify(`Opened the shared ${shared.files ? "project" : "program"} as “${created.name}”`);
      navigate(created.id);
    };
    void open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const downloadProject = useCallback(
    async (id: string) => {
      const d = store.load(id);
      const m = store.get(id);
      if (!d || !m) return;
      const url = URL.createObjectURL(await zip(d.files));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${m.name.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "biton-project"}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    [store],
  );

  return (
    <>
      {route && meta && doc ? (
        <Workspace
          key={route}
          projectId={route}
          projectName={meta.name}
          doc={doc}
          store={store}
          auth={auth}
          onHome={() => navigate(null)}
          onRename={(name) => {
            const final = store.rename(route, name);
            document.title = `${final} · Biton`;
            setVersion((v) => v + 1);
          }}
        />
      ) : (
        <Home store={store} auth={auth} onOpen={(id) => navigate(id)} notify={notify} onDownload={(id) => void downloadProject(id)} version={version} />
      )}

      {auth.signIn && auth.auth && (
        <SignInDialog
          providers={auth.auth.providers}
          reason={auth.signIn.reason}
          error={auth.signIn.error}
          onClose={auth.closeSignIn}
          // The open project saves itself when the page is left (pagehide).
          beforeLeave={() => {}}
        />
      )}

      {toast && (
        <div
          role="status"
          className={cx(
            "fixed bottom-10 left-1/2 -translate-x-1/2 z-50 w-max flex items-center gap-3 pl-3.5 pr-2 min-h-9 py-1.5 max-w-[min(560px,calc(100vw-32px))] rounded-lg text-[13px] font-medium shadow-pop animate-pop",
            toast.tone === "error" ? "bg-danger text-white dark:text-[#1f0606]" : "bg-fg text-bg",
          )}
        >
          <Braces className="w-3.5 h-3.5 opacity-70 shrink-0" />
          <span className="flex-1">{toast.text}</span>
          {toast.action ? (
            <button
              type="button"
              onClick={() => {
                toast.action!.run();
                setToast(null);
              }}
              className="shrink-0 h-7 px-2.5 rounded-md font-semibold hover:underline bg-white/10"
            >
              {toast.action.label}
            </button>
          ) : (
            <span className="w-1" />
          )}
        </div>
      )}
    </>
  );
}
