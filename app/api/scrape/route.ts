import {
  buildScrapeResponse,
  readRobotsTxt,
  REQUEST_HEADERS,
  scrapeRequestSchema,
} from "@/lib/scrape"
import { z } from "zod"

export async function POST(req: Request) {
  try {
    const payload = scrapeRequestSchema.parse(await req.json())
    const targetUrl = new URL(payload.url)

    if (!["http:", "https:"].includes(targetUrl.protocol)) {
      return Response.json(
        { error: "Only HTTP and HTTPS URLs are supported." },
        { status: 400 }
      )
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    try {
      const [pageResponse, robots] = await Promise.all([
        fetch(targetUrl, {
          headers: REQUEST_HEADERS,
          redirect: "follow",
          cache: "no-store",
          signal: controller.signal,
        }),
        readRobotsTxt(targetUrl),
      ])

      const contentType = pageResponse.headers.get("content-type") ?? ""
      const xRobotsTag = pageResponse.headers.get("x-robots-tag")
      const html = await pageResponse.text()

      return Response.json(
        buildScrapeResponse({
          url: payload.url,
          finalUrl: pageResponse.url,
          status: pageResponse.status,
          statusText: pageResponse.statusText,
          contentType,
          redirected: pageResponse.redirected,
          xRobotsTag,
          html,
          headers: pageResponse.headers,
          robots,
        })
      )
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "A valid URL is required."
        : error instanceof Error
          ? error.name === "AbortError"
            ? "The scrape request timed out."
            : error.message
          : "Failed to scrape the requested URL."

    return Response.json({ error: message }, { status: 500 })
  }
}
