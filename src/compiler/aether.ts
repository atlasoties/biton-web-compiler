import { TokenType, Token, CompilerError, Environment } from "./types";

/**
 * 1. LEXER (TOKENIZER)
 */
export function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const advance = () => {
    const char = code[i];
    i++;
    if (char === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
    return char;
  };

  const peek = () => (i + 1 < code.length ? code[i + 1] : "");

  while (i < code.length) {
    const char = code[i];
    const startIdx = i;
    const startCol = col;
    const startLine = line;

    // Handle Whitespace & Newlines
    if (char === " " || char === "\r" || char === "\t" || char === "\n") {
      advance();
      continue;
    }

    // Handle Comments (e.g., // comments)
    if (char === "/" && peek() === "/") {
      while (i < code.length && code[i] !== "\n") {
        advance();
      }
      continue;
    }

    // Handle Block Comments (e.g., /* comments */)
    if (char === "/" && peek() === "*") {
      advance(); advance();
      while (i < code.length && !(code[i] === "*" && code[i + 1] === "/")) {
        advance();
      }
      if (i >= code.length) {
        tokens.push({
          type: TokenType.ERROR,
          value: "Unclosed block comment.",
          line: startLine,
          col: startCol,
          start: startIdx,
          end: code.length,
        });
      } else {
        advance(); advance();
      }
      continue;
    }

    // Handle Numbers
    if (/[0-9]/.test(char)) {
      let numStr = "";
      while (i < code.length && /[0-9.]/.test(code[i])) {
        numStr += advance();
      }
      tokens.push({
        type: TokenType.NUMBER,
        value: numStr,
        line: startLine,
        col: startCol,
        start: startIdx,
        end: i,
      });
      continue;
    }

    // Handle Identifiers & Keywords
    if (/[a-zA-Z_]/.test(char)) {
      let idStr = "";
      while (i < code.length && /[a-zA-Z0-9_]/.test(code[i])) {
        idStr += advance();
      }

      let type = TokenType.IDENTIFIER;
      if (idStr === "let") type = TokenType.LET;
      else if (idStr === "fn") type = TokenType.FN;
      else if (idStr === "if") type = TokenType.IF;
      else if (idStr === "else") type = TokenType.ELSE;
      else if (idStr === "return") type = TokenType.RETURN;
      else if (idStr === "while") type = TokenType.WHILE;
      else if (idStr === "break") type = TokenType.BREAK;
      else if (idStr === "continue") type = TokenType.CONTINUE;
      else if (idStr === "true") type = TokenType.TRUE;
      else if (idStr === "false") type = TokenType.FALSE;

      tokens.push({
        type,
        value: idStr,
        line: startLine,
        col: startCol,
        start: startIdx,
        end: i,
      });
      continue;
    }

    // Handle Strings (Single or Double Quotes)
    if (char === '"' || char === "'") {
      const quoteChar = advance(); // consume quote
      let strVal = "";
      let closed = false;

      while (i < code.length) {
        if (code[i] === quoteChar) {
          advance(); // consume ending quote
          closed = true;
          break;
        }
        strVal += advance();
      }

      tokens.push({
        type: closed ? TokenType.STRING : TokenType.ERROR,
        value: strVal,
        line: startLine,
        col: startCol,
        start: startIdx,
        end: i,
      });
      continue;
    }

    // Handle Double-char Operators (==, !=, &&, ||)
    if (char === "=" && peek() === "=") {
      advance(); advance();
      tokens.push({ type: TokenType.OP_EQ, value: "==", line: startLine, col: startCol, start: startIdx, end: i });
      continue;
    }
    if (char === "!" && peek() === "=") {
      advance(); advance();
      tokens.push({ type: TokenType.OP_NE, value: "!=", line: startLine, col: startCol, start: startIdx, end: i });
      continue;
    }
    if (char === "&" && peek() === "&") {
      advance(); advance();
      tokens.push({ type: TokenType.OP_AND, value: "&&", line: startLine, col: startCol, start: startIdx, end: i });
      continue;
    }
    if (char === "|" && peek() === "|") {
      advance(); advance();
      tokens.push({ type: TokenType.OP_OR, value: "||", line: startLine, col: startCol, start: startIdx, end: i });
      continue;
    }

    // Single-char Operators & Punctuation
    let matched = true;
    let type: TokenType = TokenType.ERROR;
    let val = char;

    switch (char) {
      case "+": type = TokenType.OP_ADD; break;
      case "-": type = TokenType.OP_SUB; break;
      case "*": type = TokenType.OP_MUL; break;
      case "/": type = TokenType.OP_DIV; break;
      case "=": type = TokenType.OP_ASSIGN; break;
      case "<": type = TokenType.OP_LT; break;
      case ">": type = TokenType.OP_GT; break;
      case "!": type = TokenType.OP_NOT; break;
      case ";": type = TokenType.SEMICOLON; break;
      case "(": type = TokenType.LPAREN; break;
      case ")": type = TokenType.RPAREN; break;
      case "{": type = TokenType.LBRACE; break;
      case "}": type = TokenType.RBRACE; break;
      case ",": type = TokenType.COMMA; break;
      case ".": type = TokenType.DOT; break;
      default:
        matched = false;
        break;
    }

    if (matched) {
      advance();
      tokens.push({
        type,
        value: val,
        line: startLine,
        col: startCol,
        start: startIdx,
        end: i,
      });
    } else {
      // Unrecognized character
      const badChar = advance();
      tokens.push({
        type: TokenType.ERROR,
        value: `Unexpected character '${badChar}'`,
        line: startLine,
        col: startCol,
        start: startIdx,
        end: i,
      });
    }
  }

  tokens.push({
    type: TokenType.EOF,
    value: "EOF",
    line,
    col,
    start: code.length,
    end: code.length,
  });

  return tokens;
}

