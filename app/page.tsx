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
import { Input } from "@/components/ui/input"
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
  Link2,
  ImageIcon,
  Video,
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
  mode: "full-rewrite" | "patches" | "finalized-patches"
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

interface ScrapedArticleMediaItem {
  type: "image" | "video" | "embed"
  url: string
  alt: string | null
  caption: string | null
  poster: string | null
}

interface ScrapedArticlePayload {
  title: string | null
  description: string | null
  body: string
  media: ScrapedArticleMediaItem[]
}

interface ScrapePayload {
  blocked: boolean
  finalUrl: string
  reasons: string[]
  article: ScrapedArticlePayload | null
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

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value)

    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

function formatScrapedArticleForAnalysis(article: ScrapedArticlePayload) {
  const sections = [article.title, article.description, article.body].filter(
    (value): value is string => Boolean(value?.trim())
  )

  if (article.media.length > 0) {
    sections.push(
      [
        "Embedded media in article body:",
        ...article.media.map((item, index) => {
          const details = [
            item.type,
            item.caption,
            item.alt,
            item.url,
            item.poster,
          ].filter((value): value is string => Boolean(value?.trim()))

          return `${index + 1}. ${details.join(" | ")}`
        }),
      ].join("\n")
    )
  }

  return sections.join("\n\n")
}

function buildScrapeError(
  label: string,
  payload: { error?: string } | ScrapePayload
) {
  if ("error" in payload && payload.error) {
    return `${label}: ${payload.error}`
  }

  if (!("article" in payload)) {
    return `${label}: Failed to scrape the article.`
  }

  if (payload.blocked || !payload.article) {
    const reason =
      payload.reasons[0] ?? "Readable article content was not extracted."

    return `${label}: ${reason}`
  }

  return null
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

type DiffSegment = {
  type: "equal" | "removed" | "added"
  text: string
}

function tokenizeTextForDiff(text: string) {
  const normalized = text.replace(/\r\n/g, "\n")
  const sentenceTokens = normalized.match(/[^.!?\n]+[.!?]?[\s]*/g)

  if (sentenceTokens && sentenceTokens.length > 0) {
    return sentenceTokens.filter((token) => token.length > 0)
  }

  return normalized ? [normalized] : []
}

function buildDiffSegments(source: string, draft: string): DiffSegment[] {
  const sourceTokens = tokenizeTextForDiff(source)
  const draftTokens = tokenizeTextForDiff(draft)
  const rows = sourceTokens.length
  const columns = draftTokens.length
  const table = Array.from({ length: rows + 1 }, () =>
    Array<number>(columns + 1).fill(0)
  )

  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let column = columns - 1; column >= 0; column -= 1) {
      if (sourceTokens[row] === draftTokens[column]) {
        table[row][column] = table[row + 1][column + 1] + 1
      } else {
        table[row][column] = Math.max(
          table[row + 1][column],
          table[row][column + 1]
        )
      }
    }
  }

  const segments: DiffSegment[] = []
  let row = 0
  let column = 0

  const pushSegment = (type: DiffSegment["type"], text: string) => {
    if (!text) {
      return
    }

    const previous = segments.at(-1)

    if (previous?.type === type) {
      previous.text += text
      return
    }

    segments.push({ type, text })
  }

  while (row < rows && column < columns) {
    if (sourceTokens[row] === draftTokens[column]) {
      pushSegment("equal", sourceTokens[row])
      row += 1
      column += 1
      continue
    }

    if (table[row + 1][column] >= table[row][column + 1]) {
      pushSegment("removed", sourceTokens[row])
      row += 1
    } else {
      pushSegment("added", draftTokens[column])
      column += 1
    }
  }

  while (row < rows) {
    pushSegment("removed", sourceTokens[row])
    row += 1
  }

  while (column < columns) {
    pushSegment("added", draftTokens[column])
    column += 1
  }

  return segments
}

