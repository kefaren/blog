import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const TOKEN = process.env.NOTION_TOKEN;
const DATA_SOURCE_ID = process.env.NOTION_DATA_SOURCE_ID;
const API_VERSION = "2025-09-03";
const ROOT = process.cwd();
const POSTS_DIR = path.join(ROOT, "content", "posts");
const FEED_PATH = path.join(ROOT, "feed.json");

if (!TOKEN) throw new Error("Missing NOTION_TOKEN");
if (!DATA_SOURCE_ID) throw new Error("Missing NOTION_DATA_SOURCE_ID");

async function notion(endpoint, options = {}) {
  const response = await fetch(`https://api.notion.com/v1${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Notion-Version": API_VERSION,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`Notion ${response.status}: ${await response.text()}`);
  return response.json();
}

async function queryPublishedPosts() {
  const pages = [];
  let cursor;
  do {
    const payload = await notion(`/data_sources/${DATA_SOURCE_ID}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        filter: { property: "Published", checkbox: { equals: true } },
        sorts: [{ property: "Published Date", direction: "descending" }],
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    });
    pages.push(...payload.results);
    cursor = payload.has_more ? payload.next_cursor : undefined;
  } while (cursor);
  return pages;
}

async function getChildren(blockId) {
  const blocks = [];
  let cursor;
  do {
    const params = new URLSearchParams({ page_size: "100" });
    if (cursor) params.set("start_cursor", cursor);
    const payload = await notion(`/blocks/${blockId}/children?${params}`);
    blocks.push(...payload.results);
    cursor = payload.has_more ? payload.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

function escapeMarkdown(value = "") {
  return value.replace(/([\\`*_[\]<>])/g, "\\$1");
}

function richText(items = []) {
  return items.map((item) => {
    let value = escapeMarkdown(item.plain_text || "");
    const a = item.annotations || {};
    if (item.href) value = `[${value}](${item.href})`;
    if (a.code) value = `\`${value}\``;
    if (a.bold) value = `**${value}**`;
    if (a.italic) value = `_${value}_`;
    if (a.strikethrough) value = `~~${value}~~`;
    return value;
  }).join("");
}

async function blocksToMarkdown(blocks, depth = 0) {
  const lines = [];
  let number = 0;
  for (const block of blocks) {
    const data = block[block.type] || {};
    const text = richText(data.rich_text);
    const indent = "  ".repeat(depth);
    let line = "";
    if (block.type !== "numbered_list_item") number = 0;

    switch (block.type) {
      case "paragraph": line = text; break;
      case "heading_1": line = `# ${text}`; break;
      case "heading_2": line = `## ${text}`; break;
      case "heading_3": line = `### ${text}`; break;
      case "bulleted_list_item": line = `${indent}- ${text}`; break;
      case "numbered_list_item": line = `${indent}${++number}. ${text}`; break;
      case "to_do": line = `${indent}- [${data.checked ? "x" : " "}] ${text}`; break;
      case "quote": line = `> ${text}`; break;
      case "callout": line = `> ${data.icon?.emoji || ""} ${text}`.trimEnd(); break;
      case "code": line = `\`\`\`${data.language || ""}\n${(data.rich_text || []).map((item) => item.plain_text).join("")}\n\`\`\``; break;
      case "divider": line = "---"; break;
      case "image": {
        const url = data.type === "external" ? data.external?.url : data.file?.url;
        if (url) line = `![${richText(data.caption) || ""}](${url})`;
        break;
      }
      case "bookmark": line = data.url ? `[${data.url}](${data.url})` : ""; break;
      case "embed": line = data.url || ""; break;
      case "child_page": line = `## ${escapeMarkdown(data.title || "Untitled")}`; break;
      case "toggle": line = `<details><summary>${text}</summary>`; break;
      default: line = text;
    }

    if (line) lines.push(line);
    if (block.has_children) {
      const children = await getChildren(block.id);
      lines.push(await blocksToMarkdown(children, depth + 1));
    }
    if (block.type === "toggle") lines.push("</details>");
  }
  return lines.filter(Boolean).join("\n\n");
}

function plainText(property) {
  if (!property) return "";
  const items = property.title || property.rich_text || [];
  return items.map((item) => item.plain_text || "").join("");
}

function slugify(value, fallback) {
  const slug = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return slug || fallback.replaceAll("-", "").slice(0, 12);
}

function yaml(value) {
  return JSON.stringify(value ?? "");
}

function pageMetadata(page) {
  const p = page.properties;
  return {
    title: plainText(p.Title),
    description: plainText(p.Description),
    tags: (p.Tags?.multi_select || []).map((tag) => tag.name),
    date: p["Published Date"]?.date?.start || "",
    collection: p.Collection?.select?.name || "",
    url: p.URL?.url || page.url,
    notionUrl: page.url,
  };
}

async function main() {
  const pages = await queryPublishedPosts();
  await rm(POSTS_DIR, { recursive: true, force: true });
  await mkdir(POSTS_DIR, { recursive: true });

  const feed = [];
  for (const page of pages) {
    const meta = pageMetadata(page);
    const slug = slugify(meta.title, page.id);
    const body = await blocksToMarkdown(await getChildren(page.id));
    const frontmatter = [
      "---",
      `title: ${yaml(meta.title)}`,
      `description: ${yaml(meta.description)}`,
      `date: ${yaml(meta.date)}`,
      `collection: ${yaml(meta.collection)}`,
      `tags: ${yaml(meta.tags)}`,
      `url: ${yaml(meta.url)}`,
      `notion_url: ${yaml(meta.notionUrl)}`,
      `notion_id: ${yaml(page.id)}`,
      "---",
      "",
    ].join("\n");
    await writeFile(path.join(POSTS_DIR, `${slug}.md`), `${frontmatter}${body}\n`);
    feed.push({ ...meta, slug, markdown: `content/posts/${slug}.md` });
  }

  await writeFile(FEED_PATH, `${JSON.stringify({ generatedAt: new Date().toISOString(), posts: feed }, null, 2)}\n`);
  console.log(`Exported ${feed.length} published post${feed.length === 1 ? "" : "s"}.`);
}

await main();
