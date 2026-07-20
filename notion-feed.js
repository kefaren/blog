(function () {
  "use strict";

  const currentScript = document.currentScript;
  const defaults = {
    source: currentScript?.dataset.source || "",
    limit: Number(currentScript?.dataset.limit || 10),
    refresh: Number(currentScript?.dataset.refresh || 60),
    locale: currentScript?.dataset.locale || document.documentElement.lang || "en-US",
    empty: currentScript?.dataset.empty || "No posts yet.",
  };

  const samplePosts = [
    {
      title: "Designing for the space between",
      description: "A few notes on restraint, rhythm, and making digital things feel quietly considered.",
      url: "#",
      date: "2026-07-18",
      tags: ["Design", "Process"],
      collection: "Field Notes",
    },
    {
      title: "The case for a smaller internet",
      description: "Why personal sites, careful curation, and useful constraints still matter.",
      url: "#",
      date: "2026-07-09",
      tags: ["Web", "Ideas"],
      collection: "Essays",
    },
    {
      title: "What I kept from the first draft",
      description: "An honest look at editing: what survived, what disappeared, and what finally made the piece work.",
      url: "#",
      date: "2026-06-27",
      tags: ["Writing"],
      collection: "Studio Journal",
    },
  ];

  const styles = `
    :host {
      --nf-text: currentColor;
      --nf-muted: color-mix(in srgb, currentColor 58%, transparent);
      --nf-line: color-mix(in srgb, currentColor 16%, transparent);
      --nf-accent: currentColor;
      --nf-gap: clamp(1.75rem, 4vw, 3rem);
      display: block;
      width: 100%;
      color: var(--nf-text);
      background: transparent;
      font: inherit;
    }
    * { box-sizing: border-box; }
    .feed { display: grid; margin: 0; padding: 0; list-style: none; }
    .post {
      display: grid;
      gap: .7rem;
      padding: var(--nf-gap) 0;
      border-bottom: 1px solid var(--nf-line);
    }
    .post:first-child { padding-top: 0; }
    .post:last-child { border-bottom: 0; padding-bottom: 0; }
    .meta { display: flex; flex-wrap: wrap; gap: .4rem .7rem; align-items: center; }
    .collection, time {
      color: var(--nf-muted);
      font-size: .75rem;
      line-height: 1.4;
      letter-spacing: .065em;
      text-transform: uppercase;
    }
    .collection + time::before { content: "·"; margin-right: .7rem; }
    h2 { margin: 0; font: inherit; font-size: clamp(1.35rem, 3vw, 1.9rem); font-weight: 600; line-height: 1.18; letter-spacing: -.025em; }
    a { color: var(--nf-accent); text-decoration: none; text-decoration-thickness: .07em; text-underline-offset: .16em; }
    a:hover { text-decoration: underline; }
    a:focus-visible { outline: 2px solid var(--nf-accent); outline-offset: 4px; border-radius: 2px; }
    .description { max-width: 66ch; margin: 0; color: var(--nf-muted); font-size: .98rem; line-height: 1.65; }
    .tags { display: flex; flex-wrap: wrap; gap: .45rem; margin-top: .15rem; }
    .tag { padding: .28rem .55rem; border: 1px solid var(--nf-line); border-radius: 999px; color: var(--nf-muted); font-size: .72rem; line-height: 1; }
    .status { margin: 0; color: var(--nf-muted); font-size: .9rem; line-height: 1.5; }
    .skeleton { display: grid; gap: .8rem; padding-bottom: var(--nf-gap); }
    .bone { height: .8rem; max-width: 36rem; border-radius: 999px; background: var(--nf-line); animation: pulse 1.3s ease-in-out infinite alternate; }
    .bone:first-child { width: 8rem; height: .55rem; }
    .bone:nth-child(2) { width: min(28rem, 80%); height: 1.6rem; }
    .bone:nth-child(3) { width: min(36rem, 95%); }
    @keyframes pulse { to { opacity: .42; } }
    @media (prefers-reduced-motion: reduce) { .bone { animation: none; } }
  `;

  class NotionPostFeed extends HTMLElement {
    static get observedAttributes() { return ["source", "limit", "refresh", "locale"]; }

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.timer = null;
      this.loading = false;
    }

    connectedCallback() { this.load(); }
    disconnectedCallback() { clearInterval(this.timer); }
    attributeChangedCallback() { if (this.isConnected) this.load(); }

    get config() {
      return {
        source: this.getAttribute("source") || defaults.source,
        limit: Math.max(1, Number(this.getAttribute("limit") || defaults.limit)),
        refresh: Math.max(0, Number(this.getAttribute("refresh") || defaults.refresh)),
        locale: this.getAttribute("locale") || defaults.locale,
      };
    }

    async load() {
      if (this.loading) return;
      clearInterval(this.timer);
      const config = this.config;

      if (!config.source) {
        this.render(samplePosts.slice(0, config.limit));
        this.dataset.mode = "demo";
        return;
      }

      this.loading = true;
      if (!this.shadowRoot.querySelector(".feed")) this.renderLoading();
      try {
        const response = await fetch(config.source, { headers: { Accept: "application/json" }, cache: "no-store" });
        if (!response.ok) throw new Error(`Feed request failed (${response.status})`);
        const payload = await response.json();
        const posts = Array.isArray(payload) ? payload : payload.posts;
        if (!Array.isArray(posts)) throw new Error("Feed response must be an array or { posts: [] }");
        this.render(posts.slice(0, config.limit));
        this.dataset.mode = "live";
        this.dispatchEvent(new CustomEvent("notion-feed:loaded", { detail: { count: posts.length } }));
      } catch (error) {
        this.renderError(error.message);
        this.dispatchEvent(new CustomEvent("notion-feed:error", { detail: { error } }));
      } finally {
        this.loading = false;
        if (config.refresh > 0) this.timer = setInterval(() => this.load(), config.refresh * 1000);
      }
    }

    renderLoading() {
      this.shadowRoot.innerHTML = `<style>${styles}</style><div class="skeleton" role="status" aria-label="Loading posts"><span class="bone"></span><span class="bone"></span><span class="bone"></span></div>`;
    }

    renderError(message) {
      this.shadowRoot.innerHTML = `<style>${styles}</style>`;
      const status = document.createElement("p");
      status.className = "status";
      status.setAttribute("role", "alert");
      status.textContent = `Unable to load posts. ${message}`;
      this.shadowRoot.append(status);
    }

    render(posts) {
      this.shadowRoot.innerHTML = `<style>${styles}</style>`;
      if (!posts.length) {
        const empty = document.createElement("p");
        empty.className = "status";
        empty.textContent = defaults.empty;
        this.shadowRoot.append(empty);
        return;
      }

      const list = document.createElement("ol");
      list.className = "feed";
      posts.forEach((post) => list.append(this.createPost(post)));
      this.shadowRoot.append(list);
    }

    createPost(post) {
      const item = document.createElement("li");
      const article = document.createElement("article");
      item.className = "post";
      article.className = "post-content";

      const meta = document.createElement("div");
      meta.className = "meta";
      if (post.collection) {
        const collection = document.createElement("span");
        collection.className = "collection";
        collection.textContent = post.collection;
        meta.append(collection);
      }
      if (post.date) {
        const time = document.createElement("time");
        time.dateTime = post.date;
        const parsed = new Date(`${post.date}T12:00:00`);
        time.textContent = Number.isNaN(parsed.valueOf()) ? post.date : new Intl.DateTimeFormat(this.config.locale, { year: "numeric", month: "short", day: "numeric" }).format(parsed);
        meta.append(time);
      }

      const heading = document.createElement("h2");
      const link = document.createElement("a");
      link.href = post.url || "#";
      link.textContent = post.title || "Untitled";
      if (/^https?:\/\//.test(link.href) && new URL(link.href).origin !== location.origin) link.rel = "noopener";
      heading.append(link);

      if (meta.childNodes.length) item.append(meta);
      item.append(heading);
      if (post.description) {
        const description = document.createElement("p");
        description.className = "description";
        description.textContent = post.description;
        item.append(description);
      }
      if (Array.isArray(post.tags) && post.tags.length) {
        const tags = document.createElement("div");
        tags.className = "tags";
        tags.setAttribute("aria-label", "Tags");
        post.tags.forEach((value) => {
          const tag = document.createElement("span");
          tag.className = "tag";
          tag.textContent = value;
          tags.append(tag);
        });
        item.append(tags);
      }
      return item;
    }
  }

  if (!customElements.get("notion-post-feed")) customElements.define("notion-post-feed", NotionPostFeed);

  if (currentScript?.dataset.mount) {
    const target = document.querySelector(currentScript.dataset.mount);
    if (target) target.append(document.createElement("notion-post-feed"));
  }
})();
