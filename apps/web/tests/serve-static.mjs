import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { URL } from "node:url";

const root = new URL("../out/", import.meta.url);
const redirectRules = (await readFile(new URL("_redirects", root), "utf8"))
  .split(/\r?\n/)
  .map((line) => line.trim().split(/\s+/))
  .filter(([source, target, status]) => source && target && status)
  .map(([source, target, status]) => ({
    source,
    target,
    status: Number(status),
  }));
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function findRedirect(pathname) {
  for (const rule of redirectRules) {
    if (rule.source === pathname) return rule;
    if (
      rule.source.endsWith("/*") &&
      pathname.startsWith(rule.source.slice(0, -1))
    ) {
      return {
        ...rule,
        target: rule.target.replace(
          ":splat",
          pathname.slice(rule.source.length - 1),
        ),
      };
    }
  }
  return null;
}

createServer(async (request, response) => {
  const pathname = decodeURIComponent(
    new URL(request.url, "http://localhost").pathname,
  );
  const redirect = findRedirect(pathname);
  if (redirect) {
    response.writeHead(redirect.status, { Location: redirect.target }).end();
    return;
  }
  const relativePath = pathname.replace(/^\/+|\/+$/g, "");
  const candidates =
    pathname === "/"
      ? [new URL("index.html", root)]
      : relativePath.split("/").at(-1)?.includes(".")
        ? [new URL(relativePath, root)]
        : [
            new URL(`${relativePath}.html`, root),
            new URL(`${relativePath}/index.html`, root),
          ];

  if (
    candidates.some(
      (candidate) => !candidate.pathname.startsWith(root.pathname),
    )
  ) {
    response.writeHead(400).end("Bad request");
    return;
  }

  try {
    let file;
    for (const candidate of candidates) {
      try {
        if ((await stat(candidate)).isFile()) {
          file = candidate;
          break;
        }
      } catch {
        // Try the next static-export path shape.
      }
    }

    if (!file) {
      throw new Error("Not found");
    }

    const extension = file.pathname.slice(file.pathname.lastIndexOf("."));
    response.writeHead(200, {
      "Content-Type": contentTypes[extension] ?? "application/octet-stream",
    });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(3000, "127.0.0.1");
