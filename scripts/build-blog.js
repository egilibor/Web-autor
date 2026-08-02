/**
 * Genera las páginas del blog a partir de los archivos markdown en content/posts/.
 * Se ejecuta automáticamente en cada despliegue de Netlify (ver netlify.toml).
 *
 * Para cada archivo .md en content/posts/:
 *   - Genera (o regenera) una página HTML individual en la raíz del sitio.
 *   - Añade la entrada al listado de blog.html, entre los marcadores
 *     <!-- POSTS:START --> y <!-- POSTS:END -->.
 */
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { marked } = require("marked");

const ROOT = path.join(__dirname, "..");
const POSTS_DIR = path.join(ROOT, "content", "posts");
const BLOG_HTML_PATH = path.join(ROOT, "blog.html");
const MANIFEST_PATH = path.join(ROOT, "content", ".generated-posts.json");

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function slugify(text) {
  return text
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function formatDateLong(date) {
  // "8 de Febrero, 2026" (estilo usado en la página del artículo)
  const d = new Date(date);
  const mes = MESES[d.getUTCMonth()];
  const mesCap = mes.charAt(0).toUpperCase() + mes.slice(1);
  return `${d.getUTCDate()} de ${mesCap}, ${d.getUTCFullYear()}`;
}

function formatDateUpper(date) {
  // "8 DE FEBRERO, 2026" (estilo usado en el listado del blog)
  const d = new Date(date);
  const mes = MESES[d.getUTCMonth()];
  return `${d.getUTCDate()} DE ${mes.toUpperCase()}, ${d.getUTCFullYear()}`;
}

function stripToExcerpt(html, maxLen = 220) {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s+\S*$/, "") + "...";
}

function postPageTemplate({ title, dateLong, contentHtml }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | Blog Emilio Gil Ibor</title>
    <link href="https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,400;0,700&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
    <style>
        :root { --color-polvora: #ea580c; --color-ink: #0f172a; }
        body { font-family: 'Merriweather', serif; line-height: 1.8; color: #334155; margin: 0; background: #fff; }
        .nav-simple { padding: 20px; text-align: center; border-bottom: 1px solid #eee; }
        .article-container { max-width: 700px; margin: 60px auto; padding: 0 20px; }
        h1 { font-family: 'Playfair Display', serif; font-size: 2.5rem; color: var(--color-ink); line-height: 1.2; }
        .meta { color: var(--color-polvora); font-weight: bold; font-size: 0.9rem; text-transform: uppercase; }
        .content img { width: 100%; border-radius: 4px; margin: 30px 0; }
        .back-btn { display: inline-block; margin-top: 50px; text-decoration: none; color: var(--color-ink); font-weight: bold; border-bottom: 2px solid var(--color-polvora); }
    </style>
</head>
<body>

    <nav class="nav-simple">
        <a href="index.html" style="text-decoration: none; color: #64748b; font-size: 0.8rem; letter-spacing: 2px; text-transform: uppercase;">← Volver a la Web Principal</a>
    </nav>

    <article class="article-container">
        <span class="meta">${dateLong}</span>
        <h1>${title}</h1>

        <div class="content">
${contentHtml}
        </div>

        <a href="blog.html" class="back-btn">Volver al Blog</a>
    </article>

    <script data-goatcounter="https://emiliogil.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
</body>
</html>
`;
}

function postListItemTemplate({ dateUpper, title, excerpt, href }) {
  return `            <article class="post-item">
                <span class="post-date">${dateUpper}</span>
                <h2 class="post-title"><a href="${href}">${title}</a></h2>
                <p class="post-excerpt">
                    ${excerpt}
                </p>
                <a href="${href}" class="read-more">Seguir leyendo →</a>
            </article>`;
}

function main() {
  if (!fs.existsSync(POSTS_DIR)) {
    console.log("No hay carpeta content/posts, no se genera nada.");
    return;
  }

  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md"));
  const posts = files
    .map((filename) => {
      const raw = fs.readFileSync(path.join(POSTS_DIR, filename), "utf8");
      const { data, content } = matter(raw);
      // Archivo vacío o sin frontmatter real: lo ignoramos (no es un post válido).
      if (!data || Object.keys(data).length === 0) return null;
      const slug = data.slug || slugify(data.title || filename.replace(/\.md$/, ""));
      const contentHtml = marked.parse(content || "");
      const excerpt = data.excerpt ? data.excerpt : stripToExcerpt(contentHtml);
      return {
        title: data.title || "Sin título",
        date: data.date || new Date(),
        excerpt,
        slug,
        contentHtml,
        href: `${slug}.html`,
      };
    })
    .filter(Boolean);

  posts.sort((a, b) => new Date(b.date) - new Date(a.date));

  // 1. Generar página individual por cada post
  for (const post of posts) {
    const html = postPageTemplate({
      title: post.title,
      dateLong: formatDateLong(post.date),
      contentHtml: post.contentHtml,
    });
    fs.writeFileSync(path.join(ROOT, post.href), html, "utf8");
    console.log(`Generado ${post.href}`);
  }

  // 1b. Borrar páginas de entradas que ya no existen (se borraron desde el panel)
  const currentHrefs = posts.map((p) => p.href);
  let previousHrefs = [];
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      previousHrefs = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    } catch (e) {
      previousHrefs = [];
    }
  }
  const orphanHrefs = previousHrefs.filter((href) => !currentHrefs.includes(href));
  for (const href of orphanHrefs) {
    const filePath = path.join(ROOT, href);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`Eliminado ${href} (entrada borrada)`);
      } catch (e) {
        console.warn(`No se pudo eliminar ${href}: ${e.message}`);
      }
    }
  }
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(currentHrefs, null, 2), "utf8");

  // 2. Regenerar el listado dentro de blog.html
  const blogHtml = fs.readFileSync(BLOG_HTML_PATH, "utf8");
  const startMarker = "<!-- POSTS:START -->";
  const endMarker = "<!-- POSTS:END -->";
  const startIdx = blogHtml.indexOf(startMarker);
  const endIdx = blogHtml.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    console.error("No se encontraron los marcadores POSTS:START/POSTS:END en blog.html");
    process.exit(1);
  }

  const listHtml = posts
    .map((post) =>
      postListItemTemplate({
        dateUpper: formatDateUpper(post.date),
        title: post.title,
        excerpt: post.excerpt,
        href: post.href,
      })
    )
    .join("\n\n");

  const newBlogHtml =
    blogHtml.slice(0, startIdx + startMarker.length) +
    "\n\n" +
    listHtml +
    "\n\n            " +
    blogHtml.slice(endIdx);

  fs.writeFileSync(BLOG_HTML_PATH, newBlogHtml, "utf8");
  console.log(`Actualizado blog.html con ${posts.length} entrada(s).`);
}

main();