/**
 * 2. COMPILER AST NODES
 */
export type ASTNode =
  | ProgramNode
  | VarDeclNode
  | AssignNode
  | FnDeclNode
  | IfNode
  | WhileNode
  | BreakNode
  | ContinueNode
  | CallNode
  | MemberNode
  | BinaryNode
  | UnaryNode
  | LiteralNode
  | IdentifierNode
  | ReturnNode;

export interface ProgramNode {
  type: "Program";
  body: ASTNode[];
}

export interface VarDeclNode {
  type: "VarDecl";
  name: string;
  value: ASTNode;
}

export interface AssignNode {
  type: "Assign";
  left: ASTNode; // Can be IdentifierNode or MemberNode (e.g., config.x = value)
  value: ASTNode;
}

export interface FnDeclNode {
  type: "FnDecl";
  name: string;
  params: string[];
  body: ASTNode[];
}

export interface IfNode {
  type: "If";
  test: ASTNode;
  consequent: ASTNode[];
  alternate: ASTNode[] | null;
}

export interface WhileNode {
  type: "While";
  test: ASTNode;
  body: ASTNode[];
}

export interface BreakNode {
  type: "Break";
}

export interface ContinueNode {
  type: "Continue";
}

export interface CallNode {
  type: "Call";
  callee: ASTNode;
  args: ASTNode[];
}

export interface MemberNode {
  type: "Member";
  object: ASTNode;
  property: string;
}

export interface BinaryNode {
  type: "Binary";
  operator: string;
  left: ASTNode;
  right: ASTNode;
}

export interface UnaryNode {
  type: "Unary";
  operator: string;
  operand: ASTNode;
}

export interface LiteralNode {
  type: "Literal";
  value: any;
}

export interface IdentifierNode {
  type: "Identifier";
  name: string;
}

export interface ReturnNode {
  type: "Return";
  value: ASTNode | null;
}

/**
 * 3. AST PARSER WITH REAL-TIME ERROR GATHERING
 */
export class Parser {
  private tokens: Token[];
  private current = 0;
  public errors: CompilerError[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    
    const token = this.peek();
    this.errorAt(token, message);
    return token;
  }

  private errorAt(token: Token, message: string) {
    // Prevent duplicating same offset errors
    if (!this.errors.some(e => e.start === token.start)) {
      this.errors.push({
        line: token.line,
        col: token.col,
        start: token.start,
        end: token.end,
        message,
        severity: "error",
      });
    }
  }

