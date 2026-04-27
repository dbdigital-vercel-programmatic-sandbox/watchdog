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
  Plus,
} from "lucide-react"

interface AnalysisResult {
  factualDifferences: Array<{
    summary: string
    type: "missing_in_source" | "mismatch"
    kind: "stat" | "figure" | "date" | "name" | "claim" | "quote" | "other"
    sourceText: string | null
    referenceText: string | null
    impact: string
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
  mode: "full-rewrite" | "patches"
  baseContent: string
  pendingChanges: DraftChange[]
}

interface DraftChange {
  id: string
  recommendation: string
  operation: "insert" | "delete" | "replace"
  targetText: string
  placement: "before" | "after" | null
  insertedText: string | null
  referenceEvidence: string | null
  isQuote: boolean
  rationale: string
  status: "pending" | "kept" | "discarded" | "unresolved"
}

interface PatchPayload {
  changes: Array<{
    recommendation: string
    operation: "insert" | "delete" | "replace"
    targetText: string
    placement: "before" | "after" | null
    insertedText: string | null
    referenceEvidence: string | null
    isQuote: boolean
    rationale: string
  }>
  appliedRecommendations: string[]
  editorNotes: string
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

function normalizeDraft(draft: DraftVersion): DraftVersion {
  return {
    ...draft,
    mode: draft.mode ?? "full-rewrite",
    baseContent: draft.baseContent ?? draft.content,
    pendingChanges: Array.isArray(draft.pendingChanges)
      ? draft.pendingChanges
      : Array.isArray(
            (draft as DraftVersion & { pendingInsertions?: DraftChange[] })
              .pendingInsertions
          )
        ? ((draft as DraftVersion & { pendingInsertions?: DraftChange[] })
            .pendingInsertions ?? [])
        : [],
  }
}

function getSelectedRecommendationItems(
  analysis: AnalysisResult,
  selectedRecommendations: number[]
) {
  return [...selectedRecommendations]
    .sort((left, right) => left - right)
    .map((index) => analysis.actionableRecommendations[index]?.recommendation)
    .filter((item): item is string => Boolean(item))
}

function getSelectedFactDifferenceItems(
  analysis: AnalysisResult,
  selectedFactDifferences: number[]
) {
  return [...selectedFactDifferences]
    .sort((left, right) => left - right)
    .map((index) => analysis.factualDifferences[index])
    .filter(Boolean)
    .map((item) => {
      if (item.type === "mismatch") {
        return `Correct this factual mismatch. Source detail: ${item.sourceText ?? "not stated"}. Reference detail: ${item.referenceText ?? "not stated"}. Summary: ${item.summary}. Impact: ${item.impact}.`
      }

      return `Add this missing factual detail from the reference article: ${item.referenceText ?? item.summary}. Summary: ${item.summary}. Impact: ${item.impact}.`
    })
}

function getFactKindLabel(
  kind: AnalysisResult["factualDifferences"][number]["kind"]
) {
  switch (kind) {
    case "stat":
      return "Stat"
    case "figure":
      return "Figure"
    case "date":
      return "Date"
    case "name":
      return "Name"
    case "claim":
      return "Claim"
    case "quote":
      return "Quote"
    default:
      return "Fact"
  }
}

function formatAddedLines(value: string) {
  return value
    .split("\n")
    .map((line) => `+ ${line}`)
    .join("\n")
}

function formatDeletedLines(value: string) {
  return value
    .split("\n")
    .map((line) => `- ${line}`)
    .join("\n")
}

function applyChangeToDraft(
  article: string,
  change: Pick<
    DraftChange,
    "operation" | "targetText" | "placement" | "insertedText"
  >
) {
  const targetIndex = article.indexOf(change.targetText)

  if (targetIndex === -1) {
    return null
  }

  if (change.operation === "delete") {
    return `${article.slice(0, targetIndex)}${article.slice(
      targetIndex + change.targetText.length
    )}`
  }

  const insertedText = change.insertedText?.trim() ?? ""

  if (!insertedText) {
    return article
  }

  if (change.operation === "replace") {
    return `${article.slice(0, targetIndex)}${insertedText}${article.slice(
      targetIndex + change.targetText.length
    )}`
  }

  if (change.placement === "before") {
    return `${article.slice(0, targetIndex)}${insertedText}\n\n${article.slice(targetIndex)}`
  }

  const targetEndIndex = targetIndex + change.targetText.length

  return `${article.slice(0, targetEndIndex)}\n\n${insertedText}${article.slice(targetEndIndex)}`
}

function getChangeStatusLabel(status: DraftChange["status"]) {
  switch (status) {
    case "kept":
      return "Kept"
    case "pending":
      return "Pending"
    case "discarded":
      return "Discarded"
    case "unresolved":
      return "Unresolved"
    default:
      return status
  }
}

function getChangeStatusClasses(
  operation: DraftChange["operation"],
  status: DraftChange["status"]
) {
  if (status === "unresolved") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100"
  }

