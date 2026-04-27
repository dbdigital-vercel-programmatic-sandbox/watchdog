import { generateObject } from "ai"
import { createGateway } from "@ai-sdk/gateway"
import { z } from "zod"

const patchSchema = z.object({
  changes: z
    .array(
      z.object({
        recommendation: z
          .string()
          .describe("The recommendation this change addresses"),
        operation: z
          .enum(["insert", "delete", "replace"])
          .describe("Whether the review block adds, removes, or corrects text"),
        targetText: z
          .string()
          .describe(
            "An exact excerpt copied verbatim from the base article that anchors the change"
          ),
        placement: z
          .enum(["before", "after"])
          .nullable()
          .describe(
            "For insert operations only, whether new text belongs before or after targetText"
          ),
        insertedText: z
          .string()
          .nullable()
          .describe("The exact text to add for insert or replace operations"),
        referenceEvidence: z
          .string()
          .nullable()
          .describe(
            "An exact excerpt copied verbatim from the reference article that supports this change"
          ),
        isQuote: z
          .boolean()
          .describe(
            "Whether this change is quote-based and therefore allowed to preserve exact wording"
          ),
        rationale: z
          .string()
          .describe(
            "Why this change improves accuracy, concision, or completeness"
          ),
      })
    )
    .describe("Reviewable patch suggestions for the article"),
  appliedRecommendations: z
    .array(z.string())
    .describe("The selected recommendations that produced these suggestions"),
  editorNotes: z
    .string()
    .describe("Short note summarizing the main patch suggestions"),
})

export async function POST(req: Request) {
  const gatewayApiKey = process.env.APP_BUILDER_VERCEL_AI_GATEWAY

  if (!gatewayApiKey) {
    return Response.json(
      {
        error:
          "APP_BUILDER_VERCEL_AI_GATEWAY is not set. Add it to your environment before generating patch suggestions.",
      },
      { status: 500 }
    )
  }

  try {
    const { baseArticle, referenceArticle, recommendations } = await req.json()

    if (!baseArticle || !referenceArticle) {
      return Response.json(
        { error: "Both base and reference articles are required" },
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
      model: gateway("openai/gpt-5.4-mini"),
      schema: patchSchema,
      prompt: `Create reviewable patch suggestions for the base article.

BASE ARTICLE:
"""
${baseArticle}
"""

REFERENCE ARTICLE:
"""
${referenceArticle}
"""

SELECTED RECOMMENDATIONS:
${recommendations.map((item: string, index: number) => `${index + 1}. ${item}`).join("\n")}

Instructions:
- Return only structured patch suggestions, never a full rewrite.
- Supported operations are insert, delete, and replace.
- targetText must always be copied verbatim from the base article.
- Use insert when the source is missing important information that should be added near targetText.
- Use delete only when removing text is necessary as part of correcting a factual mismatch or quote issue. Do not generate delete suggestions for source-only material that is merely absent from the reference.
- Use replace when the source contains a mismatched or outdated fact, date, figure, quote, claim, or other detail that should be corrected. Replace should visually read as deleting the old text and adding the corrected text.
- For insert and replace operations, insertedText must contain the exact new text to add.
- For delete operations, insertedText must be null.
- referenceEvidence must be an exact supporting excerpt from the reference article for every insert or replace suggestion. For delete suggestions that are only about concision or redundancy, referenceEvidence may be null.
- Set isQuote to true only when the change is based on a direct quote that should remain exact.
- For insert operations, placement must be before or after targetText. For delete and replace operations, placement must be null.
- Audit the reference article carefully for facts, statistics, dates, names, claims, and figures that are missing from the base article. When they are important and can be added safely, they should almost always become insert suggestions.
- If a figure, date, fact, or other detail in the base article conflicts with the reference article, prefer a replace suggestion rather than a separate insert.
- Be aggressive about surfacing factual gaps: if the reference contains concrete numbers, dates, or named facts that materially strengthen the article and the source lacks them, include them.
- Be exhaustive within reason for high-value factual details rather than returning only one or two examples.
- Do not copy-paste full reference sentences into insertedText unless the content is a direct quote that must remain exact.
- For non-quote additions and corrections, rewrite the information in fresh wording while preserving the meaning and the facts.
- If the referenceEvidence is a quote, keep the quote text exact in insertedText and treat it as a quote.
- Do not invent unsupported claims, statistics, quotes, dates, or sources.
- Omit any suggestion that cannot be anchored safely to exact text in the base article.
- In editorNotes, summarize the most important factual additions, corrections, and concision improvements in 2-4 sentences.`,
    })

    return Response.json(result.object)
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to generate patch suggestions"

    return Response.json({ error: message }, { status: 500 })
  }
}
