"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Lightbulb,
  BookOpen,
  Sparkles,
  Loader2,
  WandSparkles,
  Newspaper,
  FileText,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

interface AnalysisResult {
  strengths: Array<{
    point: string
    explanation: string
    category: string
  }>
  weaknesses: Array<{
    point: string
    explanation: string
    category: string
    severity: string
  }>
  toneAnalysis: {
    sourceTone: {
      primaryTone: string
      toneDescriptors: string[]
      emotionalImpact: string
      appropriateness: string
    }
    referenceTone: {
      primaryTone: string
      toneDescriptors: string[]
      emotionalImpact: string
      appropriateness: string
    }
    toneComparison: string
  }
  comparisonInsights: {
    uniqueToSource: string[]
    uniqueToReference: string[]
    bothCoverWell: string[]
    gaps: string[]
  }
  actionableRecommendations: Array<{
    recommendation: string
    priority: string
    effort: string
    impact: string
  }>
}

interface UsageMetrics {
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  costUsd: number | null
  durationMs: number
  generationId: string | null
  model: string
}

interface DraftVersion {
  id: string
  content: string
  editorNotes: string
  appliedRecommendations: string[]
  createdAt: string
}

interface HeadlineSuggestion {
  tone: string
  headline: string
  rationale: string
}

const DRAFT_STORAGE_PREFIX = "article-comparison-drafts"

function hashText(value: string) {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }

  return hash.toString(36)
}

function getDraftStorageKey(sourceArticle: string, referenceArticle: string) {
  return `${DRAFT_STORAGE_PREFIX}:${hashText(sourceArticle)}:${hashText(referenceArticle)}`
}