  if (status === "discarded") {
    return "border-border bg-muted/40 text-foreground"
  }

  if (operation === "delete") {
    return status === "kept"
      ? "border-rose-500/40 bg-rose-500/10 text-rose-900 dark:text-rose-100"
      : "border-rose-500/40 bg-rose-500/10 text-rose-900 dark:text-rose-100"
  }

  if (operation === "replace") {
    return status === "kept"
      ? "border-violet-500/40 bg-violet-500/10 text-violet-900 dark:text-violet-100"
      : "border-violet-500/40 bg-violet-500/10 text-violet-900 dark:text-violet-100"
  }

  switch (status) {
    case "kept":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
    case "pending":
      return "border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-100"
    default:
      return "border-border bg-muted/40 text-foreground"
  }
}

function getOperationLabel(change: DraftChange) {
  if (change.operation === "insert") {
    return change.placement === "before" ? "Insert before" : "Insert after"
  }

  if (change.operation === "delete") {
    return "Delete"
  }

  return "Replace"
}

function buildChangePreview(article: string, changes: DraftChange[]) {
  const visibleChanges = changes
    .filter((item) => item.status === "pending" || item.status === "kept")
    .map((item, index) => {
      const targetIndex = article.indexOf(item.targetText)

      return {
        item,
        index,
        targetIndex,
      }
    })
    .filter((item) => item.targetIndex >= 0)
    .sort((left, right) => {
      if (left.targetIndex !== right.targetIndex) {
        return left.targetIndex - right.targetIndex
      }

      const rank = { before: 0, delete: 1, replace: 2, after: 3 }
      const leftRank =
        left.item.operation === "insert"
          ? rank[left.item.placement === "before" ? "before" : "after"]
          : rank[left.item.operation]
      const rightRank =
        right.item.operation === "insert"
          ? rank[right.item.placement === "before" ? "before" : "after"]
          : rank[right.item.operation]

      if (leftRank !== rightRank) {
        return leftRank - rightRank
      }

      return left.index - right.index
    })

  const byAnchor = new Map<
    number,
    {
      before: DraftChange[]
      after: DraftChange[]
      target: DraftChange[]
      targetText: string
    }
  >()

  for (const entry of visibleChanges) {
    const bucket = byAnchor.get(entry.targetIndex) ?? {
      before: [],
      after: [],
      target: [],
      targetText: entry.item.targetText,
    }

    if (entry.item.operation === "insert") {
      bucket[entry.item.placement === "before" ? "before" : "after"].push(
        entry.item
      )
    } else {
      bucket.target.push(entry.item)
    }

    byAnchor.set(entry.targetIndex, bucket)
  }

  const anchors = [...byAnchor.entries()].sort(
    (left, right) => left[0] - right[0]
  )
  const parts: Array<
    | { type: "text"; content: string }
    | {
        type: "changes"
        items: DraftChange[]
        placement: "before" | "target" | "after"
      }
  > = []
  let cursor = 0

  for (const [targetIndex, bucket] of anchors) {
    if (cursor < targetIndex) {
      parts.push({
        type: "text",
        content: article.slice(cursor, targetIndex),
      })
    }

    if (bucket.before.length > 0) {
      parts.push({
        type: "changes",
        items: bucket.before,
        placement: "before",
      })
    }

    const targetEndIndex = targetIndex + bucket.targetText.length

    if (bucket.target.length > 0) {
      parts.push({
        type: "changes",
        items: bucket.target,
        placement: "target",
      })
    } else {
      parts.push({
        type: "text",
        content: article.slice(targetIndex, targetEndIndex),
      })
    }

    if (bucket.after.length > 0) {
      parts.push({
        type: "changes",
        items: bucket.after,
        placement: "after",
      })
    }

    cursor = targetEndIndex
  }

  if (cursor < article.length) {
    parts.push({
      type: "text",
      content: article.slice(cursor),
    })
  }

  return parts.filter((part) => part.type !== "text" || part.content.length > 0)
}

export default function ArticleComparison() {
  const [sourceArticle, setSourceArticle] = useState("")
  const [referenceArticle, setReferenceArticle] = useState("")
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [usageMetrics, setUsageMetrics] = useState<UsageMetrics | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openSection, setOpenSection] = useState("articles")
  const [activeAnalysisTab, setActiveAnalysisTab] = useState("facts")
  const [selectedRecommendations, setSelectedRecommendations] = useState<
    number[]
  >([])
  const [selectedFactDifferences, setSelectedFactDifferences] = useState<
    number[]
  >([])
  const [drafts, setDrafts] = useState<DraftVersion[]>([])
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false)
  const [isGeneratingInsertions, setIsGeneratingInsertions] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [activeInsertionId, setActiveInsertionId] = useState<string | null>(
    null
  )
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
  const patchDraft = activeDraft?.mode === "patches" ? activeDraft : null
  const reviewQueue = patchDraft?.pendingChanges ?? []
  const pendingReviewQueue = reviewQueue.filter(
    (item) => item.status === "pending"
  )
  const activeInsertionIndex = pendingReviewQueue.findIndex(
    (item) => item.id === activeInsertionId
  )
  const activeInsertion =
    activeInsertionIndex >= 0
      ? pendingReviewQueue[activeInsertionIndex]
      : (pendingReviewQueue[0] ?? null)
  const isPatchReviewActive = Boolean(
    patchDraft && pendingReviewQueue.length > 0
  )
  const keptInsertionCount = reviewQueue.filter(
    (item) => item.status === "kept"
  ).length
  const discardedInsertionCount = reviewQueue.filter(
    (item) => item.status === "discarded"
  ).length
  const unresolvedInsertionCount = reviewQueue.filter(
    (item) => item.status === "unresolved"
  ).length
  const reviewedInsertionCount =
    keptInsertionCount + discardedInsertionCount + unresolvedInsertionCount
  const inlineInsertionPreview = useMemo(
    () =>
      patchDraft
        ? buildChangePreview(patchDraft.baseContent, patchDraft.pendingChanges)
        : [],
    [patchDraft]
  )
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

      const normalizedDrafts = parsedDrafts.map(normalizeDraft)

      setDrafts(normalizedDrafts)
      setActiveDraftId(normalizedDrafts.at(-1)?.id ?? null)
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

  useEffect(() => {
    if (!patchDraft) {
      setActiveInsertionId(null)
      return
    }

    const pendingInsertion = patchDraft.pendingChanges.find(
      (item) => item.status === "pending"
    )

    if (!pendingInsertion) {
      setActiveInsertionId(null)
      return
    }

    const isActivePending = patchDraft.pendingChanges.some(
      (item) => item.id === activeInsertionId && item.status === "pending"
    )

    if (!isActivePending) {
      setActiveInsertionId(pendingInsertion.id)
    }
  }, [activeInsertionId, patchDraft])

  const toggleRecommendation = (index: number, checked: boolean) => {
    setSelectedRecommendations((current) => {
      if (checked) {
        return current.includes(index) ? current : [...current, index]
      }

      return current.filter((item) => item !== index)
    })
  }

  const toggleFactDifference = (index: number, checked: boolean) => {
    setSelectedFactDifferences((current) => {
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

  const handleDraftContentChange = (nextContent: string) => {
    if (!activeDraftId) {
      return
    }

    setDrafts((current) =>
      current.map((draft) =>
        draft.id === activeDraftId ? { ...draft, content: nextContent } : draft
      )
    )
  }

  const analyzeArticle = async (articleToAnalyze: string) => {
    if (!articleToAnalyze.trim() || !referenceArticle.trim()) {
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
        body: JSON.stringify({
          sourceArticle: articleToAnalyze,
          referenceArticle,
        }),
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
      setSelectedFactDifferences([])
      setActiveAnalysisTab("facts")
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

  const handleAnalyze = async () => {
    await analyzeArticle(sourceArticle)
  }

  const handleAnalyzeDraft = async () => {
    await analyzeArticle(activeArticle)
  }

  const handleGenerateDraft = async () => {
    if (!analysis) {
      return
    }

    const selectedItems = getSelectedRecommendationItems(
      analysis,
      selectedRecommendations
    )

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
        mode: "full-rewrite",
        baseContent: sourceArticle,
        pendingChanges: [],
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

  const handleGeneratePatches = async () => {
    if (!analysis) {
      return
    }

    const selectedItems = getSelectedRecommendationItems(
      analysis,
      selectedRecommendations
    )
    const selectedFacts = getSelectedFactDifferenceItems(
      analysis,
      selectedFactDifferences
    )
    const patchInputs = [...selectedFacts, ...selectedItems]

    if (patchInputs.length === 0) {
      setDraftError("Select at least one recommendation or factual difference")
      return
    }

    setIsGeneratingInsertions(true)
    setDraftError(null)

    try {
      const response = await fetch("/api/patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseArticle: activeArticle,
          referenceArticle,
          recommendations: patchInputs,
        }),
      })

      const payload = (await response.json()) as
        | PatchPayload
        | { error?: string }

      if (!response.ok) {
        throw new Error(
          ("error" in payload ? payload.error : undefined) ??
            "Failed to generate patch suggestions"
        )
      }

      if (!("changes" in payload) || payload.changes.length === 0) {
        throw new Error(
          "No safe patch suggestions were generated for the selected recommendations"
        )
      }

      const nextDraft: DraftVersion = {
        id: crypto.randomUUID(),
        content: activeArticle,
        editorNotes: payload.editorNotes,
        appliedRecommendations: payload.appliedRecommendations,
        createdAt: new Date().toISOString(),
        mode: "patches",
        baseContent: activeArticle,
        pendingChanges: payload.changes.map((item) => ({
          id: crypto.randomUUID(),
          recommendation: item.recommendation,
          operation: item.operation,
          targetText: item.targetText,
          placement: item.placement,
          insertedText: item.insertedText,
          referenceEvidence: item.referenceEvidence,
          isQuote: item.isQuote,
          rationale: item.rationale,
          status: "pending",
        })),
      }

      setDrafts((current) => [...current, nextDraft])
      setActiveDraftId(nextDraft.id)
      setActiveInsertionId(nextDraft.pendingChanges[0]?.id ?? null)
    } catch (err) {
      setDraftError(
        err instanceof Error
          ? err.message
          : "An error occurred while generating patch suggestions."
      )
    } finally {
      setIsGeneratingInsertions(false)
    }
  }

  const cycleInsertion = (direction: "previous" | "next") => {
    if (pendingReviewQueue.length === 0 || !activeInsertion) {
      return
    }

    const nextIndex =
      direction === "previous"
        ? (activeInsertionIndex - 1 + pendingReviewQueue.length) %
          pendingReviewQueue.length
        : (activeInsertionIndex + 1) % pendingReviewQueue.length

    setActiveInsertionId(pendingReviewQueue[nextIndex]?.id ?? null)
  }

  const resolveInsertion = (decision: "kept" | "discarded") => {
    if (!activeDraftId || !patchDraft || !activeInsertion) {
      return
    }

    setDraftError(null)

    if (decision === "discarded") {
      setDrafts((current) =>
        current.map((draft) =>
          draft.id === activeDraftId
            ? {
                ...draft,
                pendingChanges: draft.pendingChanges.map((item) =>
                  item.id === activeInsertion.id
                    ? { ...item, status: "discarded" }
                    : item
                ),
              }
            : draft
        )
      )

      return
    }

    const nextContent = applyChangeToDraft(patchDraft.content, activeInsertion)

    setDrafts((current) =>
      current.map((draft) => {
        if (draft.id !== activeDraftId) {
          return draft
        }

        if (!nextContent) {
          return {
            ...draft,
            pendingChanges: draft.pendingChanges.map((item) =>
              item.id === activeInsertion.id
                ? { ...item, status: "unresolved" }
                : item
            ),
          }
        }

        return {
          ...draft,
          content: nextContent,
          pendingChanges: draft.pendingChanges.map((item) =>
            item.id === activeInsertion.id ? { ...item, status: "kept" } : item
          ),
        }
      })
    )

    if (!nextContent) {
      setDraftError(
        "This patch suggestion could not be matched to the current draft and was marked unresolved."
      )
    }
  }

  const handleGenerateHeadlines = async () => {
    if (!activeArticle.trim()) {
      setHeadlineError("Enter a source article or create a draft first")
      return
    }

    setIsGeneratingHeadlines(true)
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
                      Review the source article, saved full rewrites, or
                      patch-review drafts stored in this browser.
                    </CardDescription>
                  </div>
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <Badge variant={activeDraft ? "default" : "secondary"}>
                        {activeArticleLabel}
                      </Badge>
                      {activeDraft && (
                        <Badge variant="outline">
                          {activeDraft.mode === "patches"
                            ? "Patch Review"
                            : "Full Rewrite"}
                        </Badge>
                      )}
                      {drafts.length > 0 && (
                        <Badge variant="outline">
                          {drafts.length} saved drafts
                        </Badge>
                      )}
                    </div>
                    {activeDraft && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAnalyzeDraft}
                        disabled={isAnalyzing || !referenceArticle.trim()}
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="mr-2 h-4 w-4" />
                            Analyze This Draft
                          </>
                        )}
                      </Button>
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
                  {isPatchReviewActive && (
                    <span className="text-sm text-muted-foreground">
                      {pendingReviewQueue.length} pending of{" "}
                      {reviewQueue.length} suggestions
                    </span>
                  )}
                </div>

                {isPatchReviewActive ? (
                  <div className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
                    <div className="overflow-hidden rounded-lg border">
                      <div className="border-b px-4 py-3">
                        <p className="text-sm font-medium">Current Draft</p>
                        <p className="text-sm text-muted-foreground">
                          Inline markers show where pending and kept blocks sit
                          relative to the original structure.
                        </p>
                      </div>
                      <ScrollArea className="h-[360px] px-4 py-4">
                        {inlineInsertionPreview.length === 0 ? (
                          <pre className="text-sm leading-6 whitespace-pre-wrap">
                            {activeArticle}
                          </pre>
                        ) : (
                          <div className="space-y-4">
                            {inlineInsertionPreview.map((part, index) =>
                              part.type === "text" ? (
                                <pre
                                  key={`text-${index}`}
                                  className="text-sm leading-6 whitespace-pre-wrap"
                                >
                                  {part.content}
                                </pre>
                              ) : (
                                <div
                                  key={`${part.placement}-${index}`}
                                  className="space-y-3"
                                >
                                  {part.items.map((item) => (
                                    <div
                                      key={item.id}
                                      className={`rounded-lg border p-3 ${getChangeStatusClasses(item.operation, item.status)} ${
                                        item.id === activeInsertion?.id
                                          ? "ring-2 ring-sky-500/50"
                                          : ""
                                      }`}
                                    >
                                      <div className="mb-2 flex flex-wrap items-center gap-2">
                                        <Badge variant="outline">
                                          {getOperationLabel(item)}
                                        </Badge>
                                        {item.isQuote && (
                                          <Badge variant="secondary">
                                            Quote
                                          </Badge>
                                        )}
                                        <Badge variant="outline">
                                          {getChangeStatusLabel(item.status)}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">
                                          {item.recommendation}
                                        </span>
                                      </div>
                                      {item.operation !== "delete" &&
                                        item.insertedText && (
                                          <pre className="text-sm leading-6 whitespace-pre-wrap">
                                            {formatAddedLines(
                                              item.insertedText
                                            )}
                                          </pre>
                                        )}
                                      {item.operation !== "insert" && (
                                        <pre className="text-sm leading-6 whitespace-pre-wrap line-through opacity-80">
                                          {formatDeletedLines(item.targetText)}
                                        </pre>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )
                            )}
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                    <div className="flex flex-col rounded-lg border">
                      <div className="border-b px-4 py-3">
                        <p className="text-sm font-medium">Suggestion Review</p>
                        <p className="text-sm text-muted-foreground">
                          Keep or discard each patch without forcing a full
                          rewrite.
                        </p>
                      </div>
                      <div className="flex-1 p-4">
                        {activeInsertion ? (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between gap-2">
                              <Badge variant="outline">
                                {activeInsertionIndex + 1} of{" "}
                                {pendingReviewQueue.length}
                              </Badge>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="secondary">
                                  {getOperationLabel(activeInsertion)}
                                </Badge>
                                {activeInsertion.isQuote && (
                                  <Badge variant="secondary">Quote</Badge>
                                )}
                              </div>
                            </div>
                            <div className="space-y-2 rounded-lg border p-4">
                              <p className="text-sm font-medium">
                                Recommendation
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {activeInsertion.recommendation}
                              </p>
                            </div>
                            <div className="space-y-2 rounded-lg border p-4">
                              <p className="text-sm font-medium">
                                Why this block belongs here
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {activeInsertion.rationale}
                              </p>
                            </div>
                            {activeInsertion.referenceEvidence && (
                              <div className="space-y-2 rounded-lg border p-4">
                                <p className="text-sm font-medium">
                                  Reference Evidence
                                </p>
                                <pre className="rounded-md border bg-muted/40 p-3 text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
                                  {activeInsertion.referenceEvidence}
                                </pre>
                              </div>
                            )}
                            <div className="space-y-3 rounded-lg border bg-muted/30 p-4 font-mono text-sm">
                              <div>
                                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                  Anchor
                                </p>
                                <pre className="mt-2 rounded-md border bg-background p-3 text-sm leading-6 whitespace-pre-wrap">
                                  {activeInsertion.targetText}
                                </pre>
                              </div>
                              {activeInsertion.operation !== "insert" && (
                                <div>
                                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                    Removed text
                                  </p>
                                  <pre className="mt-2 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm leading-6 whitespace-pre-wrap text-rose-900 dark:text-rose-100">
                                    {formatDeletedLines(
                                      activeInsertion.targetText
                                    )}
                                  </pre>
                                </div>
                              )}
                              {activeInsertion.operation !== "delete" &&
                                activeInsertion.insertedText && (
                                  <div>
                                    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                      Added text
                                    </p>
                                    <pre className="mt-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm leading-6 whitespace-pre-wrap text-emerald-900 dark:text-emerald-100">
                                      {formatAddedLines(
                                        activeInsertion.insertedText
                                      )}
                                    </pre>
                                  </div>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => cycleInsertion("previous")}
                                disabled={pendingReviewQueue.length <= 1}
                              >
                                <ChevronLeft className="h-4 w-4" />
                                Previous
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => cycleInsertion("next")}
                                disabled={pendingReviewQueue.length <= 1}
                              >
                                Next
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => resolveInsertion("discarded")}
                              >
                                Discard
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => resolveInsertion("kept")}
                              >
                                Keep
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-4 rounded-lg border border-dashed p-6">
                            <div className="flex flex-col items-center justify-center text-center">
                              <CheckCircle className="mb-3 h-8 w-8 text-emerald-500" />
                              <p className="font-medium">
                                All suggestions reviewed
                              </p>
                              <p className="text-sm text-muted-foreground">
                                This draft now contains only the patch changes
                                you kept.
                              </p>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-3">
                              <div className="rounded-lg border p-3 text-center">
                                <p className="text-2xl font-semibold">
                                  {keptInsertionCount}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  blocks kept
                                </p>
                              </div>
                              <div className="rounded-lg border p-3 text-center">
                                <p className="text-2xl font-semibold">
                                  {discardedInsertionCount}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  blocks discarded
                                </p>
                              </div>
                              <div className="rounded-lg border p-3 text-center">
                                <p className="text-2xl font-semibold">
                                  {unresolvedInsertionCount}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  unresolved
                                </p>
                              </div>
                            </div>
                            <Alert>
                              <CheckCircle className="h-4 w-4" />
                              <AlertTitle>Draft saved</AlertTitle>
                              <AlertDescription>
                                Review is complete. This patch draft is already
                                saved in browser storage, and the kept changes
                                remain in the draft text.
                              </AlertDescription>
                            </Alert>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <Textarea
                    value={activeArticle}
                    onChange={(event) =>
                      handleDraftContentChange(event.target.value)
                    }
                    readOnly={!activeDraft}
                    className="field-sizing-fixed h-[360px] resize-none overflow-y-auto"
                  />
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
                      {headlineSuggestions.length > 0
                        ? `Regenerate Headlines for ${activeArticleLabel}`
                        : `Generate Headlines for ${activeArticleLabel}`}
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
            <Tabs
              value={activeAnalysisTab}
              onValueChange={setActiveAnalysisTab}
              className="space-y-4"
            >
              <TabsList className="grid w-full grid-cols-2 md:grid-cols-2 lg:grid-cols-4">
                <TabsTrigger value="facts">Fact Differences</TabsTrigger>
                <TabsTrigger value="tone">Tone Analysis</TabsTrigger>
                <TabsTrigger value="comparison">Comparison</TabsTrigger>
                <TabsTrigger value="recommendations">
                  Recommendations
                </TabsTrigger>
              </TabsList>

              <TabsContent value="facts" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5" />
                      Facts, Figures, Dates, and Information Differences
                    </CardTitle>
                    <CardDescription>
                      Review concrete information differences and choose which
                      ones should drive patch suggestions.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-col gap-3 rounded-lg border p-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="font-medium">
                          Selected factual differences
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Select the reference-backed factual gaps and
                          mismatches you want to act on.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {selectedFactDifferences.length} selected
                        </Badge>
                        <Button
                          variant="outline"
                          onClick={handleGeneratePatches}
                          disabled={
                            isGeneratingDraft ||
                            isGeneratingInsertions ||
                            (selectedFactDifferences.length === 0 &&
                              selectedRecommendations.length === 0)
                          }
                        >
                          {isGeneratingInsertions ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Generating Patches...
                            </>
                          ) : (
                            <>
                              <Plus className="mr-2 h-4 w-4" />
                              Generate Patch Suggestions
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                    <ScrollArea className="h-[500px] pr-4">
                      <div className="space-y-4">
                        {analysis.factualDifferences.map(
                          (difference, index) => {
                            const checkboxId = `fact-difference-${index}`

                            return (
                              <Card key={index}>
                                <CardHeader className="pb-2">
                                  <div className="flex items-start gap-3">
                                    <Checkbox
                                      id={checkboxId}
                                      checked={selectedFactDifferences.includes(
                                        index
                                      )}
                                      onCheckedChange={(checked) =>
                                        toggleFactDifference(
                                          index,
                                          checked === true
                                        )
                                      }
                                      className="mt-1"
                                    />
                                    <div className="flex-1 space-y-3">
                                      <div className="flex items-start justify-between gap-3">
                                        <Label
                                          htmlFor={checkboxId}
                                          className="cursor-pointer items-start text-base leading-6"
                                        >
                                          {difference.summary}
                                        </Label>
                                        <Badge variant="outline">
                                          {difference.type ===
                                          "missing_in_source"
                                            ? "Missing"
                                            : "Mismatch"}
                                        </Badge>
                                        <Badge variant="secondary">
                                          {getFactKindLabel(difference.kind)}
                                        </Badge>
                                      </div>
                                      <p className="text-sm text-muted-foreground">
                                        {difference.impact}
                                      </p>
                                    </div>
                                  </div>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                  {difference.sourceText && (
                                    <div>
                                      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                        Source detail
                                      </p>
                                      <p className="mt-2 rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-muted-foreground">
                                        {difference.sourceText}
                                      </p>
                                    </div>
                                  )}
                                  {difference.referenceText && (
                                    <div>
                                      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                        Reference detail
                                      </p>
                                      <p className="mt-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-muted-foreground">
                                        {difference.referenceText}
                                      </p>
                                    </div>
                                  )}
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
                          Use recommendations to guide full rewrites and refine
                          which broader improvements should be applied.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {selectedRecommendations.length} recommendations
                        </Badge>
                        <Button
                          onClick={handleGenerateDraft}
                          disabled={
                            isGeneratingDraft ||
                            isGeneratingInsertions ||
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

                    <Alert>
                      <BookOpen className="h-4 w-4" />
                      <AlertTitle>
                        Patch suggestions start in Fact Differences
                      </AlertTitle>
                      <AlertDescription>
                        Select concrete factual gaps, mismatches, and redundant
                        details in the Fact Differences tab when you want
                        reviewable add/delete/replace suggestions.
                      </AlertDescription>
                    </Alert>

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

            {usageMetrics && (
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem
                  value="run-metrics"
                  className="rounded-lg border px-4"
                >
                  <AccordionTrigger>Run Metrics</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pb-2">
                      <p className="text-sm text-muted-foreground">
                        Token usage, cost, and response time for the latest
                        analysis.
                      </p>
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

                      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                        <span>Model: {usageMetrics.model}</span>
                        {usageMetrics.generationId && (
                          <span>Generation: {usageMetrics.generationId}</span>
                        )}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
