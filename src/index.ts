// C:\Users\Paul Wynn\github\wfsl-route-sentinel\src\index.ts
import fs from "node:fs";
import path from "node:path";

type Severity = "INFO" | "WARN" | "ERROR";

type Finding = {
  severity: Severity;
  code: string;
  message: string;
  detail?: string;
};

type RouteKind = "app-page" | "app-api" | "pages-page";

type RouteEntry = {
  kind: RouteKind;
  route: string;
  file: string;
};

type Report = {
  sentinel: {
    name: "wfsl-route-sentinel";
    version: string;
    generatedAtUtc: string;
  };
  target: {
    root: string;
  };
  signals: {
    hasSrcApp: boolean;
    hasSrcPages: boolean;
    hasAppLayout: boolean;
    hasAppRootPage: boolean;
    hasMiddlewareRoot: boolean;
    hasMiddlewareSrc: boolean;
    nextConfigFiles: string[];
  };
  routes: {
    total: number;
    entries: RouteEntry[];
  };
  findings: Finding[];
};

function nowUtcIso() {
  return new Date().toISOString();
}

function exists(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function readTextIfExists(p: string): string {
  if (!exists(p)) return "";
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function normaliseSlashes(p: string) {
  return p.replaceAll("\\", "/");
}

function walkFiles(root: string): string[] {
  const out: string[] = [];
  const stack: string[] = [root];

  while (stack.length) {
    const cur = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        // Ignore common noise
        if (e.name === "node_modules" || e.name === ".git" || e.name === ".next" || e.name === "dist" || e.name === "out") {
          continue;
        }
        stack.push(full);
      } else if (e.isFile()) {
        out.push(full);
      }
    }
  }

  return out;
}

function isPageExt(file: string) {
  return (
    file.endsWith(".ts") ||
    file.endsWith(".tsx") ||
    file.endsWith(".js") ||
    file.endsWith(".jsx")
  );
}

function stripExt(file: string) {
  return file.replace(/\.(ts|tsx|js|jsx)$/, "");
}

function toRouteFromAppPage(appDir: string, file: string): string {
  // file is .../src/app/<segments>/page.(tsx|ts|jsx|js)
  const rel = path.relative(appDir, file);
  const relNorm = normaliseSlashes(rel);
  // remove trailing /page
  const withoutPage = relNorm.replace(/\/page\.(ts|tsx|js|jsx)$/, "");
  const seg = withoutPage.trim();
  if (!seg) return "/";
  // handle group segments ( ... ) by removing them
  const cleaned = seg
    .split("/")
    .filter(Boolean)
    .filter((s) => !(s.startsWith("(") && s.endsWith(")")))
    .map((s) => (s === "route" ? "" : s))
    .join("/");

  const route = "/" + cleaned;
  return route === "/" ? "/" : route.replace(/\/+/g, "/");
}

function toRouteFromAppApi(appDir: string, file: string): string {
  // file is .../src/app/api/<segments>/route.(ts|tsx|js|jsx)
  const rel = path.relative(appDir, file);
  const relNorm = normaliseSlashes(rel);
  const withoutRoute = relNorm.replace(/\/route\.(ts|tsx|js|jsx)$/, "");
  const apiSeg = withoutRoute.replace(/^api\/?/, "api/");
  // remove group segments
  const cleaned = apiSeg
    .split("/")
    .filter(Boolean)
    .filter((s) => !(s.startsWith("(") && s.endsWith(")")))
    .join("/");

  return "/" + cleaned.replace(/\/+/g, "/");
}

function toRouteFromPages(pagesDir: string, file: string): string {
  // .../src/pages/<segments>.tsx
  const rel = path.relative(pagesDir, file);
  const relNorm = normaliseSlashes(rel);
  const noExt = stripExt(relNorm);

  // ignore special Next files
  const base = path.basename(noExt);
  const specials = ["_app", "_document", "_error", "404", "500"];
  if (specials.includes(base)) return "";

  // index => /
  if (noExt === "index") return "/";

  const route = "/" + noExt
    .replace(/\/index$/, "")
    .replace(/\[(\.\.\.)?([^\]]+)\]/g, "[$1$2]"); // keep brackets, only normalise if needed

  return route.replace(/\/+/g, "/");
}

function findNextConfigFiles(root: string): string[] {
  const candidates = ["next.config.js", "next.config.mjs", "next.config.ts"];
  return candidates
    .map((f) => path.join(root, f))
    .filter((p) => exists(p))
    .map((p) => normaliseSlashes(path.relative(root, p)));
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args.set(key, true);
    } else {
      args.set(key, next);
      i++;
    }
  }
  return args;
}

function printHelp() {
  console.log(
    [
      "WFSL Route Sentinel v0.1.0",
      "",
      "Usage:",
      "  wfsl-route-sentinel --root <path>",
      "",
      "Options:",
      "  --root <path>     Target repository root (default: current directory).",
      "  --out <path>      Output directory (default: <root>).",
      "  --help            Show help.",
      "",
      "Outputs:",
      "  sentinel.route-report.json",
      "  sentinel.route-report.md",
      ""
    ].join("\n")
  );
}