export default function ArticleComparison() {
  const [sourceArticle, setSourceArticle] = useState("")
  const [referenceArticle, setReferenceArticle] = useState("")
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [usageMetrics, setUsageMetrics] = useState<UsageMetrics | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openSection, setOpenSection] = useState("articles")
  const [selectedRecommendations, setSelectedRecommendations] = useState<
    number[]
  >([])
  const [drafts, setDrafts] = useState<DraftVersion[]>([])
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [headlineSuggestions, setHeadlineSuggestions] = useState<
    HeadlineSuggestion[]
  >([])
  const [isGeneratingHeadlines, setIsGeneratingHeadlines] = useState(false)
  const [headlineError, setHeadlineError] = useState<string | null>(null)

  const draftStorageKey = useMemo(
    () =>
      sourceArticle.trim() && referenceArticle.trim()
        ? getDraftStorageKey(sourceArticle, referenceArticle)
        : null,
    [sourceArticle, referenceArticle]
  )

  const activeDraftIndex = drafts.findIndex(
    (draft) => draft.id === activeDraftId
  )
  const activeDraft = activeDraftIndex >= 0 ? drafts[activeDraftIndex] : null
  const activeArticle = activeDraft?.content ?? sourceArticle
  const activeArticleLabel = activeDraft
    ? `Draft ${activeDraftIndex + 1}`
    : "Source Article"

  useEffect(() => {
    if (!draftStorageKey) {
      setDrafts([])
      setActiveDraftId(null)
      return
    }

    const storedDrafts = window.localStorage.getItem(draftStorageKey)

    if (!storedDrafts) {
      setDrafts([])
      setActiveDraftId(null)
      return
    }

    try {
      const parsedDrafts = JSON.parse(storedDrafts) as DraftVersion[]

      if (!Array.isArray(parsedDrafts)) {
        setDrafts([])
        setActiveDraftId(null)
        return
      }

      setDrafts(parsedDrafts)
      setActiveDraftId(parsedDrafts.at(-1)?.id ?? null)
    } catch {
      setDrafts([])
      setActiveDraftId(null)
    }
  }, [draftStorageKey])

  useEffect(() => {
    if (!draftStorageKey) {
      return
    }

    if (drafts.length === 0) {
      window.localStorage.removeItem(draftStorageKey)
      return
    }

    window.localStorage.setItem(draftStorageKey, JSON.stringify(drafts))
  }, [drafts, draftStorageKey])

  useEffect(() => {
    setHeadlineSuggestions([])
    setHeadlineError(null)
  }, [activeDraftId, sourceArticle])

  const toggleRecommendation = (index: number, checked: boolean) => {
    setSelectedRecommendations((current) => {
      if (checked) {
        return current.includes(index) ? current : [...current, index]
      }

      return current.filter((item) => item !== index)
    })
  }

  const cycleDraft = (direction: "previous" | "next") => {
    if (drafts.length === 0) {
      return
    }

    const currentIndex =
      activeDraftIndex >= 0 ? activeDraftIndex : drafts.length - 1
    const nextIndex =
      direction === "previous"
        ? (currentIndex - 1 + drafts.length) % drafts.length
        : (currentIndex + 1) % drafts.length

    setActiveDraftId(drafts[nextIndex]?.id ?? null)
  }

  const handleAnalyze = async () => {
    if (!sourceArticle.trim() || !referenceArticle.trim()) {
      setError("Please enter both source and reference articles")
      return
    }

    setIsAnalyzing(true)
    setAnalysis(null)
    setError(null)
    setUsageMetrics(null)
    setSelectedRecommendations([])
    setDraftError(null)
    setHeadlineSuggestions([])
    setHeadlineError(null)

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceArticle, referenceArticle }),
      })

      const payload = await response.json()

      if (!response.ok) {
        const debugMessage = payload?.debug?.message
          ? ` (${payload.debug.message})`
          : ""
        const requestId = payload?.requestId
          ? ` [requestId: ${payload.requestId}]`
          : ""
        throw new Error(
          `${payload?.error ?? "Failed to analyze articles"}${debugMessage}${requestId}`
        )
      }

      setAnalysis(payload.analysis)
      setUsageMetrics(payload.metrics)
      setSelectedRecommendations([])
      setOpenSection("")
    } catch (err) {
      setAnalysis(null)
      setError(
        err instanceof Error
          ? err.message
          : "An error occurred while analyzing the articles. Please try again."
      )
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleGenerateDraft = async () => {
    if (!analysis) {
      return
    }

    const selectedItems = [...selectedRecommendations]
      .sort((left, right) => left - right)
      .map((index) => analysis.actionableRecommendations[index]?.recommendation)
      .filter((item): item is string => Boolean(item))

    if (selectedItems.length === 0) {
      setDraftError("Select at least one recommendation")
      return
    }

    setIsGeneratingDraft(true)
    setDraftError(null)

    try {
      const response = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceArticle,
          referenceArticle,
          recommendations: selectedItems,
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to generate improved draft")
      }

      const nextDraft: DraftVersion = {
        id: crypto.randomUUID(),
        content: payload.improvedArticle,
        editorNotes: payload.editorNotes,
        appliedRecommendations: payload.appliedRecommendations,
        createdAt: new Date().toISOString(),
      }

      setDrafts((current) => [...current, nextDraft])
      setActiveDraftId(nextDraft.id)
    } catch (err) {
      setDraftError(
        err instanceof Error
          ? err.message
          : "An error occurred while generating the improved draft."
      )
    } finally {
      setIsGeneratingDraft(false)
    }
  }

  const handleGenerateHeadlines = async () => {
    if (!activeArticle.trim()) {
      setHeadlineError("Enter a source article or create a draft first")
      return
    }

    setIsGeneratingHeadlines(true)
    setHeadlineSuggestions([])
    setHeadlineError(null)

    try {
      const response = await fetch("/api/headlines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ article: activeArticle }),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to generate headlines")
      }

      setHeadlineSuggestions(payload.headlines)
    } catch (err) {
      setHeadlineError(
        err instanceof Error
          ? err.message
          : "An error occurred while generating headlines."
      )
    } finally {
      setIsGeneratingHeadlines(false)
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high":
        return "bg-red-500"
      case "medium":
        return "bg-yellow-500"
      case "low":
        return "bg-blue-500"
      default:
        return "bg-gray-500"
    }
  }

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "high":
        return <Badge variant="destructive">High Priority</Badge>
      case "medium":
        return <Badge variant="default">Medium Priority</Badge>
      case "low":
        return <Badge variant="secondary">Low Priority</Badge>
      default:
        return null
    }
  }

  const formatNumber = (value: number | null) => {
    if (value === null) {
      return "-"
    }

    return new Intl.NumberFormat().format(value)
  }

  const formatCost = (value: number | null) => {
    if (value === null) {
      return "-"
    }

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: value < 0.01 ? 4 : 2,
      maximumFractionDigits: value < 0.01 ? 4 : 2,
    }).format(value)
  }

  const formatDuration = (value: number) => {
    if (value < 1000) {
      return `${value} ms`
    }

    return `${(value / 1000).toFixed(2)} s`
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Article Comparison Tool
          </h1>
          <p className="text-muted-foreground">
            Compare your source article against a reference to get AI-powered
            insights on strengths, weaknesses, tone, and recommendations.
          </p>
        </div>

        <Accordion
          type="single"
          collapsible
          value={openSection}
          onValueChange={setOpenSection}
        >
          <AccordionItem value="articles" className="rounded-xl border px-6">
            <AccordionTrigger className="py-4 hover:no-underline">
              <div className="space-y-1 text-left">
                <div className="text-base font-semibold">
                  Source and Reference Articles
                </div>
                <p className="text-sm font-normal text-muted-foreground">
                  {analysis
                    ? "Collapsed so the analysis stays in focus. Expand to review or edit the articles."
                    : "Paste the source article and the reference article you want to compare."}
                </p>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-4">
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5" />
                      Source Article
                    </CardTitle>
                    <CardDescription>
                      The article you want to analyze and improve
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      placeholder="Paste your source article here..."
                      value={sourceArticle}
                      onChange={(e) => setSourceArticle(e.target.value)}
                      className="field-sizing-fixed h-[300px] resize-none overflow-y-auto"
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5" />
                      Reference Article
                    </CardTitle>
                    <CardDescription>
                      The benchmark article for comparison
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      placeholder="Paste your reference article here..."
                      value={referenceArticle}
                      onChange={(e) => setReferenceArticle(e.target.value)}
                      className="field-sizing-fixed h-[300px] resize-none overflow-y-auto"
                    />
                  </CardContent>
                </Card>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="flex justify-center">
          <Button
            size="lg"
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className="min-w-[200px]"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Analyze Articles
              </>
            )}
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {sourceArticle.trim() && (
          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Draft Workspace
                    </CardTitle>
                    <CardDescription>
                      Review the source article or cycle through saved generated
                      drafts stored in this browser.
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={activeDraft ? "default" : "secondary"}>
                      {activeArticleLabel}
                    </Badge>
                    {drafts.length > 0 && (
                      <Badge variant="outline">
                        {drafts.length} saved drafts
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveDraftId(null)}
                    disabled={!activeDraft}
                  >
                    View Source
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cycleDraft("previous")}
                    disabled={drafts.length === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous Draft
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cycleDraft("next")}
                    disabled={drafts.length === 0}
                  >
                    Next Draft
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  {activeDraft && (
                    <span className="text-sm text-muted-foreground">
                      Draft {activeDraftIndex + 1} of {drafts.length}
                    </span>
                  )}
                </div>

                <Textarea
                  value={activeArticle}
                  readOnly
                  className="field-sizing-fixed h-[360px] resize-none overflow-y-auto"
                />

                {activeDraft && (
                  <div className="space-y-3 rounded-lg border p-4">
                    <div>
                      <p className="text-sm font-medium">Editor Notes</p>
                      <p className="text-sm text-muted-foreground">
                        {activeDraft.editorNotes}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        Applied Recommendations
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {activeDraft.appliedRecommendations.map(
                          (item, index) => (
                            <Badge
                              key={`${activeDraft.id}-${index}`}
                              variant="outline"
                            >
                              {item}
                            </Badge>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Newspaper className="h-5 w-5" />
                  Headline Ideas
                </CardTitle>
                <CardDescription>
                  Generate headlines for the current active draft or fall back
                  to the source article.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  onClick={handleGenerateHeadlines}
                  disabled={isGeneratingHeadlines || !activeArticle.trim()}
                  className="w-full"
                >
                  {isGeneratingHeadlines ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating Headlines...
                    </>
                  ) : (
                    <>
                      <WandSparkles className="mr-2 h-4 w-4" />
                      Generate Headlines for {activeArticleLabel}
                    </>
                  )}
                </Button>

                {headlineError && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Headline Generation Failed</AlertTitle>
                    <AlertDescription>{headlineError}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-3">
                  {headlineSuggestions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Generate three options in sensational, factual, and
                      authoritative tones.
                    </p>
                  ) : (
                    headlineSuggestions.map((item, index) => (
                      <Card key={`${item.tone}-${index}`}>
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-base">
                              {item.headline}
                            </CardTitle>
                            <Badge variant="outline" className="text-xs">
                              {item.tone}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">
                            {item.rationale}
                          </p>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {analysis && (
          <div className="space-y-4">
            {usageMetrics && (
              <Card>
                <CardHeader>
                  <CardTitle>Run Metrics</CardTitle>
                  <CardDescription>
                    Token usage, cost, and response time for the latest analysis
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                    <div className="rounded-lg border p-4">
                      <p className="text-sm text-muted-foreground">
                        Input tokens
                      </p>
                      <p className="text-2xl font-semibold">
                        {formatNumber(usageMetrics.inputTokens)}
                      </p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-sm text-muted-foreground">
                        Output tokens
                      </p>
                      <p className="text-2xl font-semibold">
                        {formatNumber(usageMetrics.outputTokens)}
                      </p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-sm text-muted-foreground">
                        Total tokens
                      </p>
                      <p className="text-2xl font-semibold">
                        {formatNumber(usageMetrics.totalTokens)}
                      </p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-sm text-muted-foreground">Cost</p>
                      <p className="text-2xl font-semibold">
                        {formatCost(usageMetrics.costUsd)}
                      </p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-sm text-muted-foreground">
                        Time taken
                      </p>
                      <p className="text-2xl font-semibold">
                        {formatDuration(usageMetrics.durationMs)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-sm text-muted-foreground">
                    <span>Model: {usageMetrics.model}</span>
                    {usageMetrics.generationId && (
                      <span>Generation: {usageMetrics.generationId}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <Tabs defaultValue="strengths" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                <TabsTrigger value="strengths">Strengths</TabsTrigger>
                <TabsTrigger value="weaknesses">Weaknesses</TabsTrigger>
                <TabsTrigger value="tone">Tone Analysis</TabsTrigger>
                <TabsTrigger value="comparison">Comparison</TabsTrigger>
                <TabsTrigger value="recommendations">
                  Recommendations
                </TabsTrigger>
              </TabsList>

              <TabsContent value="strengths" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="h-5 w-5" />
                      What Your Article Does Well
                    </CardTitle>
                    <CardDescription>
                      Strengths identified in your source article compared to
                      the reference
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[500px] pr-4">
                      <div className="space-y-4">
                        {analysis.strengths.map((strength, index) => (
                          <Card
                            key={index}
                            className="border-l-4 border-l-green-500"
                          >
                            <CardHeader className="pb-2">
                              <div className="flex items-center justify-between">
                                <CardTitle className="text-base">
                                  {strength.point}
                                </CardTitle>
                                <Badge variant="outline">
                                  {strength.category}
                                </Badge>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <p className="text-sm text-muted-foreground">
                                {strength.explanation}
                              </p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="weaknesses" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-600">
                      <XCircle className="h-5 w-5" />
                      Areas for Improvement
                    </CardTitle>
                    <CardDescription>
                      Weaknesses identified in your source article with severity
                      levels
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[500px] pr-4">
                      <div className="space-y-4">
                        {analysis.weaknesses.map((weakness, index) => (
                          <Card
                            key={index}
                            className={`border-l-4 ${
                              weakness.severity === "high"
                                ? "border-l-red-500"
                                : weakness.severity === "medium"
                                  ? "border-l-yellow-500"
                                  : "border-l-blue-500"
                            }`}
                          >
                            <CardHeader className="pb-2">
                              <div className="flex items-center justify-between">
                                <CardTitle className="text-base">
                                  {weakness.point}
                                </CardTitle>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">
                                    {weakness.category}
                                  </Badge>
                                  <Badge
                                    className={getSeverityColor(
                                      weakness.severity
                                    )}
                                  >
                                    {weakness.severity}
                                  </Badge>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <p className="text-sm text-muted-foreground">
                                {weakness.explanation}
                              </p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="tone" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Source Article Tone</CardTitle>
                      <CardDescription>
                        Tone analysis of your article
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <h4 className="font-semibold">Primary Tone</h4>
                        <p className="text-sm text-muted-foreground">
                          {analysis.toneAnalysis.sourceTone.primaryTone}
                        </p>
                      </div>
                      <div>
                        <h4 className="font-semibold">Descriptors</h4>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {analysis.toneAnalysis.sourceTone.toneDescriptors.map(
                            (desc, i) => (
                              <Badge key={i} variant="secondary">
                                {desc}
                              </Badge>
                            )
                          )}
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold">Emotional Impact</h4>
                        <p className="text-sm text-muted-foreground">
                          {analysis.toneAnalysis.sourceTone.emotionalImpact}
                        </p>
                      </div>
                      <div>
                        <h4 className="font-semibold">Appropriateness</h4>
                        <p className="text-sm text-muted-foreground">
                          {analysis.toneAnalysis.sourceTone.appropriateness}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Reference Article Tone</CardTitle>
                      <CardDescription>
                        Tone analysis of the reference article
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <h4 className="font-semibold">Primary Tone</h4>
                        <p className="text-sm text-muted-foreground">
                          {analysis.toneAnalysis.referenceTone.primaryTone}
                        </p>
                      </div>
                      <div>
                        <h4 className="font-semibold">Descriptors</h4>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {analysis.toneAnalysis.referenceTone.toneDescriptors.map(
                            (desc, i) => (
                              <Badge key={i} variant="secondary">
                                {desc}
                              </Badge>
                            )
                          )}
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold">Emotional Impact</h4>
                        <p className="text-sm text-muted-foreground">
                          {analysis.toneAnalysis.referenceTone.emotionalImpact}
                        </p>
                      </div>
                      <div>
                        <h4 className="font-semibold">Appropriateness</h4>
                        <p className="text-sm text-muted-foreground">
                          {analysis.toneAnalysis.referenceTone.appropriateness}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Tone Comparison</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">
                      {analysis.toneAnalysis.toneComparison}
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="comparison" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-green-600">
                        Unique to Source
                      </CardTitle>
                      <CardDescription>
                        Points your article covers that the reference
                        doesn&apos;t
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {analysis.comparisonInsights.uniqueToSource.map(
                          (point, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-2 text-sm"
                            >
                              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                              <span>{point}</span>
                            </li>
                          )
                        )}
                      </ul>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-blue-600">
                        Unique to Reference
                      </CardTitle>
                      <CardDescription>
                        Points the reference covers that yours doesn&apos;t
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {analysis.comparisonInsights.uniqueToReference.map(
                          (point, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-2 text-sm"
                            >
                              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                              <span>{point}</span>
                            </li>
                          )
                        )}
                      </ul>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-purple-600">
                        Both Cover Well
                      </CardTitle>
                      <CardDescription>
                        Strong points in both articles
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {analysis.comparisonInsights.bothCoverWell.map(
                          (point, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-2 text-sm"
                            >
                              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-purple-500" />
                              <span>{point}</span>
                            </li>
                          )
                        )}
                      </ul>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-orange-600">
                        Content Gaps
                      </CardTitle>
                      <CardDescription>
                        Important points neither article covers
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {analysis.comparisonInsights.gaps.map((point, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-sm"
                          >
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="recommendations" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lightbulb className="h-5 w-5" />
                      Actionable Recommendations
                    </CardTitle>
                    <CardDescription>
                      Prioritized suggestions for improving your article
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-col gap-3 rounded-lg border p-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="font-medium">Selected recommendations</p>
                        <p className="text-sm text-muted-foreground">
                          Choose one or more recommendations, then generate a
                          full improved draft that applies them together.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {selectedRecommendations.length} selected
                        </Badge>
                        <Button
                          onClick={handleGenerateDraft}
                          disabled={
                            isGeneratingDraft ||
                            selectedRecommendations.length === 0
                          }
                        >
                          {isGeneratingDraft ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Generating Draft...
                            </>
                          ) : (
                            <>
                              <WandSparkles className="mr-2 h-4 w-4" />
                              Generate Improved Draft
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    {draftError && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Draft Generation Failed</AlertTitle>
                        <AlertDescription>{draftError}</AlertDescription>
                      </Alert>
                    )}

                    <ScrollArea className="h-[500px] pr-4">
                      <div className="space-y-4">
                        {analysis.actionableRecommendations.map(
                          (rec, index) => {
                            const checkboxId = `recommendation-${index}`

                            return (
                              <Card key={index}>
                                <CardHeader className="pb-2">
                                  <div className="flex items-start gap-3">
                                    <Checkbox
                                      id={checkboxId}
                                      checked={selectedRecommendations.includes(
                                        index
                                      )}
                                      onCheckedChange={(checked) =>
                                        toggleRecommendation(
                                          index,
                                          checked === true
                                        )
                                      }
                                      className="mt-1"
                                    />
                                    <div className="flex-1 space-y-2">
                                      <div className="flex items-start justify-between gap-3">
                                        <Label
                                          htmlFor={checkboxId}
                                          className="cursor-pointer items-start text-base leading-6"
                                        >
                                          {rec.recommendation}
                                        </Label>
                                        {getPriorityBadge(rec.priority)}
                                      </div>
                                      <div className="flex items-center gap-2 text-sm">
                                        <span className="text-muted-foreground">
                                          Effort:
                                        </span>
                                        <Badge variant="outline">
                                          {rec.effort}
                                        </Badge>
                                      </div>
                                    </div>
                                  </div>
                                </CardHeader>
                                <CardContent>
                                  <p className="text-sm text-muted-foreground">
                                    {rec.impact}
                                  </p>
                                </CardContent>
                              </Card>
                            )
                          }
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  )
}
