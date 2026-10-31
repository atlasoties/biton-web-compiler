import { useCallback, useReducer, useRef } from "react";

const MAX_ENTRIES = 100;
/** Keystrokes closer together than this form one undo step. */
const BURST_GAP_MS = 500;

interface State {
  value: string;
  undo: string[];
  redo: string[];
}

type Action =
  | { type: "set"; value: string; snapshot: boolean }
  | { type: "undo" }
  | { type: "redo" };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "set": {
      if (a.value === s.value) return s;
      if (!a.snapshot) return { ...s, value: a.value };
      const undo = [...s.undo, s.value].slice(-MAX_ENTRIES);
      return { value: a.value, undo, redo: [] };
    }
    case "undo": {
      if (s.undo.length === 0) return s;
      return { value: s.undo[s.undo.length - 1], undo: s.undo.slice(0, -1), redo: [...s.redo, s.value] };
    }
    case "redo": {
      if (s.redo.length === 0) return s;
      return { value: s.redo[s.redo.length - 1], redo: s.redo.slice(0, -1), undo: [...s.undo, s.value] };
    }
  }
}

/**
 * Editor text with undo/redo. A burst of typing is one undo step: the
 * snapshot is the text from *before* the burst started.
 */
export function useHistory(initial: string) {
  const [state, dispatch] = useReducer(reducer, { value: initial, undo: [], redo: [] });
  const inBurst = useRef(false);
  const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const endBurst = () => {
    inBurst.current = false;
    if (burstTimer.current) clearTimeout(burstTimer.current);
    burstTimer.current = null;
  };

  /** `immediate`: a whole-buffer replacement (load, reset) that is its own undo step. */
  const set = useCallback((value: string, immediate: boolean) => {
    if (immediate) {
      endBurst();
      dispatch({ type: "set", value, snapshot: true });
      return;
    }
    const startsBurst = !inBurst.current;
    inBurst.current = true;
    if (burstTimer.current) clearTimeout(burstTimer.current);
    burstTimer.current = setTimeout(endBurst, BURST_GAP_MS);
    dispatch({ type: "set", value, snapshot: startsBurst });
  }, []);

  const undo = useCallback((): boolean => {
    endBurst();
    if (state.undo.length === 0) return false;
    dispatch({ type: "undo" });
    return true;
  }, [state.undo.length]);

  const redo = useCallback((): boolean => {
    endBurst();
    if (state.redo.length === 0) return false;
    dispatch({ type: "redo" });
    return true;
  }, [state.redo.length]);

  return {
    value: state.value,
    set,
    undo,
    redo,
    canUndo: state.undo.length > 0,
    canRedo: state.redo.length > 0,
  };
}