  // Error recovery synchronization barrier
  private synchronize() {
    this.advance();
    while (!this.isAtEnd()) {
      if (this.previous().type === TokenType.SEMICOLON) return;
      switch (this.peek().type) {
        case TokenType.LET:
        case TokenType.FN:
        case TokenType.IF:
        case TokenType.WHILE:
        case TokenType.RETURN:
          return;
        default:
          break;
      }
      this.advance();
    }
  }

  public parse(): ProgramNode {
    this.errors = [];
    const body: ASTNode[] = [];

    // Prior check for Tokenizer errors
    for (const token of this.tokens) {
      if (token.type === TokenType.ERROR) {
        this.errorAt(token, token.value);
      }
    }

    while (!this.isAtEnd()) {
      try {
        const stmt = this.statement();
        if (stmt) body.push(stmt);
      } catch (err) {
        this.synchronize();
      }
    }

    return { type: "Program", body };
  }

  private statement(): ASTNode | null {
    if (this.match(TokenType.LET)) {
      return this.varDeclaration();
    }
    if (this.match(TokenType.FN)) {
      return this.functionDeclaration();
    }
    if (this.match(TokenType.IF)) {
      return this.ifStatement();
    }
    if (this.match(TokenType.WHILE)) {
      return this.whileStatement();
    }
    if (this.match(TokenType.RETURN)) {
      return this.returnStatement();
    }
    if (this.match(TokenType.BREAK)) {
      this.consume(TokenType.SEMICOLON, "Expect ';' after break.");
      return { type: "Break" };
    }
    if (this.match(TokenType.CONTINUE)) {
      this.consume(TokenType.SEMICOLON, "Expect ';' after continue.");
      return { type: "Continue" };
    }

    return this.expressionStatement();
  }

  private varDeclaration(): ASTNode {
    const nameToken = this.consume(TokenType.IDENTIFIER, "Expect variable name after 'let'.");
    this.consume(TokenType.OP_ASSIGN, "Expect '=' after variable name.");
    const val = this.expression();
    this.consume(TokenType.SEMICOLON, "Expect ';' at end of variable declaration.");
    return {
      type: "VarDecl",
      name: nameToken.value,
      value: val,
    };
  }

  private functionDeclaration(): ASTNode {
    const nameToken = this.consume(TokenType.IDENTIFIER, "Expect function name after 'fn'.");
    this.consume(TokenType.LPAREN, "Expect '(' after function name.");

    const params: string[] = [];
    if (!this.check(TokenType.RPAREN)) {
      do {
        const param = this.consume(TokenType.IDENTIFIER, "Expect parameter name.");
        params.push(param.value);
      } while (this.match(TokenType.COMMA));
    }
    
    this.consume(TokenType.RPAREN, "Expect ')' after function parameters.");
    this.consume(TokenType.LBRACE, "Expect '{' before function body.");

    const body: ASTNode[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const stmt = this.statement();
      if (stmt) body.push(stmt);
    }

    this.consume(TokenType.RBRACE, "Expect '}' after function body.");
    return {
      type: "FnDecl",
      name: nameToken.value,
      params,
      body,
    };
  }

  private ifStatement(): ASTNode {
    this.consume(TokenType.LPAREN, "Expect '(' after 'if'.");
    const test = this.expression();
    this.consume(TokenType.RPAREN, "Expect ')' after conditional expression.");
    
    this.consume(TokenType.LBRACE, "Expect '{' to start the positive branch.");
    const consequent: ASTNode[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const stmt = this.statement();
      if (stmt) consequent.push(stmt);
    }
    this.consume(TokenType.RBRACE, "Expect '}' at end of positive branch.");

    let alternate: ASTNode[] | null = null;
    if (this.match(TokenType.ELSE)) {
      if (this.check(TokenType.IF)) {
        this.advance();
        const elseIfStmt = this.ifStatement();
        alternate = [elseIfStmt];
      } else {
        this.consume(TokenType.LBRACE, "Expect '{' to start the alternate/else branch.");
        alternate = [];
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
          const stmt = this.statement();
          if (stmt) alternate.push(stmt);
        }
        this.consume(TokenType.RBRACE, "Expect '}' at end of alternate/else branch.");
      }
    }

