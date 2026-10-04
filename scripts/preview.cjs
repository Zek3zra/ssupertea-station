"use strict";
// Local preview: node scripts/preview.cjs (optional server credentials in .env.local).
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname,"..");
const envFile = path.join(root,".env.local");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
const port = Number(process.env.PREVIEW_PORT || 4173);
const types = { ".html":"text/html", ".css":"text/css", ".js":"text/javascript", ".json":"application/json", ".jpg":"image/jpeg", ".png":"image/png", ".svg":"image/svg+xml", ".ico":"image/x-icon" };
const pages = new Set(["index.html","admin.html","rider.html","reset-password.html","auth-callback.html","manifest.json","sw.js"]);
http.createServer(async (req,res) => {
  res.setHeader("Cache-Control","no-store");
  try {
    const url = new URL(req.url,"http://localhost");
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.startsWith("/api/")) {
      const name = pathname.slice(5).replace(/\.js$/, "");
      if (!/^[a-z-]+$/.test(name)) { res.writeHead(404); return res.end(); }
      const file = path.join(root,"api",`${name}.js`);
      if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
      req.query = Object.fromEntries(url.searchParams);
      let body = "";
      for await (const chunk of req) { body += chunk; if (body.length > 65536) { res.writeHead(413); return res.end(); } }
      req.body = body ? JSON.parse(body) : {};
      res.status = code => { res.statusCode = code; return res; };
      res.json = value => { res.setHeader("Content-Type","application/json"); res.end(JSON.stringify(value)); };
      return await require(file)(req,res);
    }
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const target = path.resolve(root,relative);
    if (!target.startsWith(root + path.sep) || !(pages.has(relative) || /^(assets|css|js)\//.test(relative)) || !types[path.extname(target)]) { res.writeHead(404); return res.end("Not found"); }
    const content = await fs.promises.readFile(target);
    res.setHeader("Content-Type",types[path.extname(target)]);
    res.end(content);
  } catch (error) {
    res.statusCode = error.code === "ENOENT" ? 404 : 500;
    res.end(res.statusCode === 404 ? "Not found" : "Preview request failed");
    if (res.statusCode === 500) console.error(error.message);
  }
}).listen(port,"127.0.0.1",() => console.log(`Ssupertea local preview: http://127.0.0.1:${port}`));