export default function ArticleComparison() {
  const [sourceArticle, setSourceArticle] = useState("")
  const [referenceArticle, setReferenceArticle] = useState("")
  const [articleInputMode, setArticleInputMode] = useState("paste")
  const [sourceUrl, setSourceUrl] = useState("")
  const [referenceUrl, setReferenceUrl] = useState("")
  const [sourceScrape, setSourceScrape] =
    useState<ScrapedArticlePayload | null>(null)
  const [referenceScrape, setReferenceScrape] =
    useState<ScrapedArticlePayload | null>(null)
  const [isScrapingUrls, setIsScrapingUrls] = useState(false)
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
  const isPatchReviewSession = Boolean(patchDraft)
  const keptInsertionCount = reviewQueue.filter(
    (item) => item.status === "kept"
  ).length
  const discardedInsertionCount = reviewQueue.filter(
    (item) => item.status === "discarded"
  ).length
  const unresolvedInsertionCount = reviewQueue.filter(
    (item) => item.status === "unresolved"
  ).length
  const inlineInsertionPreview = useMemo(
    () =>
      patchDraft
        ? buildChangePreview(patchDraft.baseContent, patchDraft.pendingChanges)
        : [],
    [patchDraft]
  )
  const diffSegments = useMemo(
    () => buildDiffSegments(sourceArticle, activeArticle),
    [sourceArticle, activeArticle]
  )
  const sourceDiffSegments = diffSegments.filter(
    (segment) => segment.type !== "added"
  )
  const draftDiffSegments = diffSegments.filter(
    (segment) => segment.type !== "removed"
  )
  const addedSegmentCount = diffSegments.filter(
    (segment) => segment.type === "added"
  ).length
  const removedSegmentCount = diffSegments.filter(
    (segment) => segment.type === "removed"
  ).length
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

  const analyzeArticle = async (
    articleToAnalyze: string,
    referenceToAnalyze = referenceArticle
  ) => {
    if (!articleToAnalyze.trim() || !referenceToAnalyze.trim()) {
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
          referenceArticle: referenceToAnalyze,
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
    if (drafts.length > 0) {
      const confirmed = window.confirm(
        "Analyzing again will reset the current workspace and remove saved drafts for this source/reference pair. Do you want to continue?"
      )

      if (!confirmed) {
        return
      }

      setDrafts([])
      setActiveDraftId(null)
    }

    await analyzeArticle(sourceArticle)
  }

  const handleAnalyzeDraft = async () => {
    await analyzeArticle(activeArticle)
  }

  const handleCompareUrls = async () => {
    if (!isValidHttpUrl(sourceUrl) || !isValidHttpUrl(referenceUrl)) {
      setError("Please enter two valid article URLs")
      return
    }

    if (drafts.length > 0) {
      const confirmed = window.confirm(
        "Scraping new URLs will reset the current workspace and remove saved drafts for this source/reference pair. Do you want to continue?"
      )

      if (!confirmed) {
        return
      }

      setDrafts([])
      setActiveDraftId(null)
    }

    setIsScrapingUrls(true)
    setError(null)
    setSourceScrape(null)
    setReferenceScrape(null)

    try {
      const [sourceResponse, referenceResponse] = await Promise.all([
        fetch("/api/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: sourceUrl }),
        }),
        fetch("/api/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: referenceUrl }),
        }),
      ])

      const [sourcePayload, referencePayload] = (await Promise.all([
        sourceResponse.json(),
        referenceResponse.json(),
      ])) as Array<ScrapePayload | { error?: string }>

      const sourceError = buildScrapeError("Source URL", sourcePayload)
      const referenceError = buildScrapeError("Reference URL", referencePayload)

      if (sourceError || referenceError) {
        throw new Error([sourceError, referenceError].filter(Boolean).join(" "))
      }

      const nextSourceArticle = formatScrapedArticleForAnalysis(
        (sourcePayload as ScrapePayload).article as ScrapedArticlePayload
      )
      const nextReferenceArticle = formatScrapedArticleForAnalysis(
        (referencePayload as ScrapePayload).article as ScrapedArticlePayload
      )

      setSourceScrape((sourcePayload as ScrapePayload).article)
      setReferenceScrape((referencePayload as ScrapePayload).article)
      setSourceArticle(nextSourceArticle)
      setReferenceArticle(nextReferenceArticle)

      await analyzeArticle(nextSourceArticle, nextReferenceArticle)
    } catch (err) {
      setAnalysis(null)
      setError(
        err instanceof Error
          ? err.message
          : "An error occurred while scraping the article URLs."
      )
    } finally {
      setIsScrapingUrls(false)
    }
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

  const resolveInsertionById = (
    changeId: string,
    decision: "kept" | "discarded"
  ) => {
    if (!activeDraftId || !patchDraft) {
      return
    }

    setDraftError(null)

    setDrafts((current) =>
      current.map((draft) =>
        draft.id === activeDraftId
          ? {
              ...draft,
              pendingChanges: draft.pendingChanges.map((item) =>
                item.id === changeId ? { ...item, status: decision } : item
              ),
            }
          : draft
      )
    )
  }

  const resolveInsertion = (decision: "kept" | "discarded") => {
    if (!activeInsertion) {
      return
    }

    resolveInsertionById(activeInsertion.id, decision)
  }

  const handleEndReview = () => {
    if (!activeDraftId || !patchDraft) {
      return
    }

    const hasPendingChanges = patchDraft.pendingChanges.some(
      (item) => item.status === "pending"
    )

    if (
      hasPendingChanges &&
      !window.confirm(
        "End review now? Unreviewed suggestions will be discarded before the final draft is created."
      )
    ) {
      return
    }

    setDraftError(null)

    const resolvedChanges = patchDraft.pendingChanges.map((item) =>
      item.status === "pending"
        ? { ...item, status: "discarded" as const }
        : item
    )
    let finalizedContent = patchDraft.baseContent
    let hasUnresolvedChanges = false

    const finalizedStatuses = resolvedChanges.map((item) => {
      if (item.status !== "kept") {
        return item
      }

      const nextContent = applyChangeToDraft(finalizedContent, item)

      if (!nextContent) {
        hasUnresolvedChanges = true
        return { ...item, status: "unresolved" as const }
      }

      finalizedContent = nextContent
      return item
    })

    setDrafts((current) =>
      current.map((draft) =>
        draft.id === activeDraftId
          ? {
              ...draft,
              content: finalizedContent,
              createdAt: new Date().toISOString(),
              mode: "finalized-patches",
              pendingChanges: hasUnresolvedChanges ? finalizedStatuses : [],
            }
          : draft
      )
    )
    setActiveInsertionId(null)

    if (hasUnresolvedChanges) {
      setDraftError(
        "Some kept suggestions could not be applied cleanly and were marked unresolved in the review draft."
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08),transparent_35%),radial-gradient(circle_at_right,rgba(168,85,247,0.06),transparent_30%)] p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
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
                    : "Paste article text or provide two article URLs to scrape and compare."}
                </p>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-4">
              <Tabs
                value={articleInputMode}
                onValueChange={setArticleInputMode}
              >
                <TabsList className="grid h-auto w-full grid-cols-2 rounded-2xl bg-muted/50 p-1">
                  <TabsTrigger value="paste">Paste Text</TabsTrigger>
                  <TabsTrigger value="url">Compare URLs</TabsTrigger>
                </TabsList>

                <TabsContent value="paste" className="mt-6">
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
                </TabsContent>

                <TabsContent value="url" className="mt-6 space-y-6">
                  <div className="grid gap-6 lg:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Link2 className="h-5 w-5" />
                          Source URL
                        </CardTitle>
                        <CardDescription>
                          Scrape the article body and any in-body media from the
                          article you want to improve.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Input
                          type="url"
                          placeholder="https://example.com/source-article"
                          value={sourceUrl}
                          onChange={(e) => setSourceUrl(e.target.value)}
                        />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Sparkles className="h-5 w-5" />
                          Reference URL
                        </CardTitle>
                        <CardDescription>
                          Scrape the benchmark article, including article-body
                          images, videos, and embeds.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Input
                          type="url"
                          placeholder="https://example.com/reference-article"
                          value={referenceUrl}
                          onChange={(e) => setReferenceUrl(e.target.value)}
                        />
                      </CardContent>
                    </Card>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                      The scraper extracts readable article text first, then
                      appends embedded media details so the comparison can
                      account for article-body multimedia.
                    </p>
                    <Button
                      onClick={handleCompareUrls}
                      disabled={isScrapingUrls}
                      className="rounded-2xl"
                    >
                      {isScrapingUrls ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Scraping...
                        </>
                      ) : (
                        <>
                          <Link2 className="mr-2 h-4 w-4" />
                          Scrape URLs and Compare
                        </>
                      )}
                    </Button>
                  </div>

                  {(sourceScrape || referenceScrape) && (
                    <div className="grid gap-6 lg:grid-cols-2">
                      {[sourceScrape, referenceScrape].map((article, index) => {
                        if (!article) {
                          return null
                        }

                        return (
                          <Card
                            key={`${index}-${article.title ?? article.body.slice(0, 24)}`}
                          >
                            <CardHeader>
                              <CardTitle>
                                {index === 0
                                  ? "Scraped Source"
                                  : "Scraped Reference"}
                              </CardTitle>
                              <CardDescription>
                                {article.title ?? "Untitled article"}
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              <div className="flex flex-wrap gap-2">
                                <Badge variant="outline">
                                  {article.body.length.toLocaleString()} chars
                                </Badge>
                                <Badge variant="outline">
                                  {article.media.length} media items
                                </Badge>
                              </div>
                              {article.description && (
                                <p className="text-sm text-muted-foreground">
                                  {article.description}
                                </p>
                              )}
                              <div className="space-y-2">
                                <p className="text-sm font-medium text-foreground">
                                  Scraped body
                                </p>
                                <ScrollArea className="h-80 rounded-xl border bg-muted/20 p-3">
                                  <pre className="text-sm break-words whitespace-pre-wrap text-foreground">
                                    {article.body}
                                  </pre>
                                </ScrollArea>
                              </div>
                              {article.media.length > 0 && (
                                <div className="space-y-2 text-sm text-muted-foreground">
                                  {article.media.slice(0, 4).map((media) => (
                                    <div
                                      key={`${media.type}-${media.url}`}
                                      className="rounded-xl border bg-muted/30 px-3 py-2"
                                    >
                                      <div className="flex items-center gap-2 font-medium text-foreground">
                                        {media.type === "image" ? (
                                          <ImageIcon className="h-4 w-4" />
                                        ) : (
                                          <Video className="h-4 w-4" />
                                        )}
                                        {media.caption ??
                                          media.alt ??
                                          media.url}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <section className="rounded-[24px] border bg-background/80 p-4 shadow-sm backdrop-blur sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-medium">Current workflow</p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={sourceArticle.trim() ? "default" : "secondary"}>
                  {sourceArticle.trim() ? "Source ready" : "Add source"}
                </Badge>
                <Badge
                  variant={referenceArticle.trim() ? "default" : "secondary"}
                >
                  {referenceArticle.trim()
                    ? "Reference ready"
                    : "Add reference"}
                </Badge>
                <Badge variant={analysis ? "default" : "secondary"}>
                  {analysis ? "Analysis ready" : "Run analysis"}
                </Badge>
                <Badge variant="outline">{drafts.length} saved drafts</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {articleInputMode === "url"
                  ? "Scrape both URLs to populate the workspace, then iterate on analysis, drafts, or patch suggestions."
                  : "Start with the source and reference, then analyze before moving into draft or patch work."}
              </p>
            </div>
            <Button
              size="lg"
              onClick={
                articleInputMode === "url" ? handleCompareUrls : handleAnalyze
              }
              disabled={isAnalyzing || isScrapingUrls}
              className="min-w-[220px] rounded-2xl"
            >
              {isAnalyzing || isScrapingUrls ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {articleInputMode === "url" ? "Scraping..." : "Analyzing..."}
                </>
              ) : (
                <>
                  {articleInputMode === "url" ? (
                    <Link2 className="mr-2 h-4 w-4" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  {articleInputMode === "url"
                    ? "Scrape URLs and Compare"
                    : "Analyze Articles"}
                </>
              )}
            </Button>
          </div>
        </section>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {sourceArticle.trim() && (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.75fr)_340px] xl:items-start">
            <Card className="border-0 bg-background/80 shadow-sm backdrop-blur">
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
                            : activeDraft.mode === "finalized-patches"
                              ? "Reviewed Patch Draft"
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
                  {isPatchReviewSession && (
                    <span className="text-sm text-muted-foreground">
                      {pendingReviewQueue.length} pending of{" "}
                      {reviewQueue.length} suggestions
                    </span>
                  )}
                </div>

                {isPatchReviewSession ? (
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
                                      onClick={() =>
                                        item.status === "pending"
                                          ? setActiveInsertionId(item.id)
                                          : undefined
                                      }
                                      className={`rounded-lg border p-3 ${getChangeStatusClasses(item.operation, item.status)} ${
                                        item.id === activeInsertion?.id
                                          ? "ring-2 ring-sky-500/50"
                                          : ""
                                      } ${
                                        item.status === "pending"
                                          ? "cursor-pointer"
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
                                      {item.status === "pending" && (
                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={(event) => {
                                              event.stopPropagation()
                                              setActiveInsertionId(item.id)
                                              resolveInsertionById(
                                                item.id,
                                                "discarded"
                                              )
                                            }}
                                          >
                                            Discard
                                          </Button>
                                          <Button
                                            size="sm"
                                            onClick={(event) => {
                                              event.stopPropagation()
                                              setActiveInsertionId(item.id)
                                              resolveInsertionById(
                                                item.id,
                                                "kept"
                                              )
                                            }}
                                          >
                                            Keep
                                          </Button>
                                        </div>
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
                              <Button
                                size="sm"
                                onClick={handleEndReview}
                                disabled={reviewQueue.length === 0}
                              >
                                End Review
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
                                Finalize this review to save the kept patch
                                decisions as a new draft.
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
                            <Button onClick={handleEndReview}>
                              End Review
                            </Button>
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

            <Accordion type="single" collapsible className="w-full">
              <AccordionItem
                value="draft-diff"
                className="rounded-[24px] border bg-background/80 px-5 shadow-sm backdrop-blur"
              >
                <AccordionTrigger className="py-5 hover:no-underline">
                  <div className="flex w-full flex-col gap-3 text-left lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">Draft Diff</h2>
                      <p className="text-sm text-muted-foreground">
                        Highlighted text shows what changed from the source
                        article to the active draft.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        {addedSegmentCount} additions
                      </Badge>
                      <Badge variant="outline">
                        {removedSegmentCount} removals
                      </Badge>
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="pb-5">
                  {activeArticle === sourceArticle ? (
                    <div className="rounded-2xl bg-muted/35 px-4 py-5 text-sm text-muted-foreground">
                      {isPatchReviewSession
                        ? "Patch review decisions stay in preview mode until you end the review. Finalize the review to see the draft diff here."
                        : "No draft changes yet. Generate or review a draft to see the text differences here."}
                    </div>
                  ) : (
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-2xl border bg-background p-4">
                        <p className="mb-3 text-sm font-medium">
                          Source Article
                        </p>
                        <div className="text-sm leading-7 whitespace-pre-wrap">
                          {sourceDiffSegments.map((segment, index) => (
                            <span
                              key={`source-diff-${index}`}
                              className={
                                segment.type === "removed"
                                  ? "rounded bg-rose-500/15 text-rose-900 dark:text-rose-100"
                                  : undefined
                              }
                            >
                              {segment.text}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border bg-background p-4">
                        <p className="mb-3 text-sm font-medium">Active Draft</p>
                        <div className="text-sm leading-7 whitespace-pre-wrap">
                          {draftDiffSegments.map((segment, index) => (
                            <span
                              key={`draft-diff-${index}`}
                              className={
                                segment.type === "added"
                                  ? "rounded bg-emerald-500/15 text-emerald-900 dark:text-emerald-100"
                                  : undefined
                              }
                            >
                              {segment.text}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <aside className="space-y-4 xl:sticky xl:top-6">
              <Card className="border-0 bg-background/80 shadow-sm backdrop-blur">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Newspaper className="h-5 w-5" />
                    Action Rail
                  </CardTitle>
                  <CardDescription>
                    Generate headlines for the active article and iterate on
                    copy options without leaving the draft workspace.
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
                      <div className="rounded-2xl bg-muted/35 px-4 py-5 text-sm text-muted-foreground">
                        Generate three options in sensational, factual, and
                        authoritative tones.
                      </div>
                    ) : (
                      headlineSuggestions.map((item, index) => (
                        <div
                          key={`${item.tone}-${index}`}
                          className="rounded-2xl border bg-muted/20 px-4 py-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm leading-6 font-medium">
                              {item.headline}
                            </p>
                            <Badge
                              variant="outline"
                              className="shrink-0 text-xs"
                            >
                              {item.tone}
                            </Badge>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-muted-foreground">
                            {item.rationale}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </aside>
          </div>
        )}

        {analysis && (
          <div className="space-y-5">
            <section className="rounded-[24px] border bg-background/80 p-5 shadow-sm backdrop-blur">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Analysis workspace</p>
                  <p className="text-sm text-muted-foreground">
                    Review concrete fact gaps, higher-level recommendations,
                    tone shifts, and content coverage in one place.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline">
                    {analysis.factualDifferences.length} fact differences
                  </Badge>
                  <Badge variant="outline">
                    {analysis.actionableRecommendations.length} recommendations
                  </Badge>
                </div>
              </div>
            </section>

            <Tabs
              value={activeAnalysisTab}
              onValueChange={setActiveAnalysisTab}
              className="space-y-4"
            >
              <TabsList className="grid h-auto w-full grid-cols-2 rounded-2xl bg-muted/50 p-1 lg:grid-cols-4">
                <TabsTrigger value="facts">Fact Differences</TabsTrigger>
                <TabsTrigger value="tone">Tone Analysis</TabsTrigger>
                <TabsTrigger value="comparison">Comparison</TabsTrigger>
                <TabsTrigger value="recommendations">
                  Recommendations
                </TabsTrigger>
              </TabsList>

              <TabsContent value="facts" className="space-y-4">
                <section className="rounded-[24px] border bg-background/80 p-5 shadow-sm backdrop-blur">
                  <div className="flex flex-col gap-3 rounded-2xl bg-muted/35 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="flex items-center gap-2 text-base font-semibold">
                        <BookOpen className="h-5 w-5" />
                        Facts, figures, dates, and information differences
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Select the concrete reference-backed gaps and mismatches
                        you want to turn into reviewable patch suggestions.
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

                  <ScrollArea className="mt-4 h-[500px] pr-4">
                    <div className="space-y-3">
                      {analysis.factualDifferences.map((difference, index) => {
                        const checkboxId = `fact-difference-${index}`

                        return (
                          <div
                            key={index}
                            className="rounded-2xl border bg-background px-4 py-4 transition-colors hover:bg-muted/15"
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox
                                id={checkboxId}
                                checked={selectedFactDifferences.includes(
                                  index
                                )}
                                onCheckedChange={(checked) =>
                                  toggleFactDifference(index, checked === true)
                                }
                                className="mt-1"
                              />
                              <div className="min-w-0 flex-1 space-y-3">
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                  <Label
                                    htmlFor={checkboxId}
                                    className="cursor-pointer text-base leading-6"
                                  >
                                    {difference.summary}
                                  </Label>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="outline">
                                      {difference.type === "missing_in_source"
                                        ? "Missing"
                                        : "Mismatch"}
                                    </Badge>
                                    <Badge variant="secondary">
                                      {getFactKindLabel(difference.kind)}
                                    </Badge>
                                  </div>
                                </div>
                                <p className="text-sm leading-6 text-muted-foreground">
                                  {difference.impact}
                                </p>
                                <div className="grid gap-3 md:grid-cols-2">
                                  {difference.sourceText && (
                                    <div className="rounded-xl bg-rose-500/6 px-3 py-3">
                                      <p className="text-xs font-semibold tracking-wide text-rose-700 uppercase dark:text-rose-300">
                                        Source detail
                                      </p>
                                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                        {difference.sourceText}
                                      </p>
                                    </div>
                                  )}
                                  {difference.referenceText && (
                                    <div className="rounded-xl bg-emerald-500/6 px-3 py-3">
                                      <p className="text-xs font-semibold tracking-wide text-emerald-700 uppercase dark:text-emerald-300">
                                        Reference detail
                                      </p>
                                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                        {difference.referenceText}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>
                </section>
              </TabsContent>

              <TabsContent value="tone" className="space-y-4">
                <section className="rounded-[24px] border bg-background/80 p-5 shadow-sm backdrop-blur">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl bg-muted/30 p-5">
                      <div className="mb-4 space-y-1">
                        <h3 className="font-semibold">Source Article Tone</h3>
                        <p className="text-sm text-muted-foreground">
                          Tone analysis of your article
                        </p>
                      </div>
                      <div className="space-y-4">
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
                      </div>
                    </div>

                    <div className="rounded-2xl bg-muted/30 p-5">
                      <div className="mb-4 space-y-1">
                        <h3 className="font-semibold">
                          Reference Article Tone
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Tone analysis of the reference article
                        </p>
                      </div>
                      <div className="space-y-4">
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
                            {
                              analysis.toneAnalysis.referenceTone
                                .emotionalImpact
                            }
                          </p>
                        </div>
                        <div>
                          <h4 className="font-semibold">Appropriateness</h4>
                          <p className="text-sm text-muted-foreground">
                            {
                              analysis.toneAnalysis.referenceTone
                                .appropriateness
                            }
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border bg-background px-5 py-4">
                    <p className="text-sm font-medium">Tone comparison</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {analysis.toneAnalysis.toneComparison}
                    </p>
                  </div>
                </section>
              </TabsContent>

              <TabsContent value="comparison" className="space-y-4">
                <section className="rounded-[24px] border bg-background/80 p-5 shadow-sm backdrop-blur">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl bg-emerald-500/6 p-5">
                      <div className="mb-4 space-y-1">
                        <h3 className="font-semibold text-green-700 dark:text-green-300">
                          Unique to Source
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Points your article covers that the reference
                          doesn&apos;t
                        </p>
                      </div>
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
                    </div>

                    <div className="rounded-2xl bg-blue-500/6 p-5">
                      <div className="mb-4 space-y-1">
                        <h3 className="font-semibold text-blue-700 dark:text-blue-300">
                          Unique to Reference
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Points the reference covers that yours doesn&apos;t
                        </p>
                      </div>
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
                    </div>

                    <div className="rounded-2xl bg-purple-500/6 p-5">
                      <div className="mb-4 space-y-1">
                        <h3 className="font-semibold text-purple-700 dark:text-purple-300">
                          Both Cover Well
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Strong points in both articles
                        </p>
                      </div>
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
                    </div>

                    <div className="rounded-2xl bg-orange-500/6 p-5">
                      <div className="mb-4 space-y-1">
                        <h3 className="font-semibold text-orange-700 dark:text-orange-300">
                          Content Gaps
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Important points neither article covers
                        </p>
                      </div>
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
                    </div>
                  </div>
                </section>
              </TabsContent>

              <TabsContent value="recommendations" className="space-y-4">
                <section className="rounded-[24px] border bg-background/80 p-5 shadow-sm backdrop-blur">
                  <div className="flex flex-col gap-3 rounded-2xl bg-muted/35 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="flex items-center gap-2 text-base font-semibold">
                        <Lightbulb className="h-5 w-5" />
                        Actionable recommendations
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
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

                  <div className="mt-4 space-y-4">
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
                  </div>

                  <ScrollArea className="mt-4 h-[500px] pr-4">
                    <div className="space-y-3">
                      {analysis.actionableRecommendations.map((rec, index) => {
                        const checkboxId = `recommendation-${index}`

                        return (
                          <div
                            key={index}
                            className="rounded-2xl border bg-background px-4 py-4 transition-colors hover:bg-muted/15"
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox
                                id={checkboxId}
                                checked={selectedRecommendations.includes(
                                  index
                                )}
                                onCheckedChange={(checked) =>
                                  toggleRecommendation(index, checked === true)
                                }
                                className="mt-1"
                              />
                              <div className="min-w-0 flex-1 space-y-3">
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                  <Label
                                    htmlFor={checkboxId}
                                    className="cursor-pointer text-base leading-6"
                                  >
                                    {rec.recommendation}
                                  </Label>
                                  {getPriorityBadge(rec.priority)}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                  <span className="text-muted-foreground">
                                    Effort:
                                  </span>
                                  <Badge variant="outline">{rec.effort}</Badge>
                                </div>
                                <p className="text-sm leading-6 text-muted-foreground">
                                  {rec.impact}
                                </p>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>
                </section>
              </TabsContent>
            </Tabs>

            {usageMetrics && (
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem
                  value="run-metrics"
                  className="rounded-[20px] border bg-background/80 px-4 shadow-sm"
                >
                  <AccordionTrigger>Run Metrics</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pb-2">
                      <p className="text-sm text-muted-foreground">
                        Token usage, cost, and response time for the latest
                        analysis.
                      </p>
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                        <div className="rounded-2xl bg-muted/35 p-4">
                          <p className="text-sm text-muted-foreground">
                            Input tokens
                          </p>
                          <p className="text-2xl font-semibold">
                            {formatNumber(usageMetrics.inputTokens)}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-muted/35 p-4">
                          <p className="text-sm text-muted-foreground">
                            Output tokens
                          </p>
                          <p className="text-2xl font-semibold">
                            {formatNumber(usageMetrics.outputTokens)}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-muted/35 p-4">
                          <p className="text-sm text-muted-foreground">
                            Total tokens
                          </p>
                          <p className="text-2xl font-semibold">
                            {formatNumber(usageMetrics.totalTokens)}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-muted/35 p-4">
                          <p className="text-sm text-muted-foreground">Cost</p>
                          <p className="text-2xl font-semibold">
                            {formatCost(usageMetrics.costUsd)}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-muted/35 p-4">
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