    return {
      type: "If",
      test,
      consequent,
      alternate,
    };
  }

  private whileStatement(): ASTNode {
    this.consume(TokenType.LPAREN, "Expect '(' after 'while'.");
    const test = this.expression();
    this.consume(TokenType.RPAREN, "Expect ')' after conditional loop check.");

    this.consume(TokenType.LBRACE, "Expect '{' to start the loop scope.");
    const body: ASTNode[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const stmt = this.statement();
      if (stmt) body.push(stmt);
    }
    this.consume(TokenType.RBRACE, "Expect '}' to terminate the loop scope.");

    return {
      type: "While",
      test,
      body,
    };
  }

  private returnStatement(): ASTNode {
    let value: ASTNode | null = null;
    if (!this.check(TokenType.SEMICOLON)) {
      value = this.expression();
    }
    this.consume(TokenType.SEMICOLON, "Expect ';' after return values.");
    return {
      type: "Return",
      value,
    };
  }

  private expressionStatement(): ASTNode {
    const expr = this.expression();
    
    // Assignment check
    if (this.match(TokenType.OP_ASSIGN)) {
      const assignOp = this.previous();
      const val = this.expression();
      this.consume(TokenType.SEMICOLON, "Expect ';' at the end of statement.");
      return {
        type: "Assign",
        left: expr,
        value: val,
      };
    }

    this.consume(TokenType.SEMICOLON, "Expect ';' at end of instruction statement.");
    return expr;
  }

  private expression(): ASTNode {
    return this.logicalOr();
  }

  private logicalOr(): ASTNode {
    let expr = this.logicalAnd();
    while (this.match(TokenType.OP_OR)) {
      const op = this.previous().value;
      const right = this.logicalAnd();
      expr = { type: "Binary", operator: op, left: expr, right };
    }
    return expr;
  }

  private logicalAnd(): ASTNode {
    let expr = this.equality();
    while (this.match(TokenType.OP_AND)) {
      const op = this.previous().value;
      const right = this.equality();
      expr = { type: "Binary", operator: op, left: expr, right };
    }
    return expr;
  }

  private equality(): ASTNode {
    let expr = this.comparison();
    while (this.match(TokenType.OP_EQ, TokenType.OP_NE)) {
      const op = this.previous().value;
      const right = this.comparison();
      expr = { type: "Binary", operator: op, left: expr, right };
    }
    return expr;
  }

  private comparison(): ASTNode {
    let expr = this.term();
    while (this.match(TokenType.OP_LT, TokenType.OP_GT)) {
      const op = this.previous().value;
      const right = this.term();
      expr = { type: "Binary", operator: op, left: expr, right };
    }
    return expr;
  }

  private term(): ASTNode {
    let expr = this.factor();
    while (this.match(TokenType.OP_ADD, TokenType.OP_SUB)) {
      const op = this.previous().value;
      const right = this.factor();
      expr = { type: "Binary", operator: op, left: expr, right };
    }
    return expr;
  }

  private factor(): ASTNode {
    let expr = this.callOrMember();
    while (this.match(TokenType.OP_MUL, TokenType.OP_DIV)) {
      const op = this.previous().value;
      const right = this.callOrMember();
      expr = { type: "Binary", operator: op, left: expr, right };
    }
    return expr;
  }

  private callOrMember(): ASTNode {
    let expr = this.primary();

    while (true) {
      if (this.match(TokenType.LPAREN)) {
        const args: ASTNode[] = [];
        if (!this.check(TokenType.RPAREN)) {
          do {
            args.push(this.expression());
          } while (this.match(TokenType.COMMA));
        }
        this.consume(TokenType.RPAREN, "Expect ')' after call arguments.");
        expr = {
          type: "Call",
          callee: expr,
          args,
        };
      } else if (this.match(TokenType.DOT)) {
        const property = this.consume(TokenType.IDENTIFIER, "Expect parameter or field identifier after '.'.");
        expr = {
          type: "Member",
          object: expr,
          property: property.value,
        };
      } else {
        break;
      }
    }

    return expr;
  }

  private primary(): ASTNode {
    if (this.match(TokenType.FALSE)) return { type: "Literal", value: false };
    if (this.match(TokenType.TRUE)) return { type: "Literal", value: true };

    if (this.match(TokenType.OP_SUB)) {
      const operand = this.callOrMember();
      return { type: "Unary", operator: "-", operand };
    }

    if (this.match(TokenType.NUMBER)) {
      const val = parseFloat(this.previous().value);
      return { type: "Literal", value: val };
    }

    if (this.match(TokenType.STRING)) {
      return { type: "Literal", value: this.previous().value };
    }

    if (this.match(TokenType.IDENTIFIER)) {
      return { type: "Identifier", name: this.previous().value };
    }

    if (this.match(TokenType.LPAREN)) {
      const expr = this.expression();
      this.consume(TokenType.RPAREN, "Expect ')' after expression grouping.");
      return expr;
    }

    const badToken = this.peek();
    this.errorAt(badToken, `Unexpected token/expression parser error at '${badToken.value}'`);
    throw new Error("Parse Error");
  }
}

