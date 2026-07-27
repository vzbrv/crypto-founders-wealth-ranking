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
  const relativePath =
    pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  let file = new URL(relativePath, root);

  if (!file.pathname.startsWith(root.pathname)) {
    response.writeHead(400).end("Bad request");
    return;
  }

  try {
    if ((await stat(file)).isDirectory()) {
      file = new URL(
        "index.html",
        file.pathname.endsWith("/") ? file : `${file}/`,
      );
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
