import { z } from "zod"

export const scrapeRequestSchema = z.object({
  url: z.string().url(),
})

export const REQUEST_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
  pragma: "no-cache",
} satisfies HeadersInit

export type RobotsResult = {
  fetched: boolean
  allowed: boolean | null
  disallowRule: string | null
}

export type DiagnosticCategory =
  | "accessible"
  | "http_block"
  | "rate_limited"
  | "anti_bot_challenge"
  | "javascript_required"
  | "paywall_or_login"
  | "non_html_response"
  | "parser_failure"
  | "server_error"

export type DiagnosticSignal = {
  type: DiagnosticCategory
  message: string
}

export type ProtectionVendor =
  | "cloudflare"
  | "akamai"
  | "datadome"
  | "imperva"
  | "fastly"
  | "human-security"

export type ArticleMediaItem = {
  type: "image" | "video" | "embed"
  url: string
  alt: string | null
  caption: string | null
  poster: string | null
}

export function normalizeWhitespace(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim()
}

function stripTags(value: string) {
  return normalizeWhitespace(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
}

export function cleanText(value: string) {
  return normalizeWhitespace(decodeHtmlEntities(stripTags(value)))
}

export function extractMetaContent(html: string, name: string) {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([\\s\\S]*?)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([\\s\\S]*?)["'][^>]+(?:name|property)=["']${name}["'][^>]*>`,
      "i"
    ),
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)

    if (match?.[1]) {
      return cleanText(match[1])
    }
  }

  return null
}

function removeBoilerplate(html: string) {
  return html
    .replace(/<(header|footer|nav|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(
      /<div\b[^>]*(cookie|newsletter|subscribe|advert|promo|related|share)[^>]*>[\s\S]*?<\/div>/gi,
      " "
    )
}

function extractCandidateRoot(html: string) {
  const articleMatch = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)

  if (articleMatch?.[1]) {
    return articleMatch[1]
  }

  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)

  if (mainMatch?.[1]) {
    return mainMatch[1]
  }

  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)

  if (bodyMatch?.[1]) {
    return bodyMatch[1]
  }

  return html
}

function extractAttribute(tag: string, attribute: string) {
  const patterns = [
    new RegExp(`${attribute}=["']([^"']+)["']`, "i"),
    new RegExp(`${attribute}=([^\s>]+)`, "i"),
  ]

  for (const pattern of patterns) {
    const match = tag.match(pattern)

    if (match?.[1]) {
      return decodeHtmlEntities(match[1].trim())
    }
  }

  return null
}

function toAbsoluteUrl(url: string | null, baseUrl: string) {
  if (!url) {
    return null
  }

  try {
    return new URL(url, baseUrl).toString()
  } catch {
    return null
  }
}

function pushUniqueMediaItem(
  collection: ArticleMediaItem[],
  item: ArticleMediaItem | null
) {
  if (!item) {
    return
  }

  const alreadySeen = collection.some(
    (existing) => existing.type === item.type && existing.url === item.url
  )

  if (!alreadySeen) {
    collection.push(item)
  }
}

function extractMediaFromTag(
  tag: string,
  baseUrl: string,
  caption: string | null = null
): ArticleMediaItem | null {
  const normalizedCaption = caption ? cleanText(caption) || null : null

  if (/^<img\b/i.test(tag)) {
    const url =
      toAbsoluteUrl(extractAttribute(tag, "src"), baseUrl) ??
      toAbsoluteUrl(extractAttribute(tag, "data-src"), baseUrl)

    if (!url) {
      return null
    }

    return {
      type: "image",
      url,
      alt: extractAttribute(tag, "alt"),
      caption: normalizedCaption,
      poster: null,
    }
  }

  if (/^<video\b/i.test(tag)) {
    const directUrl = toAbsoluteUrl(extractAttribute(tag, "src"), baseUrl)
    const sourceUrl = toAbsoluteUrl(
      tag.match(/<source\b[^>]*src=["']([^"']+)["'][^>]*>/i)?.[1] ?? null,
      baseUrl
    )
    const url = directUrl ?? sourceUrl

    if (!url) {
      return null
    }

    return {
      type: "video",
      url,
      alt: null,
      caption: normalizedCaption,
      poster: toAbsoluteUrl(extractAttribute(tag, "poster"), baseUrl),
    }
  }

  if (/^<iframe\b/i.test(tag)) {
    const url = toAbsoluteUrl(extractAttribute(tag, "src"), baseUrl)

    if (!url) {
      return null
    }

    return {
      type: "embed",
      url,
      alt: extractAttribute(tag, "title"),
      caption: normalizedCaption,
      poster: null,
    }
  }

  return null
}

function extractParagraphs(html: string) {
  const paragraphMatches = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]

  return paragraphMatches
    .map((match) => cleanText(match[1] ?? ""))
    .filter((paragraph) => paragraph.length >= 40)
}

export function extractArticleBody(html: string) {
  const cleanedRoot = removeBoilerplate(extractCandidateRoot(html))
  const paragraphs = extractParagraphs(cleanedRoot)

  if (paragraphs.length >= 3) {
    return paragraphs.join("\n\n")
  }

  const fallbackText = cleanText(cleanedRoot)

  if (fallbackText.length >= 200) {
    return fallbackText
  }

  return null
}

export function extractArticleMedia(html: string, baseUrl: string) {
  const cleanedRoot = removeBoilerplate(extractCandidateRoot(html))
  const media: ArticleMediaItem[] = []
  const consumedUrls = new Set<string>()
  const figureMatches = [
    ...cleanedRoot.matchAll(/<figure\b[^>]*>([\s\S]*?)<\/figure>/gi),
  ]

  for (const match of figureMatches) {
    const figureHtml = match[1] ?? ""
    const caption =
      figureHtml.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1] ??
      null
    const mediaTag =
      figureHtml.match(/<img\b[^>]*>/i)?.[0] ??
      figureHtml.match(/<video\b[^>]*>[\s\S]*?<\/video>/i)?.[0] ??
      figureHtml.match(/<iframe\b[^>]*><\/iframe>/i)?.[0] ??
      figureHtml.match(/<iframe\b[^>]*>/i)?.[0] ??
      null

    const item = mediaTag
      ? extractMediaFromTag(mediaTag, baseUrl, caption)
      : null

    if (item) {
      consumedUrls.add(item.url)
      pushUniqueMediaItem(media, item)
    }
  }

  const standaloneTags = [
    ...cleanedRoot.matchAll(/<img\b[^>]*>/gi),
    ...cleanedRoot.matchAll(/<video\b[^>]*>[\s\S]*?<\/video>/gi),
    ...cleanedRoot.matchAll(/<iframe\b[^>]*>(?:<\/iframe>)?/gi),
  ]

  for (const match of standaloneTags) {
    const item = extractMediaFromTag(match[0], baseUrl)

    if (!item || consumedUrls.has(item.url)) {
      continue
    }

    consumedUrls.add(item.url)
    pushUniqueMediaItem(media, item)
  }

  return media
}

export function getInterestingHeaders(headers: Headers) {
  const headerNames = [
    "server",
    "cf-ray",
    "cf-cache-status",
    "x-powered-by",
    "x-cache",
    "x-served-by",
    "x-akamai-session-info",
    "akamai-grn",
    "x-datadome",
    "permissions-policy",
    "content-security-policy",
    "set-cookie",
  ]

  return Object.fromEntries(
    headerNames
      .map((name) => [name, headers.get(name)])
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
  )
}

export function detectProtectionVendors(html: string, headers: Headers) {
  const haystack = `${html.toLowerCase()} ${JSON.stringify(getInterestingHeaders(headers)).toLowerCase()}`
  const vendors: ProtectionVendor[] = []
  const patterns: Array<[ProtectionVendor, RegExp]> = [
    ["cloudflare", /cloudflare|cf-ray|cf-chl|cf-browser-verification/],
    ["akamai", /akamai|akamai-grn|akamaighost/],
    ["datadome", /datadome|x-datadome/],
    ["imperva", /imperva|incapsula|_incap_/],
    ["fastly", /fastly|x-served-by/],
    ["human-security", /perimeterx|human security|px-captcha|px3/],
  ]

  for (const [vendor, pattern] of patterns) {
    if (pattern.test(haystack)) {
      vendors.push(vendor)
    }
  }

  return vendors
}

function looksLikeJavaScriptShell(html: string, articleBody: string | null) {
  const scriptCount = [...html.matchAll(/<script\b/gi)].length
  const paragraphCount = [...html.matchAll(/<p\b/gi)].length
  const text = cleanText(html).toLowerCase()

  return (
    articleBody === null &&
    scriptCount >= 10 &&
    paragraphCount <= 2 &&
    !/access denied|captcha|subscribe|sign in/.test(text)
  )
}

export function buildHtmlSnippet(html: string) {
  const compact = normalizeWhitespace(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
  )

  return compact.slice(0, 1200)
}

export function detectBlockingSignals(
  html: string,
  status: number,
  articleBody: string | null
) {
  const text = cleanText(html).toLowerCase()
  const signals: DiagnosticSignal[] = []

  if ([401, 403].includes(status)) {
    signals.push({
      type: "http_block",
      message:
        "The site rejected the request with an authorization or forbidden response.",
    })
  }

  if (status === 429) {
    signals.push({
      type: "rate_limited",
      message: "The site appears to be rate limiting requests.",
    })
  }

  if (status >= 500) {
    signals.push({
      type: "server_error",
      message: "The site returned a server-side failure response.",
    })
  }

  const heuristics: Array<[RegExp, DiagnosticCategory, string]> = [
    [
      /captcha|verify you are human|human verification/,
      "anti_bot_challenge",
      "The page looks like a CAPTCHA or human-verification challenge.",
    ],
    [
      /cloudflare|cf-browser-verification|cf-chl/,
      "anti_bot_challenge",
      "The page looks protected by Cloudflare or a similar anti-bot challenge.",
    ],
    [
      /enable javascript|javascript required|please turn javascript on/,
      "javascript_required",
      "The site appears to require client-side JavaScript before showing article content.",
    ],
    [
      /access denied|request blocked|bot detected|forbidden/,
      "http_block",
      "The page content suggests the request was blocked.",
    ],
    [
      /subscribe to continue|sign in to continue|login required|purchase a subscription/,
      "paywall_or_login",
      "The site appears to gate the article behind login or subscription access.",
    ],
  ]

  for (const [pattern, type, message] of heuristics) {
    if (pattern.test(text)) {
      signals.push({ type, message })
    }
  }

  if (looksLikeJavaScriptShell(html, articleBody)) {
    signals.push({
      type: "javascript_required",
      message:
        "The page looks like a JavaScript-rendered shell, so the article body may only appear in a real browser.",
    })
  }

  return signals.filter(
    (signal, index, allSignals) =>
      allSignals.findIndex(
        (candidate) =>
          candidate.type === signal.type && candidate.message === signal.message
      ) === index
  )
}

export function summarizeLikelyCause(
  blocked: boolean,
  signals: DiagnosticSignal[],
  vendors: ProtectionVendor[],
  contentType: string,
  articleBody: string | null
) {
  if (!blocked) {
    return "accessible"
  }

  if (!contentType.toLowerCase().includes("text/html")) {
    return "non_html_response"
  }

  if (signals.some((signal) => signal.type === "rate_limited")) {
    return "rate_limited"
  }

  if (
    vendors.length > 0 ||
    signals.some((signal) => signal.type === "anti_bot_challenge")
  ) {
    return "anti_bot_challenge"
  }

  if (signals.some((signal) => signal.type === "javascript_required")) {
    return "javascript_required"
  }

  if (signals.some((signal) => signal.type === "paywall_or_login")) {
    return "paywall_or_login"
  }

  if (signals.some((signal) => signal.type === "http_block")) {
    return "http_block"
  }

  if (signals.some((signal) => signal.type === "server_error")) {
    return "server_error"
  }

  if (articleBody === null) {
    return "parser_failure"
  }

  return "http_block"
}

function pathMatchesRule(pathname: string, rule: string) {
  if (!rule) {
    return false
  }

  if (rule === "/") {
    return true
  }

  return pathname.startsWith(rule)
}

export async function readRobotsTxt(targetUrl: URL): Promise<RobotsResult> {
  const robotsUrl = new URL("/robots.txt", targetUrl)

  try {
    const response = await fetch(robotsUrl, {
      headers: REQUEST_HEADERS,
      redirect: "follow",
      cache: "no-store",
    })

    if (!response.ok) {
      return {
        fetched: false,
        allowed: null,
        disallowRule: null,
      }
    }

    const contentType = response.headers.get("content-type") ?? ""

    if (!contentType.toLowerCase().includes("text/plain")) {
      return {
        fetched: false,
        allowed: null,
        disallowRule: null,
      }
    }

    const body = await response.text()
    const lines = body.split(/\r?\n/)
    let appliesToUs = false
    const disallowRules: string[] = []

    for (const rawLine of lines) {
      const line = rawLine.replace(/#.*$/, "").trim()

      if (!line) continue

      const [directive, ...rest] = line.split(":")

      if (!directive || rest.length === 0) continue

      const value = rest.join(":").trim()
      const normalizedDirective = directive.trim().toLowerCase()

      if (normalizedDirective === "user-agent") {
        appliesToUs = value === "*"
      }

      if (appliesToUs && normalizedDirective === "disallow" && value) {
        disallowRules.push(value)
      }
    }

    const matchingRule = disallowRules.find((rule) =>
      pathMatchesRule(targetUrl.pathname, rule)
    )

    return {
      fetched: true,
      allowed: matchingRule ? false : true,
      disallowRule: matchingRule ?? null,
    }
  } catch {
    return {
      fetched: false,
      allowed: null,
      disallowRule: null,
    }
  }
}

export function buildScrapeResponse(args: {
  url: string
  finalUrl: string
  status: number
  statusText: string
  contentType: string
  redirected: boolean
  xRobotsTag: string | null
  html: string
  headers: Headers
  robots: RobotsResult
}) {
  const articleMedia = extractArticleMedia(args.html, args.finalUrl)
  const articleBody =
    args.status >= 200 &&
    args.status < 300 &&
    args.contentType.toLowerCase().includes("text/html")
      ? extractArticleBody(args.html)
      : null
  const diagnosticSignals = detectBlockingSignals(
    args.html,
    args.status,
    articleBody
  )
  const protectionVendors = detectProtectionVendors(args.html, args.headers)
  const interestingHeaders = getInterestingHeaders(args.headers)
  const blocked =
    !(args.status >= 200 && args.status < 300) ||
    !args.contentType.toLowerCase().includes("text/html") ||
    diagnosticSignals.length > 0 ||
    articleBody === null
  const likelyCause = summarizeLikelyCause(
    blocked,
    diagnosticSignals,
    protectionVendors,
    args.contentType,
    articleBody
  )

  return {
    url: args.url,
    finalUrl: args.finalUrl,
    blocked,
    likelyCause,
    protectionVendors,
    reasons: blocked
      ? [
          ...diagnosticSignals.map((signal) => signal.message),
          ...(!args.contentType.toLowerCase().includes("text/html")
            ? [
                `The response content type was ${args.contentType || "unknown"}, not a normal HTML article page.`,
              ]
            : []),
          ...(articleBody === null && args.status >= 200 && args.status < 300
            ? [
                "The page loaded, but a readable article body could not be extracted with the current parser.",
              ]
            : []),
        ]
      : [],
    response: {
      ok: args.status >= 200 && args.status < 300,
      status: args.status,
      statusText: args.statusText,
      contentType: args.contentType,
      redirected: args.redirected,
      xRobotsTag: args.xRobotsTag,
      interestingHeaders,
    },
    robots: args.robots,
    diagnostics: {
      signals: diagnosticSignals,
      htmlSnippet: buildHtmlSnippet(args.html),
      textLength: cleanText(args.html).length,
      articleDetected: articleBody !== null,
    },
    article: articleBody
      ? {
          title:
            (extractMetaContent(args.html, "og:title") ??
              extractMetaContent(args.html, "twitter:title") ??
              cleanText(
                args.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""
              )) ||
            null,
          description:
            extractMetaContent(args.html, "description") ??
            extractMetaContent(args.html, "og:description") ??
            null,
          body: articleBody,
          media: articleMedia,
        }
      : null,
  }
}
