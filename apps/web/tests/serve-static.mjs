import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { URL } from "node:url";

const root = new URL("../out/", import.meta.url);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

createServer(async (request, response) => {
  const pathname = decodeURIComponent(
    new URL(request.url, "http://localhost").pathname,
  );
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
