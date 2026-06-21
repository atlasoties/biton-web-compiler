/**
 * Structural types for the biton Programming Language.
 */

export enum TokenType {
  // Keywords
  LET = "LET",
  FN = "FN",
  IF = "IF",
  ELSE = "ELSE",
  RETURN = "RETURN",
  WHILE = "WHILE",
  BREAK = "BREAK",
  CONTINUE = "CONTINUE",
  TRUE = "TRUE",
  FALSE = "FALSE",

  // Data Types
  NUMBER = "NUMBER",
  STRING = "STRING",
  IDENTIFIER = "IDENTIFIER",

  // Operators
  OP_ADD = "OP_ADD",      // +
  OP_SUB = "OP_SUB",      // -
  OP_MUL = "OP_MUL",      // *
  OP_DIV = "OP_DIV",      // /
  OP_ASSIGN = "OP_ASSIGN",  // =
  OP_EQ = "OP_EQ",      // ==
  OP_LT = "OP_LT",      // <
  OP_GT = "OP_GT",      // >
  OP_NE = "OP_NE",      // !=
  OP_NOT = "OP_NOT",    // !
  OP_AND = "OP_AND",    // &&
  OP_OR = "OP_OR",      // ||

  // Punctuation
  SEMICOLON = "SEMICOLON",
  LPAREN = "LPAREN",      // (
  RPAREN = "RPAREN",      // )
  LBRACE = "LBRACE",      // {
  RBRACE = "RBRACE",      // }
  COMMA = "COMMA",
  DOT = "DOT",            // .

  // Special
  EOF = "EOF",
  ERROR = "ERROR"
}

export interface Token {
  type: TokenType;
  value: string;
  line: number; // 1-indexed
  col: number;  // 1-indexed
  start: number; // character index in file
  end: number;
}

export interface CompilerError {
  line: number;
  col: number;
  message: string;
  start: number;
  end: number;
  severity: "error" | "warning";
}

export interface VariableSymbol {
  name: string;
  value: any;
  type: "number" | "string" | "boolean" | "function" | "canvas" | "object";
}

export class Environment {
  private variables: Map<string, any> = new Map();
  private parent: Environment | null = null;

  constructor(parent: Environment | null = null) {
    this.parent = parent;
  }

  get(name: string): any {
    if (this.variables.has(name)) {
      return this.variables.get(name);
    }
    if (this.parent) {
      return this.parent.get(name);
    }
    return undefined;
  }

  set(name: string, value: any): void {
    if (this.variables.has(name)) {
      this.variables.set(name, value);
      return;
    }
    // If it exists in any parent, re-assign there
    let current: Environment | null = this.parent;
    while (current) {
      if (current.variables.has(name)) {
        current.variables.set(name, value);
        return;
      }
      current = current.parent;
    }
    // Otherwise declare in current local scope
    this.variables.set(name, value);
  }

  declare(name: string, value: any): void {
    this.variables.set(name, value);
  }

  has(name: string): boolean {
    if (this.variables.has(name)) return true;
    if (this.parent) return this.parent.has(name);
    return false;
  }

  getAllSymbols(): VariableSymbol[] {
    const list: VariableSymbol[] = [];
    this.variables.forEach((val, key) => {
      let t: any = typeof val;
      if (Array.isArray(val)) t = "object";
      if (val && val._isBitonFunction) t = "function";
      list.push({ name: key, value: val, type: t });
    });
    return list;
  }
}