function addFinding(findings: Finding[], severity: Severity, code: string, message: string, detail?: string) {
  findings.push({ severity, code, message, detail });
}

function writeFile(outPath: string, content: string) {
  fs.writeFileSync(outPath, content, "utf8");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.get("help")) {
    printHelp();
    process.exit(0);
  }

  const root = path.resolve(String(args.get("root") || process.cwd()));
  const outDir = path.resolve(String(args.get("out") || root));

  const version = "0.1.0";

  const srcDir = path.join(root, "src");
  const appDir = path.join(srcDir, "app");
  const pagesDir = path.join(srcDir, "pages");

  const hasSrcApp = exists(appDir);
  const hasSrcPages = exists(pagesDir);

  const appLayout = path.join(appDir, "layout.tsx");
  const appLayoutAltTs = path.join(appDir, "layout.ts");
  const appLayoutAltJs = path.join(appDir, "layout.jsx");
  const appLayoutAltJs2 = path.join(appDir, "layout.js");
  const hasAppLayout = exists(appLayout) || exists(appLayoutAltTs) || exists(appLayoutAltJs) || exists(appLayoutAltJs2);

  const appRootPage = path.join(appDir, "page.tsx");
  const appRootPageAltTs = path.join(appDir, "page.ts");
  const appRootPageAltJs = path.join(appDir, "page.jsx");
  const appRootPageAltJs2 = path.join(appDir, "page.js");
  const hasAppRootPage = exists(appRootPage) || exists(appRootPageAltTs) || exists(appRootPageAltJs) || exists(appRootPageAltJs2);

  const middlewareRootTs = path.join(root, "middleware.ts");
  const middlewareRootJs = path.join(root, "middleware.js");
  const middlewareSrcTs = path.join(srcDir, "middleware.ts");
  const middlewareSrcJs = path.join(srcDir, "middleware.js");

  const hasMiddlewareRoot = exists(middlewareRootTs) || exists(middlewareRootJs);
  const hasMiddlewareSrc = exists(middlewareSrcTs) || exists(middlewareSrcJs);

  const nextConfigFiles = findNextConfigFiles(root);

  const findings: Finding[] = [];

  if (!exists(root)) {
    addFinding(findings, "ERROR", "ROOT_MISSING", "Target root does not exist.", root);
  }

  if (!exists(srcDir)) {
    addFinding(findings, "WARN", "SRC_MISSING", "No src/ directory found. This tool expects Next.js projects with src/app or src/pages.", normaliseSlashes(srcDir));
  }

  if (hasSrcApp) {
    if (!hasAppLayout) {
      addFinding(findings, "ERROR", "APP_LAYOUT_MISSING", "src/app exists but no root layout was found. App Router may be invalid or routes may be unreachable.", "Expected src/app/layout.(tsx|ts|jsx|js)");
    }
    if (!hasAppRootPage) {
      addFinding(findings, "WARN", "APP_ROOT_PAGE_MISSING", "src/app exists but no root page was found. Some route graphs behave unexpectedly without a root page.", "Expected src/app/page.(tsx|ts|jsx|js)");
    }
  }

  if (hasSrcApp && hasSrcPages) {
    addFinding(findings, "WARN", "DUAL_ROUTER_PRESENT", "Both src/app and src/pages exist. Router precedence and rewrites can create ambiguous reachability. Prefer explicit policy.", "Consider documenting precedence and allowlists.");
  }

  if (hasMiddlewareRoot || hasMiddlewareSrc) {
    const m1 = hasMiddlewareRoot ? (exists(middlewareRootTs) ? "middleware.ts" : "middleware.js") : "";
    const m2 = hasMiddlewareSrc ? (exists(middlewareSrcTs) ? "src/middleware.ts" : "src/middleware.js") : "";
    addFinding(findings, "WARN", "MIDDLEWARE_PRESENT", "Middleware detected. Routes may be redirected, rewritten, or blocked before matching.", [m1, m2].filter(Boolean).join(", "));
  }

  // Route discovery
  const routes: RouteEntry[] = [];

  if (hasSrcApp) {
    const files = walkFiles(appDir).filter(isPageExt);
    for (const f of files) {
      const rel = normaliseSlashes(path.relative(root, f));
      if (rel.endsWith("/page.tsx") || rel.endsWith("/page.ts") || rel.endsWith("/page.jsx") || rel.endsWith("/page.js")) {
        routes.push({
          kind: "app-page",
          route: toRouteFromAppPage(appDir, f),
          file: rel,
        });
      }
      if (rel.includes("/src/app/api/") && (rel.endsWith("/route.ts") || rel.endsWith("/route.tsx") || rel.endsWith("/route.js") || rel.endsWith("/route.jsx"))) {
        routes.push({
          kind: "app-api",
          route: toRouteFromAppApi(appDir, f),
          file: rel,
        });
      }
    }
  }

  if (hasSrcPages) {
    const files = walkFiles(pagesDir).filter((f) => isPageExt(f));
    for (const f of files) {
      const rel = normaliseSlashes(path.relative(root, f));
      const r = toRouteFromPages(pagesDir, f);
      if (!r) continue;
      routes.push({
        kind: "pages-page",
        route: r,
        file: rel,
      });
    }
  }

  // Deterministic ordering
  routes.sort((a, b) => (a.route + a.kind + a.file).localeCompare(b.route + b.kind + b.file));

  // Reachability heuristics (simple but useful)
  // If /chat exists in app-page routes but app layout missing => likely unreachable
  const hasChat = routes.some((r) => r.kind === "app-page" && r.route === "/chat");
  if (hasChat && hasSrcApp && !hasAppLayout) {
    addFinding(findings, "ERROR", "ROUTE_UNREACHABLE_NO_LAYOUT", "Route /chat exists but App Router root layout is missing. Route is likely unreachable.", "Add src/app/layout.tsx");
  }

  // next.config presence note
  if (nextConfigFiles.length === 0) {
    addFinding(findings, "INFO", "NEXT_CONFIG_NOT_FOUND", "No next.config.* file found. Defaults apply.", "");
  } else {
    const joined = nextConfigFiles.join(", ");
    const text = nextConfigFiles.map((f) => readTextIfExists(path.join(root, f))).join("\n");
    if (text.includes("appDir") && text.includes("false")) {
      addFinding(findings, "WARN", "APPDIR_DISABLED", "next.config appears to disable appDir. App Router routes may be ignored.", joined);
    } else if (text.includes("appDir") && text.includes("true")) {
      addFinding(findings, "INFO", "APPDIR_ENABLED", "next.config references appDir true.", joined);
    }
  }

  const report: Report = {
    sentinel: {
      name: "wfsl-route-sentinel",
      version,
      generatedAtUtc: nowUtcIso(),
    },
    target: { root: normaliseSlashes(root) },
    signals: {
      hasSrcApp,
      hasSrcPages,
      hasAppLayout,
      hasAppRootPage,
      hasMiddlewareRoot,
      hasMiddlewareSrc,
      nextConfigFiles,
    },
    routes: {
      total: routes.length,
      entries: routes,
    },
    findings,
  };

  // Outputs
  fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, "sentinel.route-report.json");
  const mdPath = path.join(outDir, "sentinel.route-report.md");

  writeFile(jsonPath, JSON.stringify(report, null, 2));

  const mdLines: string[] = [];
  mdLines.push("# WFSL Route Sentinel Report");
  mdLines.push("");
  mdLines.push(`Generated (UTC): ${report.sentinel.generatedAtUtc}`);
  mdLines.push(`Target root: ${report.target.root}`);
  mdLines.push("");
  mdLines.push("## Signals");
  mdLines.push("");
  mdLines.push(`- src/app present: ${report.signals.hasSrcApp}`);
  mdLines.push(`- src/pages present: ${report.signals.hasSrcPages}`);
  mdLines.push(`- app layout present: ${report.signals.hasAppLayout}`);
  mdLines.push(`- app root page present: ${report.signals.hasAppRootPage}`);
  mdLines.push(`- middleware at root: ${report.signals.hasMiddlewareRoot}`);
  mdLines.push(`- middleware in src/: ${report.signals.hasMiddlewareSrc}`);
  mdLines.push(`- next.config files: ${report.signals.nextConfigFiles.length ? report.signals.nextConfigFiles.join(", ") : "(none)"}`);
  mdLines.push("");
  mdLines.push("## Findings");
  mdLines.push("");
  if (report.findings.length === 0) {
    mdLines.push("- No findings.");
  } else {
    for (const f of report.findings) {
      mdLines.push(`- **${f.severity}** \`${f.code}\` ${f.message}${f.detail ? ` (${f.detail})` : ""}`);
    }
  }
  mdLines.push("");
  mdLines.push("## Routes");
  mdLines.push("");
  mdLines.push(`Total routes discovered: ${report.routes.total}`);
  mdLines.push("");
  for (const r of report.routes.entries) {
    mdLines.push(`- \`${r.route}\` (${r.kind}) — ${r.file}`);
  }
  mdLines.push("");

  writeFile(mdPath, mdLines.join("\n"));

  // Console summary
  const errCount = findings.filter((f) => f.severity === "ERROR").length;
  const warnCount = findings.filter((f) => f.severity === "WARN").length;
  console.log(`WFSL Route Sentinel v${version}`);
  console.log(`Target: ${root}`);
  console.log(`Routes: ${routes.length}`);
  console.log(`Findings: ${errCount} error(s), ${warnCount} warning(s)`);
  console.log(`Wrote: ${normaliseSlashes(jsonPath)}`);
  console.log(`Wrote: ${normaliseSlashes(mdPath)}`);

  // Non-zero exit if errors
  if (errCount > 0) process.exit(2);
}

main();
