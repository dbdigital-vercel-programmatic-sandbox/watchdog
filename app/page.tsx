"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
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
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Lightbulb,
  BookOpen,
  Sparkles,
  Loader2,
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
  readabilityMetrics: {
    source: {
      estimatedReadingLevel: string
      sentenceComplexity: string
      vocabularyLevel: string
      pacing: string
    }
    reference: {
      estimatedReadingLevel: string
      sentenceComplexity: string
      vocabularyLevel: string
      pacing: string
    }
  }
}

export default function ArticleComparison() {
  const [sourceArticle, setSourceArticle] = useState("")
  const [referenceArticle, setReferenceArticle] = useState("")
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAnalyze = async () => {
    if (!sourceArticle.trim() || !referenceArticle.trim()) {
      setError("Please enter both source and reference articles")
      return
    }

    setIsAnalyzing(true)
    setError(null)

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceArticle, referenceArticle }),
      })

      if (!response.ok) {
        throw new Error("Failed to analyze articles")
      }

      const result = await response.json()
      setAnalysis(result)
    } catch (err) {
      setError(
        "An error occurred while analyzing the articles. Please try again."
      )
    } finally {
      setIsAnalyzing(false)
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
                className="min-h-[300px] resize-none"
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
                className="min-h-[300px] resize-none"
              />
            </CardContent>
          </Card>
        </div>

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

        {analysis && (
          <Tabs defaultValue="strengths" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
              <TabsTrigger value="strengths">Strengths</TabsTrigger>
              <TabsTrigger value="weaknesses">Weaknesses</TabsTrigger>
              <TabsTrigger value="tone">Tone Analysis</TabsTrigger>
              <TabsTrigger value="comparison">Comparison</TabsTrigger>
              <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
              <TabsTrigger value="readability">Readability</TabsTrigger>
            </TabsList>

            <TabsContent value="strengths" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-5 w-5" />
                    What Your Article Does Well
                  </CardTitle>
                  <CardDescription>
                    Strengths identified in your source article compared to the
                    reference
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
                      Points your article covers that the reference doesn&apos;t
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
                        <li key={i} className="flex items-start gap-2 text-sm">
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
                <CardContent>
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-4">
                      {analysis.actionableRecommendations.map((rec, index) => (
                        <Card key={index}>
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between">
                              <CardTitle className="text-base">
                                {rec.recommendation}
                              </CardTitle>
                              {getPriorityBadge(rec.priority)}
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-muted-foreground">
                                Effort:
                              </span>
                              <Badge variant="outline">{rec.effort}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {rec.impact}
                            </p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="readability" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Source Article Readability</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium">
                          Reading Level
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {
                            analysis.readabilityMetrics.source
                              .estimatedReadingLevel
                          }
                        </span>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium">
                          Sentence Complexity
                        </span>
                        <Badge variant="outline">
                          {
                            analysis.readabilityMetrics.source
                              .sentenceComplexity
                          }
                        </Badge>
                      </div>
                      <Progress
                        value={
                          analysis.readabilityMetrics.source
                            .sentenceComplexity === "simple"
                            ? 33
                            : analysis.readabilityMetrics.source
                                  .sentenceComplexity === "moderate"
                              ? 66
                              : 100
                        }
                        className="h-2"
                      />
                    </div>
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium">
                          Vocabulary Level
                        </span>
                        <Badge variant="outline">
                          {analysis.readabilityMetrics.source.vocabularyLevel}
                        </Badge>
                      </div>
                      <Progress
                        value={
                          analysis.readabilityMetrics.source.vocabularyLevel ===
                          "basic"
                            ? 33
                            : analysis.readabilityMetrics.source
                                  .vocabularyLevel === "intermediate"
                              ? 66
                              : 100
                        }
                        className="h-2"
                      />
                    </div>
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium">Pacing</span>
                        <Badge variant="outline">
                          {analysis.readabilityMetrics.source.pacing}
                        </Badge>
                      </div>
                      <Progress
                        value={
                          analysis.readabilityMetrics.source.pacing === "slow"
                            ? 33
                            : analysis.readabilityMetrics.source.pacing ===
                                "moderate"
                              ? 66
                              : 100
                        }
                        className="h-2"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Reference Article Readability</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium">
                          Reading Level
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {
                            analysis.readabilityMetrics.reference
                              .estimatedReadingLevel
                          }
                        </span>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium">
                          Sentence Complexity
                        </span>
                        <Badge variant="outline">
                          {
                            analysis.readabilityMetrics.reference
                              .sentenceComplexity
                          }
                        </Badge>
                      </div>
                      <Progress
                        value={
                          analysis.readabilityMetrics.reference
                            .sentenceComplexity === "simple"
                            ? 33
                            : analysis.readabilityMetrics.reference
                                  .sentenceComplexity === "moderate"
                              ? 66
                              : 100
                        }
                        className="h-2"
                      />
                    </div>
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium">
                          Vocabulary Level
                        </span>
                        <Badge variant="outline">
                          {
                            analysis.readabilityMetrics.reference
                              .vocabularyLevel
                          }
                        </Badge>
                      </div>
                      <Progress
                        value={
                          analysis.readabilityMetrics.reference
                            .vocabularyLevel === "basic"
                            ? 33
                            : analysis.readabilityMetrics.reference
                                  .vocabularyLevel === "intermediate"
                              ? 66
                              : 100
                        }
                        className="h-2"
                      />
                    </div>
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium">Pacing</span>
                        <Badge variant="outline">
                          {analysis.readabilityMetrics.reference.pacing}
                        </Badge>
                      </div>
                      <Progress
                        value={
                          analysis.readabilityMetrics.reference.pacing ===
                          "slow"
                            ? 33
                            : analysis.readabilityMetrics.reference.pacing ===
                                "moderate"
                              ? 66
                              : 100
                        }
                        className="h-2"
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}