/**
 * 4. AST VISUAL RUNTIME INTERPRETER
 */
export interface CanvasOp {
  type: "clear" | "circle" | "rect" | "line" | "text";
  args: any[];
}

export class Interpreter {
  private env: Environment;
  private logs: string[] = [];
  private returnOccurred = false;
  private returnValue: any = null;
  private breakOccurred = false;
  private continueOccurred = false;

  // Visual Draw Cycle binds
  private canvasCtx: CanvasRenderingContext2D | null = null;
  private canvasOps: CanvasOp[] = [];
  public onPrint: ((val: string) => void) | null = null;

  constructor(globalEnv?: Environment) {
    this.env = globalEnv || new Environment();
    this.setupGlobals();
  }

  // Headless mode - get collected canvas operations
  public getCanvasOps(): CanvasOp[] {
    return this.canvasOps;
  }

  public clearCanvasOps() {
    this.canvasOps = [];
  }

  private setupGlobals() {
    // Standard Print Utility
    this.env.declare("print", {
      _isBitonFunction: true,
      params: ["val"],
      body: [] as ASTNode[],
      nativeCall: (args: any[]) => {
        const out = args.map(argStringify).join(" ");
        this.log(out);
        if (this.onPrint) this.onPrint(out);
        return null;
      },
    });

    // Integrated Math operations
    const mathObj: Record<string, any> = {
      pi: Math.PI,
      sin: (x: number) => Math.sin(x),
      cos: (x: number) => Math.cos(x),
      abs: (x: number) => Math.abs(x),
      sqrt: (x: number) => Math.sqrt(x),
      random: (min: number, max: number) => {
        if (max === undefined) {
          return Math.random() * (min || 1);
        }
        return min + Math.random() * (max - min);
      },
      floor: (x: number) => Math.floor(x),
      ceil: (x: number) => Math.ceil(x),
    };
    this.env.declare("math", mathObj);

    // Integrated System attributes and telemetry
    const sysObj: Record<string, any> = {
      time: () => Date.now(),
      help: () => {
        const info = `biton Pre-Alpha commands:
- print(val) or print("Hi", x)
- math.sin(x), math.cos(x), math.abs(x), math.sqrt(x)
- math.floor(x), math.ceil(x), math.random(min, max), math.pi
- canvas.clear(color)
- canvas.circle(x, y, r, color)
- canvas.rect(x, y, w, h, color)
- canvas.line(x1, y1, x2, y2, stroke, color)
- canvas.text("Hello", x, y, size, color)
- sys.time(), sys.help()`;
        this.log(info);
        if (this.onPrint) this.onPrint(info);
        return null;
      },
    };
    this.env.declare("sys", sysObj);

    // Canvas graphic interface
    const self = this;
    const canvasObj: Record<string, any> = {
      clear: (color?: string) => {
        if (self.canvasCtx) {
          self.canvasCtx.fillStyle = color || "#0f0f13";
          self.canvasCtx.fillRect(0, 0, self.canvasCtx.canvas.width, self.canvasCtx.canvas.height);
        } else {
          self.canvasOps.push({ type: "clear", args: [color] });
        }
        return null;
      },
      circle: (x: number, y: number, r: number, color?: string) => {
        if (self.canvasCtx) {
          self.canvasCtx.beginPath();
          self.canvasCtx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
          self.canvasCtx.fillStyle = color || "#ff007f";
          self.canvasCtx.fill();
        } else {
          self.canvasOps.push({ type: "circle", args: [x, y, r, color] });
        }
        return null;
      },
      rect: (x: number, y: number, w: number, h: number, color?: string) => {
        if (self.canvasCtx) {
          self.canvasCtx.fillStyle = color || "#00e5ff";
          self.canvasCtx.fillRect(x, y, w, h);
        } else {
          self.canvasOps.push({ type: "rect", args: [x, y, w, h, color] });
        }
        return null;
      },
      line: (x1: number, y1: number, x2: number, y2: number, stroke?: number, color?: string) => {
        if (self.canvasCtx) {
          self.canvasCtx.beginPath();
          self.canvasCtx.moveTo(x1, y1);
          self.canvasCtx.lineTo(x2, y2);
          self.canvasCtx.lineWidth = stroke || 2;
          self.canvasCtx.strokeStyle = color || "#ffffff";
          self.canvasCtx.stroke();
        } else {
          self.canvasOps.push({ type: "line", args: [x1, y1, x2, y2, stroke, color] });
        }
        return null;
      },
      text: (text: string, x: number, y: number, size?: number, color?: string) => {
        if (self.canvasCtx) {
          self.canvasCtx.fillStyle = color || "#ffffff";
          self.canvasCtx.font = `${size || 14}px 'JetBrains Mono', monospace`;
          self.canvasCtx.fillText(String(text), x, y);
        } else {
          self.canvasOps.push({ type: "text", args: [text, x, y, size, color] });
        }
        return null;
      },
    };
    this.env.declare("canvas", canvasObj);
  }

