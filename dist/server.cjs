var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");

// src/compiler/types.ts
var Environment = class {
  constructor(parent = null) {
    this.variables = /* @__PURE__ */ new Map();
    this.parent = null;
    this.parent = parent;
  }
  get(name) {
    if (this.variables.has(name)) {
      return this.variables.get(name);
    }
    if (this.parent) {
      return this.parent.get(name);
    }
    return void 0;
  }
  set(name, value) {
    if (this.variables.has(name)) {
      this.variables.set(name, value);
      return;
    }
    let current = this.parent;
    while (current) {
      if (current.variables.has(name)) {
        current.variables.set(name, value);
        return;
      }
      current = current.parent;
    }
    this.variables.set(name, value);
  }
  declare(name, value) {
    this.variables.set(name, value);
  }
  has(name) {
    if (this.variables.has(name)) return true;
    if (this.parent) return this.parent.has(name);
    return false;
  }
  getAllSymbols() {
    const list = [];
    this.variables.forEach((val, key) => {
      let t = typeof val;
      if (Array.isArray(val)) t = "object";
      if (val && val._isBitonFunction) t = "function";
      list.push({ name: key, value: val, type: t });
    });
    return list;
  }
};

// src/compiler/aether.ts
function tokenize(code) {
  const tokens = [];
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
  const peek = () => i + 1 < code.length ? code[i + 1] : "";
  while (i < code.length) {
    const char = code[i];
    if (char === " " || char === "\r" || char === "	" || char === "\n") {
      advance();
      continue;
    }
    if (char === "/" && peek() === "/") {
      while (i < code.length && code[i] !== "\n") {
        advance();
      }
      continue;
    }
    const startIdx = i;
    const startCol = col;
    const startLine = line;
    if (/[0-9]/.test(char)) {
      let numStr = "";
      while (i < code.length && /[0-9.]/.test(code[i])) {
        numStr += advance();
      }
      tokens.push({
        type: "NUMBER" /* NUMBER */,
        value: numStr,
        line: startLine,
        col: startCol,
        start: startIdx,
        end: i
      });
      continue;
    }
    if (/[a-zA-Z_]/.test(char)) {
      let idStr = "";
      while (i < code.length && /[a-zA-Z0-9_]/.test(code[i])) {
        idStr += advance();
      }
      let type2 = "IDENTIFIER" /* IDENTIFIER */;
      if (idStr === "let") type2 = "LET" /* LET */;
      else if (idStr === "fn") type2 = "FN" /* FN */;
      else if (idStr === "if") type2 = "IF" /* IF */;
      else if (idStr === "else") type2 = "ELSE" /* ELSE */;
      else if (idStr === "return") type2 = "RETURN" /* RETURN */;
      else if (idStr === "while") type2 = "WHILE" /* WHILE */;
      else if (idStr === "true") type2 = "TRUE" /* TRUE */;
      else if (idStr === "false") type2 = "FALSE" /* FALSE */;
      tokens.push({
        type: type2,
        value: idStr,
        line: startLine,
        col: startCol,
        start: startIdx,
        end: i
      });
      continue;
    }
    if (char === '"' || char === "'") {
      const quoteChar = advance();
      let strVal = "";
      let closed = false;
      while (i < code.length) {
        if (code[i] === quoteChar) {
          advance();
          closed = true;
          break;
        }
        strVal += advance();
      }
      tokens.push({
        type: closed ? "STRING" /* STRING */ : "ERROR" /* ERROR */,
        value: strVal,
        line: startLine,
        col: startCol,
        start: startIdx,
        end: i
      });
      continue;
    }
    if (char === "=" && peek() === "=") {
      advance();
      advance();
      tokens.push({ type: "OP_EQ" /* OP_EQ */, value: "==", line: startLine, col: startCol, start: startIdx, end: i });
      continue;
    }
    if (char === "!" && peek() === "=") {
      advance();
      advance();
      tokens.push({ type: "OP_NE" /* OP_NE */, value: "!=", line: startLine, col: startCol, start: startIdx, end: i });
      continue;
    }
    if (char === "&" && peek() === "&") {
      advance();
      advance();
      tokens.push({ type: "OP_AND" /* OP_AND */, value: "&&", line: startLine, col: startCol, start: startIdx, end: i });
      continue;
    }
    if (char === "|" && peek() === "|") {
      advance();
      advance();
      tokens.push({ type: "OP_OR" /* OP_OR */, value: "||", line: startLine, col: startCol, start: startIdx, end: i });
      continue;
    }
    let matched = true;
    let type = "ERROR" /* ERROR */;
    let val = char;
    switch (char) {
      case "+":
        type = "OP_ADD" /* OP_ADD */;
        break;
      case "-":
        type = "OP_SUB" /* OP_SUB */;
        break;
      case "*":
        type = "OP_MUL" /* OP_MUL */;
        break;
      case "/":
        type = "OP_DIV" /* OP_DIV */;
        break;
      case "=":
        type = "OP_ASSIGN" /* OP_ASSIGN */;
        break;
      case "<":
        type = "OP_LT" /* OP_LT */;
        break;
      case ">":
        type = "OP_GT" /* OP_GT */;
        break;
      case ";":
        type = "SEMICOLON" /* SEMICOLON */;
        break;
      case "(":
        type = "LPAREN" /* LPAREN */;
        break;
      case ")":
        type = "RPAREN" /* RPAREN */;
        break;
      case "{":
        type = "LBRACE" /* LBRACE */;
        break;
      case "}":
        type = "RBRACE" /* RBRACE */;
        break;
      case ",":
        type = "COMMA" /* COMMA */;
        break;
      case ".":
        type = "DOT" /* DOT */;
        break;
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
        end: i
      });
    } else {
      const badChar = advance();
      tokens.push({
        type: "ERROR" /* ERROR */,
        value: `Unexpected character '${badChar}'`,
        line: startLine,
        col: startCol,
        start: startIdx,
        end: i
      });
    }
  }
  tokens.push({
    type: "EOF" /* EOF */,
    value: "EOF",
    line,
    col,
    start: code.length,
    end: code.length
  });
  return tokens;
}
var Parser = class {
  constructor(tokens) {
    this.current = 0;
    this.errors = [];
    this.tokens = tokens;
  }
  peek() {
    return this.tokens[this.current];
  }
  previous() {
    return this.tokens[this.current - 1];
  }
  isAtEnd() {
    return this.peek().type === "EOF" /* EOF */;
  }
  advance() {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }
  check(type) {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }
  match(...types) {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }
  consume(type, message) {
    if (this.check(type)) return this.advance();
    const token = this.peek();
    this.errorAt(token, message);
    return token;
  }
  errorAt(token, message) {
    if (!this.errors.some((e) => e.start === token.start)) {
      this.errors.push({
        line: token.line,
        col: token.col,
        start: token.start,
        end: token.end,
        message,
        severity: "error"
      });
    }
  }
  // Error recovery synchronization barrier
  synchronize() {
    this.advance();
    while (!this.isAtEnd()) {
      if (this.previous().type === "SEMICOLON" /* SEMICOLON */) return;
      switch (this.peek().type) {
        case "LET" /* LET */:
        case "FN" /* FN */:
        case "IF" /* IF */:
        case "WHILE" /* WHILE */:
        case "RETURN" /* RETURN */:
          return;
        default:
          break;
      }
      this.advance();
    }
  }
  parse() {
    this.errors = [];
    const body = [];
    for (const token of this.tokens) {
      if (token.type === "ERROR" /* ERROR */) {
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
  statement() {
    if (this.match("LET" /* LET */)) {
      return this.varDeclaration();
    }
    if (this.match("FN" /* FN */)) {
      return this.functionDeclaration();
    }
    if (this.match("IF" /* IF */)) {
      return this.ifStatement();
    }
    if (this.match("WHILE" /* WHILE */)) {
      return this.whileStatement();
    }
    if (this.match("RETURN" /* RETURN */)) {
      return this.returnStatement();
    }
    return this.expressionStatement();
  }
  varDeclaration() {
    const nameToken = this.consume("IDENTIFIER" /* IDENTIFIER */, "Expect variable name after 'let'.");
    this.consume("OP_ASSIGN" /* OP_ASSIGN */, "Expect '=' after variable name.");
    const val = this.expression();
    this.consume("SEMICOLON" /* SEMICOLON */, "Expect ';' at end of variable declaration.");
    return {
      type: "VarDecl",
      name: nameToken.value,
      value: val
    };
  }
  functionDeclaration() {
    const nameToken = this.consume("IDENTIFIER" /* IDENTIFIER */, "Expect function name after 'fn'.");
    this.consume("LPAREN" /* LPAREN */, "Expect '(' after function name.");
    const params = [];
    if (!this.check("RPAREN" /* RPAREN */)) {
      do {
        const param = this.consume("IDENTIFIER" /* IDENTIFIER */, "Expect parameter name.");
        params.push(param.value);
      } while (this.match("COMMA" /* COMMA */));
    }
    this.consume("RPAREN" /* RPAREN */, "Expect ')' after function parameters.");
    this.consume("LBRACE" /* LBRACE */, "Expect '{' before function body.");
    const body = [];
    while (!this.check("RBRACE" /* RBRACE */) && !this.isAtEnd()) {
      const stmt = this.statement();
      if (stmt) body.push(stmt);
    }
    this.consume("RBRACE" /* RBRACE */, "Expect '}' after function body.");
    return {
      type: "FnDecl",
      name: nameToken.value,
      params,
      body
    };
  }
  ifStatement() {
    this.consume("LPAREN" /* LPAREN */, "Expect '(' after 'if'.");
    const test = this.expression();
    this.consume("RPAREN" /* RPAREN */, "Expect ')' after conditional expression.");
    this.consume("LBRACE" /* LBRACE */, "Expect '{' to start the positive branch.");
    const consequent = [];
    while (!this.check("RBRACE" /* RBRACE */) && !this.isAtEnd()) {
      const stmt = this.statement();
      if (stmt) consequent.push(stmt);
    }
    this.consume("RBRACE" /* RBRACE */, "Expect '}' at end of positive branch.");
    let alternate = null;
    if (this.match("ELSE" /* ELSE */)) {
      this.consume("LBRACE" /* LBRACE */, "Expect '{' to start the alternate/else branch.");
      alternate = [];
      while (!this.check("RBRACE" /* RBRACE */) && !this.isAtEnd()) {
        const stmt = this.statement();
        if (stmt) alternate.push(stmt);
      }
      this.consume("RBRACE" /* RBRACE */, "Expect '}' at end of alternate/else branch.");
    }
    return {
      type: "If",
      test,
      consequent,
      alternate
    };
  }
  whileStatement() {
    this.consume("LPAREN" /* LPAREN */, "Expect '(' after 'while'.");
    const test = this.expression();
    this.consume("RPAREN" /* RPAREN */, "Expect ')' after conditional loop check.");
    this.consume("LBRACE" /* LBRACE */, "Expect '{' to start the loop scope.");
    const body = [];
    while (!this.check("RBRACE" /* RBRACE */) && !this.isAtEnd()) {
      const stmt = this.statement();
      if (stmt) body.push(stmt);
    }
    this.consume("RBRACE" /* RBRACE */, "Expect '}' to terminate the loop scope.");
    return {
      type: "While",
      test,
      body
    };
  }
  returnStatement() {
    let value = null;
    if (!this.check("SEMICOLON" /* SEMICOLON */)) {
      value = this.expression();
    }
    this.consume("SEMICOLON" /* SEMICOLON */, "Expect ';' after return values.");
    return {
      type: "Return",
      value
    };
  }
  expressionStatement() {
    const expr = this.expression();
    if (this.match("OP_ASSIGN" /* OP_ASSIGN */)) {
      const assignOp = this.previous();
      const val = this.expression();
      this.consume("SEMICOLON" /* SEMICOLON */, "Expect ';' at the end of statement.");
      return {
        type: "Assign",
        left: expr,
        value: val
      };
    }
    this.consume("SEMICOLON" /* SEMICOLON */, "Expect ';' at end of instruction statement.");
    return expr;
  }
  expression() {
    return this.logicalOr();
  }
  logicalOr() {
    let expr = this.logicalAnd();
    while (this.match("OP_OR" /* OP_OR */)) {
      const op = this.previous().value;
      const right = this.logicalAnd();
      expr = { type: "Binary", operator: op, left: expr, right };
    }
    return expr;
  }
  logicalAnd() {
    let expr = this.equality();
    while (this.match("OP_AND" /* OP_AND */)) {
      const op = this.previous().value;
      const right = this.equality();
      expr = { type: "Binary", operator: op, left: expr, right };
    }
    return expr;
  }
  equality() {
    let expr = this.comparison();
    while (this.match("OP_EQ" /* OP_EQ */, "OP_NE" /* OP_NE */)) {
      const op = this.previous().value;
      const right = this.comparison();
      expr = { type: "Binary", operator: op, left: expr, right };
    }
    return expr;
  }
  comparison() {
    let expr = this.term();
    while (this.match("OP_LT" /* OP_LT */, "OP_GT" /* OP_GT */)) {
      const op = this.previous().value;
      const right = this.term();
      expr = { type: "Binary", operator: op, left: expr, right };
    }
    return expr;
  }
  term() {
    let expr = this.factor();
    while (this.match("OP_ADD" /* OP_ADD */, "OP_SUB" /* OP_SUB */)) {
      const op = this.previous().value;
      const right = this.factor();
      expr = { type: "Binary", operator: op, left: expr, right };
    }
    return expr;
  }
  factor() {
    let expr = this.callOrMember();
    while (this.match("OP_MUL" /* OP_MUL */, "OP_DIV" /* OP_DIV */)) {
      const op = this.previous().value;
      const right = this.callOrMember();
      expr = { type: "Binary", operator: op, left: expr, right };
    }
    return expr;
  }
  callOrMember() {
    let expr = this.primary();
    while (true) {
      if (this.match("LPAREN" /* LPAREN */)) {
        const args = [];
        if (!this.check("RPAREN" /* RPAREN */)) {
          do {
            args.push(this.expression());
          } while (this.match("COMMA" /* COMMA */));
        }
        this.consume("RPAREN" /* RPAREN */, "Expect ')' after call arguments.");
        expr = {
          type: "Call",
          callee: expr,
          args
        };
      } else if (this.match("DOT" /* DOT */)) {
        const property = this.consume("IDENTIFIER" /* IDENTIFIER */, "Expect parameter or field identifier after '.'.");
        expr = {
          type: "Member",
          object: expr,
          property: property.value
        };
      } else {
        break;
      }
    }
    return expr;
  }
  primary() {
    if (this.match("FALSE" /* FALSE */)) return { type: "Literal", value: false };
    if (this.match("TRUE" /* TRUE */)) return { type: "Literal", value: true };
    if (this.match("NUMBER" /* NUMBER */)) {
      const val = parseFloat(this.previous().value);
      return { type: "Literal", value: val };
    }
    if (this.match("STRING" /* STRING */)) {
      return { type: "Literal", value: this.previous().value };
    }
    if (this.match("IDENTIFIER" /* IDENTIFIER */)) {
      return { type: "Identifier", name: this.previous().value };
    }
    if (this.match("LPAREN" /* LPAREN */)) {
      const expr = this.expression();
      this.consume("RPAREN" /* RPAREN */, "Expect ')' after expression grouping.");
      return expr;
    }
    const badToken = this.peek();
    this.errorAt(badToken, `Unexpected token/expression parser error at '${badToken.value}'`);
    throw new Error("Parse Error");
  }
};
var Interpreter = class {
  constructor(globalEnv) {
    this.logs = [];
    this.returnOccurred = false;
    this.returnValue = null;
    // Visual Draw Cycle binds
    this.canvasCtx = null;
    this.canvasOps = [];
    this.onPrint = null;
    this.env = globalEnv || new Environment();
    this.setupGlobals();
  }
  // Headless mode - get collected canvas operations
  getCanvasOps() {
    return this.canvasOps;
  }
  clearCanvasOps() {
    this.canvasOps = [];
  }
  setupGlobals() {
    this.env.declare("print", {
      _isBitonFunction: true,
      params: ["val"],
      body: [],
      nativeCall: (args) => {
        const out = args.map(argStringify).join(" ");
        this.log(out);
        if (this.onPrint) this.onPrint(out);
        return null;
      }
    });
    const mathObj = {
      pi: Math.PI,
      sin: (x) => Math.sin(x),
      cos: (x) => Math.cos(x),
      abs: (x) => Math.abs(x),
      sqrt: (x) => Math.sqrt(x),
      random: (min, max) => {
        if (max === void 0) {
          return Math.random() * (min || 1);
        }
        return min + Math.random() * (max - min);
      },
      floor: (x) => Math.floor(x),
      ceil: (x) => Math.ceil(x)
    };
    this.env.declare("math", mathObj);
    const sysObj = {
      time: () => Date.now(),
      help: () => {
        const info = `biton Pre-Alpha commands:
- print(val) or print("Hi", x)
- math.sin(x), math.cos(x), math.random(min, max), math.pi
- canvas.clear(color)  // (ex: "navy", "#25262c")
- canvas.circle(x, y, r, color)
- canvas.rect(x, y, w, h, color)
- canvas.line(x1, y1, x2, y2, stroke, color)
- canvas.text("Hello", x, y, size, color)
- sys.time(), sys.help()`;
        this.log(info);
        if (this.onPrint) this.onPrint(info);
        return null;
      }
    };
    this.env.declare("sys", sysObj);
    const self = this;
    const canvasObj = {
      clear: (color) => {
        if (self.canvasCtx) {
          self.canvasCtx.fillStyle = color || "#0f0f13";
          self.canvasCtx.fillRect(0, 0, self.canvasCtx.canvas.width, self.canvasCtx.canvas.height);
        } else {
          self.canvasOps.push({ type: "clear", args: [color] });
        }
        return null;
      },
      circle: (x, y, r, color) => {
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
      rect: (x, y, w, h, color) => {
        if (self.canvasCtx) {
          self.canvasCtx.fillStyle = color || "#00e5ff";
          self.canvasCtx.fillRect(x, y, w, h);
        } else {
          self.canvasOps.push({ type: "rect", args: [x, y, w, h, color] });
        }
        return null;
      },
      line: (x1, y1, x2, y2, stroke, color) => {
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
      text: (text, x, y, size, color) => {
        if (self.canvasCtx) {
          self.canvasCtx.fillStyle = color || "#ffffff";
          self.canvasCtx.font = `${size || 14}px 'JetBrains Mono', monospace`;
          self.canvasCtx.fillText(String(text), x, y);
        } else {
          self.canvasOps.push({ type: "text", args: [text, x, y, size, color] });
        }
        return null;
      }
    };
    this.env.declare("canvas", canvasObj);
  }
  setCanvasContext(ctx) {
    this.canvasCtx = ctx;
  }
  getEnvironment() {
    return this.env;
  }
  log(msg) {
    this.logs.push(msg);
  }
  getLogs() {
    return this.logs;
  }
  clearLogs() {
    this.logs = [];
  }
  evaluateProgram(node) {
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
  evaluate(node) {
    switch (node.type) {
      case "Literal":
        return node.value;
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
          case "+":
            return left + right;
          case "-":
            return left - right;
          case "*":
            return left * right;
          case "/":
            if (right === 0) throw new Error("Division by zero error.");
            return left / right;
          case "==":
            return left === right;
          case "!=":
            return left !== right;
          case "<":
            return left < right;
          case ">":
            return left > right;
          case "&&":
            return left && right;
          case "||":
            return left || right;
          default:
            throw new Error(`Unknown operator: ${node.operator}`);
        }
      }
      case "If": {
        const test = this.evaluate(node.test);
        const prevEnv = this.env;
        this.env = new Environment(prevEnv);
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
        while (this.evaluate(node.test)) {
          iterations++;
          if (iterations > 5e3) {
            throw new Error("Pre-alpha loop compiler guard: Infinite loop limit of 5000 cycles reached.");
          }
          this.env = new Environment(prevEnv);
          try {
            for (const stmt of node.body) {
              this.evaluate(stmt);
              if (this.returnOccurred) break;
            }
          } finally {
            this.env = prevEnv;
          }
          if (this.returnOccurred) break;
        }
        return null;
      }
      case "FnDecl": {
        const fnDescriptor = {
          _isBitonFunction: true,
          params: node.params,
          body: node.body,
          parentEnv: this.env
        };
        this.env.declare(node.name, fnDescriptor);
        return fnDescriptor;
      }
      case "Return": {
        this.returnOccurred = true;
        this.returnValue = node.value ? this.evaluate(node.value) : null;
        return this.returnValue;
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
        throw new Error(`Unsupported evaluation node: ${node.type}`);
    }
  }
};
function argStringify(val) {
  if (val === null) return "null";
  if (val === void 0) return "undefined";
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

// server.ts
import_dotenv.default.config();
var app = (0, import_express.default)();
app.use(import_express.default.json());
var PORT = 3e3;
var aiInstance = null;
function getAIClient() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is missing.");
    }
    aiInstance = new import_genai.GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  }
  return aiInstance;
}
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
          text: `Please explain this biton code:

\`\`\`biton
${code}
\`\`\``
        }
      ],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.3
      }
    });
    res.json({ result: response.text });
  } catch (error) {
    console.error("Gemini Explain API error:", error);
    res.status(500).json({ error: error.message || "An error occurred with the AI assistant." });
  }
});
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
        temperature: 0.2
      }
    });
    const parsedResponse = JSON.parse(response.text || "{}");
    if (parsedResponse.fixedCode) {
      parsedResponse.fixedCode = String(parsedResponse.fixedCode);
    }
    res.json(parsedResponse);
  } catch (error) {
    console.error("Gemini Fix API error:", error);
    res.status(500).json({ error: error.message || "An error occurred during error fixing auto-analysis." });
  }
});
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
        executionTimeMs: 0
      });
    }
    const interpreter = new Interpreter();
    const output = [];
    interpreter.onPrint = (val) => output.push(val);
    let executionError = null;
    try {
      interpreter.evaluateProgram(ast);
    } catch (e) {
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
      canvasOps
    });
  } catch (error) {
    console.error("Compile API error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "An unexpected error occurred during server-side compilation."
    });
  }
});
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
        temperature: 0.7
      }
    });
    let parsed;
    try {
      parsed = JSON.parse(response.text || "{}");
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      return res.status(500).json({ error: "Failed to parse AI response." });
    }
    if (parsed.code) {
      parsed.code = String(parsed.code);
    }
    res.json(parsed);
  } catch (error) {
    console.error("Gemini Generate API error:", error);
    res.status(500).json({ error: error.message || "Could not generate sample code." });
  }
});
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Pre-Alpha Compiler Studio listening at http://0.0.0.0:${PORT}`);
  });
}
setupServer();
//# sourceMappingURL=server.cjs.map
