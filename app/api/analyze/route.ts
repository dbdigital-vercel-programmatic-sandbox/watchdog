import { generateObject } from "ai"
import { createGateway } from "@ai-sdk/gateway"
import { z } from "zod"

type UsageMetrics = {
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  costUsd: number | null
  durationMs: number
  generationId: string | null
  model: string
}

function toNumberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function getNestedValue(record: Record<string, unknown>, path: string[]) {
  let current: unknown = record

  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return undefined
    }

    current = (current as Record<string, unknown>)[key]
  }

  return current
}

function extractGenerationId(result: Record<string, unknown>) {
  const candidates = [
    result.generationId,
    getNestedValue(result, ["response", "body", "generationId"]),
    getNestedValue(result, ["providerMetadata", "gateway", "generationId"]),
    getNestedValue(result, ["providerMetadata", "vercel", "generationId"]),
  ]

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.startsWith("gen_")) {
      return candidate
    }
  }

  const headers = getNestedValue(result, ["response", "headers"])

  if (headers && typeof headers === "object") {
    for (const value of Object.values(headers as Record<string, unknown>)) {
      if (typeof value === "string" && value.startsWith("gen_")) {
        return value
      }
    }
  }

  return null
}

function extractCostUsd(result: Record<string, unknown>) {
  const candidates = [
    result.totalCost,
    result.cost,
    getNestedValue(result, ["response", "body", "totalCost"]),
    getNestedValue(result, ["response", "body", "total_cost"]),
    getNestedValue(result, ["providerMetadata", "gateway", "totalCost"]),
    getNestedValue(result, ["providerMetadata", "gateway", "cost"]),
    getNestedValue(result, ["providerMetadata", "vercel", "totalCost"]),
    getNestedValue(result, ["providerMetadata", "vercel", "cost"]),
  ]

  for (const candidate of candidates) {
    const value = toNumberOrNull(candidate)

    if (value !== null) {
      return value
    }
  }

  return null
}

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
  factualDifferences: z
    .array(
      z.object({
        summary: z
          .string()
          .describe(
            "Short description of the factual or informational difference"
          ),
        type: z.enum(["missing_in_source", "mismatch"]),
        kind: z.enum([
          "stat",
          "figure",
          "date",
          "name",
          "claim",
          "quote",
          "other",
        ]),
        sourceText: z
          .string()
          .nullable()
          .describe(
            "Exact or near-exact source detail involved in the difference"
          ),
        referenceText: z
          .string()
          .nullable()
          .describe(
            "Exact or near-exact reference detail involved in the difference"
          ),
        impact: z
          .string()
          .describe("Why this factual difference matters to the article"),
      })
    )
    .describe(
      "Reference-backed factual, statistical, date, figure, and information differences missing from or conflicting with the source"
    ),

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
})

export async function POST(req: Request) {
  const requestId = crypto.randomUUID()
  const startedAt = performance.now()
  const gatewayApiKey = process.env.APP_BUILDER_VERCEL_AI_GATEWAY
  const modelId = "openai/gpt-4.1-mini"
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
      model: gateway(modelId),
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
1. Factual differences between the source and reference articles
2. Tone analysis for both articles with comparison
3. Comparison insights showing unique points and gaps
4. Actionable, prioritized recommendations for improving the source

For factualDifferences:
- Focus on facts, figures, dates, names, counts, claims, quotes, and concrete informational differences.
- Set kind to the best matching value for each factual difference.
- Include only information that is present in the reference article and either missing from the source or conflicts with the source.
- Do not include source-only details, source strengths, or anything that is merely good writing in the source.
- Prefer high-value differences that would materially improve accuracy or completeness.
- Use sourceText and referenceText whenever possible.

Be specific, constructive, and provide concrete examples from the text where possible.`,
    })

    const rawResult = result as unknown as Record<string, unknown>
    const generationId = extractGenerationId(rawResult)
    let costUsd = extractCostUsd(rawResult)

    if (costUsd === null && generationId) {
      try {
        const generationInfo = await gateway.getGenerationInfo({
          id: generationId,
        })
        costUsd = generationInfo.totalCost
      } catch (costError) {
        console.warn(
          "[api/analyze] Failed to fetch generation cost\n" +
            safeJson({
              requestId,
              generationId,
              error: toErrorDetails(costError),
            })
        )
      }
    }

    const metrics: UsageMetrics = {
      inputTokens: result.usage.inputTokens ?? null,
      outputTokens: result.usage.outputTokens ?? null,
      totalTokens: result.usage.totalTokens ?? null,
      costUsd,
      durationMs: Math.round(performance.now() - startedAt),
      generationId,
      model: modelId,
    }

    console.log(
      "[api/analyze] Usage summary\n" +
        safeJson({
          requestId,
          metrics,
        })
    )

    return Response.json({
      analysis: result.object,
      metrics,
      requestId,
    })
  } catch (error) {
    const details = toErrorDetails(error)

    const payload = {
      requestId,
      error: details,
      context: {
        model: modelId,
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
