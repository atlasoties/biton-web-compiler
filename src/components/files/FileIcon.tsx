import { File, FileCode2, FileJson, FileText, Folder, FolderOpen } from "lucide-react";

import { extname } from "../../lib/project";
import { cx } from "../ui";

/** An icon for a file by its extension, or an open/closed folder. */
export function FileIcon({ path, folder, open, className }: { path: string; folder?: boolean; open?: boolean; className?: string }) {
  const cls = cx("w-3.5 h-3.5 shrink-0", className);
  if (folder) return open ? <FolderOpen className={cx(cls, "text-faint")} /> : <Folder className={cx(cls, "text-faint")} />;
  switch (extname(path).toLowerCase()) {
    case ".bit":
      return <FileCode2 className={cx(cls, "text-accent")} />;
    case ".json":
    case ".toml":
      return <FileJson className={cx(cls, "text-info")} />;
    case ".md":
    case ".txt":
    case ".csv":
      return <FileText className={cx(cls, "text-muted")} />;
    default:
      return <File className={cx(cls, "text-faint")} />;
  }
}
