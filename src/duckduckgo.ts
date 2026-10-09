export const DUCKDUCKGO_PROVIDER_ID = "duckduckgo";
const SEARCH_ENDPOINT = "https://html.duckduckgo.com/html/";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export type SearchSource = {
  url: string;
  title?: string;
  snippet?: string;
};

export type SearchRequest = {
  query: string;
  maxResults?: number;
};

export type SearchResult = {
  sources: SearchSource[];
  truncated: boolean;
};

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

function decodeEntities(value: string): string {
  // &amp; goes last so a double-encoded "&amp;lt;" decodes one level only.
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function limitSources(sources: SearchSource[], maxResults: number | undefined): SearchResult {
  if (maxResults === undefined || !Number.isInteger(maxResults) || maxResults < 1) {
    return { sources, truncated: false };
  }
  return {
    sources: sources.slice(0, maxResults),
    truncated: sources.length > maxResults,
  };
}


export function unwrapDuckDuckGoUrl(href: string): string {
  try {
    const url = new URL(href, "https://duckduckgo.com");
    const destination = url.searchParams.get("uddg");
    return destination && destination.length > 0 ? destination : url.href;
  } catch {
    return href;
  }
}

export function parseDuckDuckGoHtml(html: string): SearchSource[] {
  const sources: SearchSource[] = [];
  const seen = new Set<string>();
  const resultRe =
    /<a\b[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = resultRe.exec(html)) !== null) {
    const url = unwrapDuckDuckGoUrl(decodeEntities(match[1] ?? ""));
    if (!url.startsWith("http://") && !url.startsWith("https://")) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const title = decodeEntities(match[2] ?? "");
    const rest = html.slice(match.index + match[0].length, match.index + match[0].length + 1200);
    const snippetMatch = rest.match(
      /<a\b[^>]*class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
    );
    const snippet = snippetMatch ? decodeEntities(snippetMatch[1] ?? "") : "";
    sources.push({
      url,
      ...(title.length > 0 ? { title } : {}),
      ...(snippet.length > 0 ? { snippet } : {}),
    });
  }
  return sources;
}

export async function searchDuckDuckGo(
  request: SearchRequest,
  deps: { fetch: FetchLike; signal?: AbortSignal } = { fetch: globalThis.fetch },
): Promise<SearchResult> {
  const query = request.query.trim();
  if (query.length === 0) {
    return { sources: [], truncated: false };
  }
  const url = `${SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}`;
  const response = await deps.fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html",
    },
    ...(deps.signal !== undefined ? { signal: deps.signal } : {}),
  });
  const html = await response.text();
  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed with HTTP ${response.status}`);
  }
  if (/anomaly-modal|detected unusual traffic|captcha/i.test(html)) {
    throw new Error("DuckDuckGo blocked the search request (bot challenge)");
  }
  return limitSources(parseDuckDuckGoHtml(html), request.maxResults);
}

const BING_ENDPOINT = "https://www.bing.com/search";

// Bing wraps result links in a click-tracking redirect whose `u` parameter is
// "a1" followed by the base64url-encoded destination. Anything else is returned
// unchanged, so a format change degrades to the tracking url rather than failing.
export function unwrapBingUrl(href: string): string {
  try {
    const url = new URL(href);
    if (!url.hostname.endsWith("bing.com") || !url.pathname.startsWith("/ck/a")) return href;
    const payload = url.searchParams.get("u");
    if (payload === null || !payload.startsWith("a1")) return href;
    const destination = Buffer.from(payload.slice(2), "base64url").toString("utf8");
    return /^https?:\/\//.test(destination) ? destination : href;
  } catch {
    return href;
  }
}

export function parseBingHtml(html: string): SearchSource[] {
  const sources: SearchSource[] = [];
  const seen = new Set<string>();
  const resultRe = /<h2[^>]*>\s*<a\b[^>]*href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/gi;
  let match: RegExpExecArray | null;
  while ((match = resultRe.exec(html)) !== null) {
    const url = unwrapBingUrl(decodeEntities(match[1] ?? ""));
    if (!url.startsWith("http://") && !url.startsWith("https://")) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const title = decodeEntities(match[2] ?? "");
    const rest = html.slice(match.index + match[0].length, match.index + match[0].length + 1500);
    const snippetMatch = rest.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = snippetMatch ? decodeEntities(snippetMatch[1] ?? "") : "";
    sources.push({
      url,
      ...(title.length > 0 ? { title } : {}),
      ...(snippet.length > 0 ? { snippet } : {}),
    });
  }
  return sources;
}

export async function searchBing(
  request: SearchRequest,
  deps: { fetch: FetchLike; signal?: AbortSignal } = { fetch: globalThis.fetch },
): Promise<SearchResult> {
  const query = request.query.trim();
  if (query.length === 0) {
    return { sources: [], truncated: false };
  }
  const url = `${BING_ENDPOINT}?q=${encodeURIComponent(query)}`;
  const response = await deps.fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html",
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    },
    ...(deps.signal !== undefined ? { signal: deps.signal } : {}),
  });
  const html = await response.text();
  if (!response.ok) {
    throw new Error(`Bing search failed with HTTP ${response.status}`);
  }
  return limitSources(parseBingHtml(html), request.maxResults);
}

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
}

export async function searchFreeWeb(
  request: SearchRequest,
  deps: { fetch: FetchLike; signal?: AbortSignal } = { fetch: globalThis.fetch },
): Promise<SearchResult> {
  try {
    return await searchDuckDuckGo(request, {
      fetch: deps.fetch,
      signal: withTimeout(deps.signal, 5000),
    });
  } catch (error) {
    if (deps.signal?.aborted === true) throw error;
    return searchBing(request, {
      fetch: deps.fetch,
      signal: withTimeout(deps.signal, 5000),
    });
  }
}

