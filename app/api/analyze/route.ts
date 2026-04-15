import { generateObject } from "ai"
import { createGateway } from "@ai-sdk/gateway"
import { z } from "zod"

function safeJson(value: unknown) {
  try {
    return JSON.stringify(
      value,
      (_key, v) => {
        if (v instanceof Error) {
          return {
            name: v.name,
            message: v.message,
            stack: v.stack,
            cause: v.cause,
          }
        }

        if (typeof v === "bigint") {
          return v.toString()
        }

        return v
      },
      2
    )
  } catch {
    return String(value)
  }
}

function toErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause:
        error.cause instanceof Error
          ? {
              name: error.cause.name,
              message: error.cause.message,
              stack: error.cause.stack,
            }
          : error.cause,
    }
  }

  return {
    name: "UnknownError",
    message: typeof error === "string" ? error : "Non-Error thrown",
    value: error,
  }
}

const analysisSchema = z.object({
  strengths: z
    .array(
      z.object({
        point: z
          .string()
          .describe("Specific strength or what the article does well"),
        explanation: z
          .string()
          .describe("Detailed explanation of why this is a strength"),
        category: z.enum([
          "clarity",
          "engagement",
          "structure",
          "credibility",
          "originality",
          "other",
        ]),
      })
    )
    .describe("List of what the source article does well"),

  weaknesses: z
    .array(
      z.object({
        point: z
          .string()
          .describe("Specific weakness or what the article lacks"),
        explanation: z
          .string()
          .describe("Detailed explanation of the weakness and how to improve"),
        category: z.enum([
          "clarity",
          "engagement",
          "structure",
          "credibility",
          "completeness",
          "other",
        ]),
        severity: z.enum(["low", "medium", "high"]),
      })
    )
    .describe("List of what the source article lacks or could improve"),

  toneAnalysis: z.object({
    sourceTone: z.object({
      primaryTone: z
        .string()
        .describe(
          "The primary tone of the source article (e.g., formal, casual, persuasive, informative)"
        ),
      toneDescriptors: z
        .array(z.string())
        .describe(
          "Adjectives describing the tone (e.g., authoritative, friendly, urgent)"
        ),
      emotionalImpact: z
        .string()
        .describe("How the tone affects the reader emotionally"),
      appropriateness: z
        .string()
        .describe(
          "Assessment of whether the tone fits the content and audience"
        ),
    }),
    referenceTone: z.object({
      primaryTone: z
        .string()
        .describe("The primary tone of the reference article"),
      toneDescriptors: z
        .array(z.string())
        .describe("Adjectives describing the tone"),
      emotionalImpact: z
        .string()
        .describe("How the tone affects the reader emotionally"),
      appropriateness: z
        .string()
        .describe(
          "Assessment of whether the tone fits the content and audience"
        ),
    }),
    toneComparison: z
      .string()
      .describe(
        "Comparison of the two tones and which might be more effective"
      ),
  }),

  comparisonInsights: z.object({
    uniqueToSource: z
      .array(z.string())
      .describe("Points covered well in source but not in reference"),
    uniqueToReference: z
      .array(z.string())
      .describe("Points covered well in reference but not in source"),
    bothCoverWell: z
      .array(z.string())
      .describe("Points both articles cover effectively"),
    gaps: z
      .array(z.string())
      .describe("Important points neither article covers adequately"),
  }),

  actionableRecommendations: z
    .array(
      z.object({
        recommendation: z
          .string()
          .describe("Specific recommendation for improving the source article"),
        priority: z.enum(["low", "medium", "high"]),
        effort: z.enum(["quick", "moderate", "extensive"]),
        impact: z
          .string()
          .describe("Expected impact of implementing this recommendation"),
      })
    )
    .describe("Prioritized list of recommendations for the source article"),

  readabilityMetrics: z.object({
    source: z.object({
      estimatedReadingLevel: z
        .string()
        .describe("Estimated reading level (e.g., '8th grade', 'college')"),
      sentenceComplexity: z.enum(["simple", "moderate", "complex"]),
      vocabularyLevel: z.enum(["basic", "intermediate", "advanced"]),
      pacing: z
        .enum(["slow", "moderate", "fast"])
        .describe("Speed at which information is delivered"),
    }),
    reference: z.object({
      estimatedReadingLevel: z.string(),
      sentenceComplexity: z.enum(["simple", "moderate", "complex"]),
      vocabularyLevel: z.enum(["basic", "intermediate", "advanced"]),
      pacing: z.enum(["slow", "moderate", "fast"]),
    }),
  }),
})

export async function POST(req: Request) {
  const requestId = crypto.randomUUID()
  const gatewayApiKey = process.env.APP_BUILDER_VERCEL_AI_GATEWAY
  const envSnapshot = {
    nextPublicCdnUrl: process.env.NEXT_PUBLIC_CDN_URL ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
    vercel: process.env.VERCEL ?? null,
    hasAppBuilderGatewayKey: Boolean(process.env.APP_BUILDER_VERCEL_AI_GATEWAY),
    hasAIGatewayKey: Boolean(process.env.AI_GATEWAY_API_KEY),
  }

  console.log(
    "[api/analyze] Env snapshot\n" +
      safeJson({
        requestId,
        env: envSnapshot,
      })
  )

  try {
    if (!gatewayApiKey) {
      return Response.json(
        {
          ok: false,
          error:
            "APP_BUILDER_VERCEL_AI_GATEWAY is not set. Add it to your environment before generating scripts.",
          status: 500,
          requestId,
        },
        { status: 500 }
      )
    }

    const gateway = createGateway({
      apiKey: gatewayApiKey,
    })

    const { sourceArticle, referenceArticle } = await req.json()

    if (!sourceArticle || !referenceArticle) {
      return Response.json(
        { error: "Both source and reference articles are required" },
        { status: 400 }
      )
    }

    const result = await generateObject({
      model: gateway("anthropic/claude-sonnet-4.5"),
      schema: analysisSchema,
      prompt: `Analyze and compare these two articles comprehensively.

SOURCE ARTICLE:
"""
${sourceArticle}
"""

REFERENCE ARTICLE:
"""
${referenceArticle}
"""

Provide a detailed analysis covering:
1. What the source article does well (strengths)
2. What the source article lacks or could improve (weaknesses)
3. Tone analysis for both articles with comparison
4. Comparison insights showing unique points and gaps
5. Actionable, prioritized recommendations for improving the source
6. Readability metrics for both articles

Be specific, constructive, and provide concrete examples from the text where possible.`,
    })

    return Response.json(result.object)
  } catch (error) {
    const details = toErrorDetails(error)

    const payload = {
      requestId,
      error: details,
      context: {
        model: "anthropic/claude-sonnet-4.5",
        env: envSnapshot,
      },
    }

    console.error("[api/analyze] Analysis failed\n" + safeJson(payload))

    const isDev = process.env.NODE_ENV !== "production"

    return Response.json(
      {
        error: "Failed to analyze articles",
        requestId,
        ...(isDev
          ? {
              debug: {
                message: details.message,
                name: details.name,
                cause:
                  typeof details.cause === "object"
                    ? details.cause
                    : String(details.cause ?? ""),
              },
            }
          : {}),
      },
      { status: 500 }
    )
  }
}