  public setCanvasContext(ctx: CanvasRenderingContext2D) {
    this.canvasCtx = ctx;
  }

  public getEnvironment(): Environment {
    return this.env;
  }

  private log(msg: string) {
    this.logs.push(msg);
  }

  public getLogs(): string[] {
    return this.logs;
  }

  public clearLogs() {
    this.logs = [];
  }

  public evaluateProgram(node: ProgramNode): any {
    this.returnOccurred = false;
    this.returnValue = null;
    let lastResult = null;

    for (const stmt of node.body) {
      lastResult = this.evaluate(stmt);
      if (this.returnOccurred) {
        return this.returnValue;
      }
    }
    return lastResult;
  }

  private evaluate(node: ASTNode): any {
    switch (node.type) {
      case "Literal":
        return node.value;

      case "Unary": {
        const operand = this.evaluate(node.operand);
        if (node.operator === "-") return -operand;
        throw new Error(`Unknown unary operator: ${node.operator}`);
      }

      case "Identifier":
        if (!this.env.has(node.name)) {
          throw new Error(`Compile-Semantic error: Variable '${node.name}' is referenced before declaration.`);
        }
        return this.env.get(node.name);

      case "VarDecl": {
        const val = this.evaluate(node.value);
        this.env.declare(node.name, val);
        return val;
      }

      case "Assign": {
        const val = this.evaluate(node.value);
        if (node.left.type === "Identifier") {
          const name = node.left.name;
          if (!this.env.has(name)) {
            throw new Error(`Assignment Error: Can't assign to undefined variable '${name}'. Declare it with let.`);
          }
          this.env.set(name, val);
          return val;
        } else if (node.left.type === "Member") {
          // Setting variable fields e.g. state.angle = val
          const obj = this.evaluate(node.left.object);
          if (obj && typeof obj === "object" && !Array.isArray(obj)) {
            obj[node.left.property] = val;
            return val;
          }
          throw new Error(`Assignment Error: Can only modify elements of an object.`);
        }
        throw new Error("Assignment Error: Left side of operator '=' must be assignable.");
      }

      case "Binary": {
        const left = this.evaluate(node.left);
        const right = this.evaluate(node.right);

        switch (node.operator) {
          case "+": return left + right;
          case "-": return left - right;
          case "*": return left * right;
          case "/":
            if (right === 0) throw new Error("Division by zero error.");
            return left / right;
          case "==": return left === right;
          case "!=": return left !== right;
          case "<": return left < right;
          case ">": return left > right;
          case "&&": return left && right;
          case "||": return left || right;
          default:
            throw new Error(`Unknown operator: ${node.operator}`);
        }
      }

      case "If": {
        const test = this.evaluate(node.test);
        const prevEnv = this.env;
        this.env = new Environment(prevEnv); // block scope

        try {
          if (test) {
            for (const stmt of node.consequent) {
              this.evaluate(stmt);
              if (this.returnOccurred) break;
            }
          } else if (node.alternate) {
            for (const stmt of node.alternate) {
              this.evaluate(stmt);
              if (this.returnOccurred) break;
            }
          }
        } finally {
          this.env = prevEnv;
        }
        return null;
      }

      case "While": {
        const prevEnv = this.env;
        let iterations = 0;
        const oldBreak = this.breakOccurred;
        const oldContinue = this.continueOccurred;

        while (this.evaluate(node.test)) {
          iterations++;
          if (iterations > 5000) {
            throw new Error("Pre-alpha loop compiler guard: Infinite loop limit of 5000 cycles reached.");
          }
          this.breakOccurred = false;
          this.continueOccurred = false;
          this.env = new Environment(prevEnv); // block scope
          try {
            for (const stmt of node.body) {
              this.evaluate(stmt);
              if (this.returnOccurred || this.breakOccurred) break;
              if (this.continueOccurred) break;
            }
          } finally {
            this.env = prevEnv;
          }
          if (this.returnOccurred || this.breakOccurred) {
            this.breakOccurred = oldBreak;
            this.continueOccurred = oldContinue;
            break;
          }
        }
        this.breakOccurred = oldBreak;
        this.continueOccurred = oldContinue;
        return null;
      }

      case "FnDecl": {
        const fnDescriptor = {
          _isBitonFunction: true,
          params: node.params,
          body: node.body,
          parentEnv: this.env,
        };
        this.env.declare(node.name, fnDescriptor);
        return fnDescriptor;
      }

      case "Return": {
        this.returnOccurred = true;
        this.returnValue = node.value ? this.evaluate(node.value) : null;
        return this.returnValue;
      }

      case "Break": {
        this.breakOccurred = true;
        return null;
      }

      case "Continue": {
        this.continueOccurred = true;
        return null;
      }

      case "Call": {
        const callee = this.evaluate(node.callee);
        const args = node.args.map((a) => this.evaluate(a));

        if (typeof callee === "function") {
          return callee(...args);
        }

        if (callee && callee._isBitonFunction) {
          if (callee.nativeCall) {
            return callee.nativeCall(args);
          }

          const paramCount = callee.params.length;
          if (args.length !== paramCount) {
            throw new Error(`Function call expected ${paramCount} arguments but got ${args.length}.`);
          }

          const functionEnv = new Environment(callee.parentEnv || this.env);
          for (let pIdx = 0; pIdx < paramCount; pIdx++) {
            functionEnv.declare(callee.params[pIdx], args[pIdx]);
          }

          const oldEnv = this.env;
          const oldReturnState = this.returnOccurred;
          const oldReturnValue = this.returnValue;

          this.env = functionEnv;
          this.returnOccurred = false;
          this.returnValue = null;

          try {
            for (const stmt of callee.body) {
              this.evaluate(stmt);
              if (this.returnOccurred) break;
            }
            const outValue = this.returnValue;
            return outValue;
          } finally {
            this.env = oldEnv;
            this.returnOccurred = oldReturnState;
            this.returnValue = oldReturnValue;
          }
        }

        throw new Error("Syntax Error: Call target resolves to non-callable object.");
      }

      case "Member": {
        const obj = this.evaluate(node.object);
        if (obj && typeof obj === "object" && node.property in obj) {
          const propValue = obj[node.property];
          if (typeof propValue === "function") {
            return propValue.bind(obj);
          }
          return propValue;
        }
        throw new Error(`Member resolution error: property '${node.property}' is not defined on object.`);
      }

      default:
        throw new Error(`Unsupported evaluation node: ${(node as any).type}`);
    }
  }
}

function argStringify(val: any): string {
  if (val === null) return "null";
  if (val === undefined) return "undefined";
  if (typeof val === "object") {
    if (val._isBitonFunction) {
      return `fn(${val.params.join(", ")}) { ... }`;
    }
    try {
      return JSON.stringify(val);
    } catch {
      return "[Object]";
    }
  }
  return String(val);
}
