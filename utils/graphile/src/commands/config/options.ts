import {
  createFSBackedSystem,
  createVirtualCompilerHost,
  createVirtualTypeScriptEnvironment,
} from "@typescript/vfs";
import ts, { isVariableStatement } from "typescript";

const compilerOpts: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2016,
  esModuleInterop: true,
};
/*
const compilerOptions = {
  strict: true,
  target: ts.ScriptTarget.ES2015,
  typeRoots: [],
  lib: ["es5"],
  skipDefaultLibCheck: true,
  skipLibCheck: true,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  module: ts.ModuleKind.ES2015,
};
*/
const fsMap = new Map<string, string>();

const FAKE_FILENAME = "graphileConfigInspection.ts";

// If using imports where the types don't directly match up to their FS representation (like the
// imports for node) then use triple-slash directives to make sure globals are set up first.
const BASE_CONTENT = `\
/// <reference types="node" />
import "graphile-config";
import {} from './graphile.config.js';
const preset: GraphileConfig.Preset`;
fsMap.set(FAKE_FILENAME, BASE_CONTENT);

// By providing a project root, then the system knows how to resolve node_modules correctly
const projectRoot = process.cwd();
const system = createFSBackedSystem(fsMap, projectRoot, ts);
const env = createVirtualTypeScriptEnvironment(
  system,
  [FAKE_FILENAME, "graphile.config.ts"],
  ts,
  compilerOpts,
);

{
  const content = BASE_CONTENT;
  env.updateFile(FAKE_FILENAME, content);
  const info = env.languageService.getQuickInfoAtPosition(
    FAKE_FILENAME,
    content.length,
  );
  console.dir(info?.documentation);
}

let keys: string[] = [];
{
  const content = BASE_CONTENT + " = {";
  env.updateFile(FAKE_FILENAME, content);
  const completions = env.languageService.getCompletionsAtPosition(
    FAKE_FILENAME,
    content.length,
    {},
  );
  if (completions?.entries) {
    for (const entry of completions.entries) {
      if (entry.kind === "property") {
        keys.push(entry.name);
      }
    }
  }
  //console.dir(completions);
}
console.log(keys);

const accessKey = (key: string): string => {
  // TODO: improve?
  if (/^[A-Za-z0-9_]+$/.test(key)) {
    return `.${key}`;
  } else {
    return `[${JSON.stringify(key)}]`;
  }
};

for (const key of keys) {
  // Always an object, unless...
  const isArray = [
    "disablePlugins",
    "plugins",
    "extends",
    "pgConfigs",
  ].includes(key);

  if (isArray) {
    // TODO!
  } else {
    const SUFFIX1 = ` = {`;
    const SUFFIX2 = `};\n`;
    const contentWithProperty =
      BASE_CONTENT +
      ` = Object.create(null);\npreset${accessKey(key)}${SUFFIX1}${SUFFIX2}`;
    env.updateFile(FAKE_FILENAME, contentWithProperty);
    const info = env.languageService.getQuickInfoAtPosition(
      FAKE_FILENAME,
      contentWithProperty.length - SUFFIX1.length - SUFFIX2.length,
    );
    const completions = env.languageService.getCompletionsAtPosition(
      FAKE_FILENAME,
      contentWithProperty.length - SUFFIX2.length,
      {},
    );
    const relevant = completions?.entries
      .filter((e) => e.kind === "property")
      .map((r) => r.name);
    console.log(`## ${key}`);
    console.log();
    console.log(prettyDocumentation(info?.documentation));
    console.log();
    if (relevant) {
      for (const subkey of relevant) {
        const contentWithSubpropertyAccess =
          contentWithProperty + `preset${accessKey(key)}!${accessKey(subkey)}`;
        env.updateFile(FAKE_FILENAME, contentWithSubpropertyAccess);
        const info = env.languageService.getQuickInfoAtPosition(
          FAKE_FILENAME,
          contentWithSubpropertyAccess.length,
        );
        /*
        const def = env.languageService.getDefinitionAtPosition(
          FAKE_FILENAME,
          contentWithSubpropertyAccess.length,
        );
        const hints = env.languageService.provideInlayHints(
          FAKE_FILENAME,
          ts.createTextSpan(
            contentWithProperty.length,
            contentWithSubpropertyAccess.length - contentWithProperty.length,
          ),
          undefined,
        );
        const com = env.languageService.getDocCommentTemplateAtPosition(
          FAKE_FILENAME,
          contentWithProperty.length,
        );
        console.log(key, subkey, info, def, hints, com);
        */
        console.log(`### ${key}.${subkey}`);
        console.log();
        console.log(
          `Type: \`${prettyDisplayParts(info?.displayParts) ?? "unknown"}\``,
        );
        console.log();
        console.log(prettyDocumentation(info?.documentation));
        console.log();
      }
    }
  }
  /*
  if (completions?.entries) {
    for (const entry of completions.entries) {
      if (entry.kind === "property") {
        keys.push(entry.name);
      }
    }
  }
*/
}

/*
debugger;

const host = createVirtualCompilerHost(system, compilerOpts, ts);
const program = ts.createProgram({
  rootNames: [...fsMap.keys()],
  options: compilerOpts,
  host: host.compilerHost,
});
const checker = program.getTypeChecker();

// This will update the fsMap with new files
// for the .d.ts and .js files
program.emit();

// Now I can look at the AST for the .ts file too
const index = program.getSourceFile(FAKE_FILENAME)!;
const symbols = checker.getSymbolsInScope(index, ts.SymbolFlags.Variable);
const symbol = symbols.find((s) => s.name === "preset");
console.log(symbol);
if (symbol) {
  const type = checker.getDeclaredTypeOfSymbol(symbol);
  console.log(type.getApparentProperties());
  console.dir(type.get);
  const properties = type.getProperties();
  console.dir(properties);
}
ts.forEachChild(index, (node) => {
  if (isVariableStatement(node)) {
    console.log(node.getText());
    const node2 = node.declarationList.declarations[0];
    console.log(node2.getText());
    const type = checker.getTypeAtLocation(node2);
    const properties = type.getProperties();
    // const properties = checker.getDeclaredTypeOfSymbol(symbol).getProperties();
    console.dir(properties);
  }
});
*/

function prettyDisplayParts(
  displayParts: ReadonlyArray<ts.SymbolDisplayPart> | undefined,
): string {
  if (!displayParts) {
    return "";
  }
  let found = false;
  let depth = 0;
  let str = "";
  for (const { text } of displayParts) {
    if (found) {
      str += text;
    } else if (text === "(" || text === "[") {
      depth++;
    } else if (text === ")" || text === "]") {
      depth--;
    } else if (text === ":") {
      found = true;
    }
  }
  return str.trim();
}

function prettyDocumentation(
  parts: ReadonlyArray<ts.SymbolDisplayPart> | undefined,
): string {
  if (!parts) {
    return "";
  }
  let text = "";
  for (const part of parts) {
    switch (part.kind) {
      case "text": {
        text += part.text;
        break;
      }
      default: {
        text += part.text;
        break;
      }
    }
  }
  return text.trim();
}
