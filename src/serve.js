const root = new URL("../public/", import.meta.url);

const locate = (pathname) => {
  const relative = decodeURIComponent(pathname).replace(/^\/+/, "");
  const target = new URL(relative === "" || relative.endsWith("/") ? `${relative}index.html` : relative, root);
  return target.href.startsWith(root.href) ? target : null;
};

const server = Bun.serve({
  port: Number(process.env.PORT ?? 8000),
  async fetch(request) {
    const target = locate(new URL(request.url).pathname);
    if (!target) return new Response("Forbidden", { status: 403 });

    const file = Bun.file(target);
    return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 });
  },
});

console.log(`public/ served at ${server.url}`);
