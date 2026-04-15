import { generateObject } from "ai"
import { createGateway } from "@ai-sdk/gateway"
import { z } from "zod"

const headlineSchema = z.object({
  headlines: z
    .array(
      z.object({
        tone: z.enum([
          "sensational and click-baity",
          "factual and straight to the point",
          "authoritative and expert-led",
        ]),
        headline: z.string().describe("The suggested headline"),
        rationale: z
          .string()
          .describe("A short explanation of why the headline fits the tone"),
      })
    )
    .length(3),
})

export async function POST(req: Request) {
  const gatewayApiKey = process.env.APP_BUILDER_VERCEL_AI_GATEWAY

  if (!gatewayApiKey) {
    return Response.json(
      {
        error:
          "APP_BUILDER_VERCEL_AI_GATEWAY is not set. Add it to your environment before generating headlines.",
      },
      { status: 500 }
    )
  }

  try {
    const { article } = await req.json()

    if (!article) {
      return Response.json(
        { error: "Article text is required" },
        { status: 400 }
      )
    }

    const gateway = createGateway({ apiKey: gatewayApiKey })

    const result = await generateObject({
      model: gateway("openai/gpt-4.1-mini"),
      schema: headlineSchema,
      prompt: `Generate exactly three distinct headline suggestions for the article below.

ARTICLE:
"""
${article}
"""

You must return exactly one headline for each of these tones:
1. sensational and click-baity
2. factual and straight to the point
3. authoritative and expert-led

Instructions:
- Keep each headline compelling and publication-ready.
- Match the actual article content closely.
- Do not invent claims that are not supported by the article.
- Make the tonal differences obvious.
- Include a one-sentence rationale for each headline.`,
    })

    return Response.json(result.object)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate headlines"

    return Response.json({ error: message }, { status: 500 })
  }
}
