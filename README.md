# Notion post feed

A dependency-free, transparent blog feed delivered as one embeddable script. The widget uses Shadow DOM so its layout stays reliable while typography and colors remain easy to match to the host site.

## Try it

Run any static server in this folder, for example:

```sh
python3 -m http.server 4173
```

Then open `http://localhost:4173`. With no `source`, the widget shows sample posts.

## Embed it

```html
<notion-post-feed
  source="https://YOUR-PUBLIC-ENDPOINT.example/posts"
  limit="10"
  refresh="60"
></notion-post-feed>
<script src="https://YOUR-SITE.example/notion-feed.js"></script>
```

`refresh` is measured in seconds. Use `0` to disable polling. You can also configure defaults on the script itself with `data-source`, `data-limit`, `data-refresh`, `data-locale`, and `data-empty`.

The endpoint may return either a bare array or `{ "posts": [...] }`:

```json
{
  "posts": [
    {
      "title": "Post title",
      "description": "A short description.",
      "url": "https://example.com/post",
      "date": "2026-07-20",
      "tags": ["Design", "Notes"],
      "collection": "Field Notes"
    }
  ]
}
```

Do not put a Notion integration token in this script or in browser code. The public endpoint will keep that secret server-side, query the database, apply filters, and translate Notion properties into the small JSON shape above.

## Styling

The widget has no background and inherits the host page's font and text color. Override these variables on `notion-post-feed` when needed:

```css
notion-post-feed {
  --nf-text: #171717;
  --nf-muted: #6b6b66;
  --nf-line: #deded8;
  --nf-accent: #b34b2e;
  --nf-gap: 2.5rem;
}
```

## Events

The element dispatches `notion-feed:loaded` with `{ count }` and `notion-feed:error` with `{ error }`.

## Notion → GitHub Markdown sync

The repository includes a dependency-free exporter at `scripts/sync-notion.mjs` and a GitHub Actions workflow that runs every 15 minutes. It:

1. Queries the configured Notion data source for rows where `Published` is checked.
2. Sorts them by `Published Date`, newest first.
3. Converts each page body to `content/posts/<slug>.md` with YAML frontmatter.
4. Writes `feed.json`, which is the browser widget's public data source.
5. Commits changes back to the repository only when the exported content changed.

In the GitHub repository, create an Actions secret named `NOTION_TOKEN`. The token must belong to a Notion integration that has been granted access to the **Website Blog** database. Never add the token to a file or to the widget.

After GitHub Pages is enabled, point the widget at the generated file:

```html
<notion-post-feed source="https://OWNER.github.io/REPOSITORY/feed.json"></notion-post-feed>
<script src="https://OWNER.github.io/REPOSITORY/notion-feed.js"></script>
```

Run **Sync Notion posts** manually once from the repository's Actions tab to create the initial Markdown files and `feed.json`; scheduled runs continue every 15 minutes.
