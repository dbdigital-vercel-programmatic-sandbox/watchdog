import { generateObject } from "ai"
import { createGateway } from "@ai-sdk/gateway"
import { z } from "zod"

const rewriteSchema = z.object({
  improvedArticle: z
    .string()
    .describe("A full rewritten draft of the source article"),
  appliedRecommendations: z
    .array(z.string())
    .describe("The selected recommendations that were applied"),
  editorNotes: z
    .string()
    .describe("Short note summarizing the main editorial changes"),
})

export async function POST(req: Request) {
  const gatewayApiKey = process.env.APP_BUILDER_VERCEL_AI_GATEWAY

  if (!gatewayApiKey) {
    return Response.json(
      {
        error:
          "APP_BUILDER_VERCEL_AI_GATEWAY is not set. Add it to your environment before generating drafts.",
      },
      { status: 500 }
    )
  }

  try {
    const { sourceArticle, referenceArticle, recommendations } =
      await req.json()

    if (!sourceArticle || !referenceArticle) {
      return Response.json(
        { error: "Both source and reference articles are required" },
        { status: 400 }
      )
    }

    if (!Array.isArray(recommendations) || recommendations.length === 0) {
      return Response.json(
        { error: "Select at least one recommendation" },
        { status: 400 }
      )
    }

    const gateway = createGateway({ apiKey: gatewayApiKey })

    const result = await generateObject({
      model: gateway("openai/gpt-4.1-mini"),
      schema: rewriteSchema,
      prompt: `Rewrite the source article into a stronger full draft.

SOURCE ARTICLE:
"""
${sourceArticle}
"""

REFERENCE ARTICLE:
"""
${referenceArticle}
"""

SELECTED RECOMMENDATIONS:
${recommendations.map((item: string, index: number) => `${index + 1}. ${item}`).join("\n")}

Instructions:
- Apply only the selected recommendations.
- Return a full improved draft, not just excerpts.
- Preserve the core facts and intent unless a selected recommendation clearly requires tightening or restructuring.
- Do not invent unsupported claims, statistics, quotes, or sources.
- Keep the result publication-ready and coherent from start to finish.
- Make the rewrite meaningfully better, not just lightly rephrased.
- In editorNotes, summarize the biggest changes in 2-4 sentences.`,
    })

    return Response.json(result.object)
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to generate improved draft"

    return Response.json({ error: message }, { status: 500 })
  }
}
