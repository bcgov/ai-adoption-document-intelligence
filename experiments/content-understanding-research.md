# How Azure Content Understanding Works Internally: A Deep Dive into Its 2‑Step Pipeline

Azure Content Understanding (ACU) — now positioned in "Microsoft Foundry Tools" since the November 2025 general‑availability release (API version `2025-11-01`) — is, under the hood, a managed two‑stage pipeline that pairs Microsoft's specialized OCR/layout models (the same family that powers Azure Document Intelligence) with a customer‑provided Foundry LLM deployment (GPT‑4.1, GPT‑4.1‑mini, GPT‑5‑class, etc.). Microsoft has been unusually explicit about this design in its GA documentation and in Joe Filcik's GA announcement blog: *"Content Understanding pairs specialized models and generative AI where each excels: specialized models handle OCR, Layout, Transcription and produce confidence scores, while GenAI powers field extraction, segmentation, and figure analysis."*

The rest of this report unpacks what that means concretely — what runs in step 1, what is passed to the LLM in step 2, what the intermediate representation looks like, and where the service behaves differently from a hand‑rolled Document Intelligence + GPT pipeline.

## 1. Step 1 — Content Extraction: the OCR/layout stage

The first stage of the ACU pipeline is called **Content Extraction**. According to the official Microsoft Learn overview ("What is Azure Content Understanding in Foundry Tools?"), Content Extraction *"transforms unstructured input into normalized, structured text and metadata. Extracts text using optical character recognition (OCR), identifies selection marks and barcodes, detects formulas, and recognizes layout elements like paragraphs, sections, and tables. For audio and video, transcribes speech and identifies key visual elements."*

Microsoft documentation makes it clear that this stage is **not** a brand‑new OCR engine — it is the same Document Intelligence OCR/Layout stack, repackaged and re‑exposed inside Content Understanding:

- The "Choose the right Foundry tool" guidance page states that *"Azure Content Understanding, built on the same foundational capabilities as Document Intelligence, extends document scenarios to images and embedded content."* It lists Content Understanding as having "industry leading OCR" identical in description to the one offered by Document Intelligence.
- The What's New page for Content Understanding announces: *"`prebuilt-read` and `prebuilt-layout` analyzers now bring key Document Intelligence capabilities to Content Understanding."* The two prebuilts share the names of Document Intelligence's `prebuilt-read` (Read OCR) and `prebuilt-layout` (Layout) models.
- Microsoft Learn's Document Intelligence Read documentation describes the `Read` model as *"the underlying OCR engine for other Document Intelligence prebuilt models like Layout, General Document, Invoice, Receipt, Identity (ID) document, Health insurance card, W2 in addition to custom models."* This Read model is what now powers the Read/Layout analyzers inside Content Understanding.
- The GA What's New notes that the Read and Layout prebuilts in Content Understanding *"no longer require specifying a model (LLM)"* and *"can be used even if no model is defined in `contentunderstanding/defaults`."* This confirms that the extraction step is a separate, non‑LLM specialized model — distinct from the GenAI step.
- A recent Microsoft Q&A thread covering anomalous behavior where ACU's `prebuilt-layout` returns empty content while Document Intelligence's `prebuilt-layout` (API `2024-11-30`) on the same key/document returns full OCR is explicitly addressed by Microsoft as a difference in **engine and purpose**, not a difference in core OCR availability — confirming the engines are related but tuned differently. Microsoft's response says: *"Document Intelligence prebuilt-layout is optimized for general OCR and layout extraction... Content Understanding prebuilt analyzers are designed for higher‑level content extraction, RAG, and domain‑specific scenarios, not as a drop‑in replacement for raw OCR."*

So to answer the first question directly: **Step 1 of Content Understanding uses Microsoft's Document Intelligence OCR/Layout models (the Read and Layout family) under the hood**, exposed as the `prebuilt-read` and `prebuilt-layout` analyzers and applied automatically when running any higher‑level (RAG, invoice, custom, etc.) analyzer. For audio/video inputs the equivalent specialized model is Microsoft's speech‑to‑text (transcription) pipeline. These models run *without invoking any LLM* and generate the structured intermediate output that the second stage consumes.

A nuance worth noting: as with Document Intelligence itself, Microsoft confirms in a separate Q&A that the OCR pipeline is applied to **every** PDF — including digitally generated PDFs with an embedded text layer — to guarantee consistent layout and normalization output rather than trusting an unreliable embedded text layer.

## 2. The intermediate representation passed between stages

The output of Content Extraction is the canonical "intermediate representation" the second stage receives. It is **not** raw text and it is **not** the original document bytes — it is a structured JSON result whose centerpiece is a **layout‑aware Markdown string**, with parallel structural metadata (pages, paragraphs, sections, tables, figures, words, bounding boxes, character spans, and confidence scores) hanging off of it.

The official "Document Analysis: Extract Structured Content" reference documents the exact response shape:

```json
{
  "result": {
    "contents": [
      {
        "markdown": "# Example Document\n\n## 1. Selection Marks ...\n☐ Remote ☒ Hybrid ☐ On-site\n...",
        "fields": { /* extracted field values (filled in stage 2) */ },
        "kind": "document",
        "startPageNumber": 1, "endPageNumber": 2, "unit": "inch",
        "pages":      [ /* page-level elements with words + bounding polygons */ ],
        "paragraphs": [ /* role-tagged paragraphs: title, sectionHeading, etc. */ ],
        "sections":   [ /* hierarchical section trees */ ],
        "tables":     [ /* row/column-aware cells with HTML-ish structure */ ],
        "figures":    [ /* with Chart.js / Mermaid representations */ ],
        "hyperlinks": [...], "annotations": [...]
      }
    ]
  }
}
```

Key properties of this intermediate representation:

- **Markdown is the primary surface.** Microsoft says Content Extraction *"generates richly formatted Markdown that preserves the original document's structure. For this reason, large language models can better comprehend document context and hierarchical relationships for AI-powered analysis and generation tasks. In addition to words, selection marks, barcodes, formulas, and images as content, the Markdown also includes sections, tables, and page metadata for both visual rendering and machine processing."* Tables are emitted as HTML‑style `<table><tr><th>...` markup inline in the Markdown so structure is preserved; checkboxes are emitted with Unicode `☒/☐`; formulas as LaTeX; page breaks as `<!-- PageBreak -->` HTML comments; figures wrapped in `<figure>` tags.
- **Every element has a `span` (character offset and length into the Markdown string) and a `source` (page number + bounding polygon or axis‑aligned bounding box)**. This dual representation lets downstream steps simultaneously do text reasoning *and* later map any LLM‑extracted answer back to a pixel region on a page. Page numbers are one‑indexed; bounding polygons are 4‑point quadrilaterals in inches (PDFs) or pixels (images).
- **Figures and charts get rich generative enrichment.** When `enableFigureAnalysis` / `enableFigureDescription` are on, charts are converted to Chart.js JSON and diagrams to Mermaid.js source code, and inserted into the Markdown — the GA blog highlights this as a major upgrade over Document Intelligence: *"Parse figures and convert charts/diagrams into structured representations (Chart.js, Mermaid.js)"*.
- **Multi‑page tables are stitched together** into a single Markdown/JSON table, another upgrade beyond Document Intelligence Layout.
- **Confidence scores attach to OCR words and (optionally) to every extracted field.** Setting `estimateFieldSourceAndConfidence = true` makes confidence + source bounding boxes available for stage‑2 outputs.

For audio/video the intermediate representation is also Markdown: transcripts are emitted as WebVTT inside the `markdown` field with `<v Speaker N>` tags for diarization, time‑coded segments, etc.

The new GA SDKs include a helper, `to_llm_input()`, that *"formats Content Understanding field extraction results into markdown with YAML frontmatter, making it easier to pass structured output directly to language models."* This is the same Markdown‑plus‑frontmatter convention the service uses internally to feed downstream models.

## 3. Step 2 — Field Extraction: what actually gets sent to the LLM

The second stage is called **Field Extraction**, and it runs on top of the structured Markdown/JSON produced in step 1. Microsoft's GA blog summarizes the split: *"specialized models handle OCR, Layout, Transcription and produce confidence scores, while GenAI powers field extraction, segmentation, and figure analysis."*

What is sent to the LLM is **not** the original PDF/image/audio file, **not** raw OCR token output, and **not** the user's free‑form prompt. Instead, ACU performs a layer Microsoft calls **Contextualization**, described in the overview as *"Content Understanding's processing layer that prepares context for generative models and post‑processes their output. Includes output normalization and formatting, source grounding calculation, confidence score computation, and context engineering to optimize model usage."* In practice this means the service builds the LLM prompt itself, programmatically, from:

1. **The layout‑aware Markdown** produced by step 1 (with tables as HTML, headings, sections, page breaks, figure descriptions, Mermaid/Chart.js for charts, WebVTT for audio/video, etc.) — this is the document context fed into the model.
2. **The analyzer's schema** — the JSON schema the customer defined for the analyzer (field names, types, descriptions, optional in‑context labeled examples, classification categories). Microsoft's best‑practice docs explicitly warn that *"extraction quality is heavily dependent on the way you name the fields and description of the fields"* — because the field name and description are effectively the prompt the LLM sees per field.
3. **Optional in‑context learning examples** — when labeled samples have been provided, the analyzer uses embeddings (typically `text-embedding-3-large`) to retrieve relevant labeled samples and inject them into the prompt at analysis time. This is why ACU requires both a chat completion *and* an embedding model deployment when training examples are used.
4. **System‑managed instructions** for grounding, confidence estimation, output normalization (date formats, currency, etc.), and post‑processing rules defined in field descriptions.

The model is **not** given the original document image (Content Understanding is a text/Markdown‑based GenAI pipeline, not a multimodal VLM pipeline at this layer). All "vision" understanding is done in stage 1 by the specialized OCR/layout/figure models; stage 2 reasons over the Markdown text plus structured metadata.

Which LLM runs in stage 2 is **chosen by the customer**. Since GA, ACU uses your Foundry model deployments — you point the analyzer's defaults at deployment names of e.g. `gpt-4.1`, `gpt-4.1-mini`, mini/nano variants, or any supported Foundry model (and an embedding model such as `text-embedding-3-large`). The Foundry model token usage is billed through your own model deployment, while ACU bills you separately for **content extraction tokens** (per page / per minute of media) and for **contextualization tokens** (a fixed‑rate "input wrapping" charge based on file size, e.g. 1,000 contextualization tokens per page in Standard mode).

After the LLM returns, ACU post‑processes the response: it parses the structured output, computes confidence scores per field, locates each field value back in the original Markdown (using the field's character span and the Markdown→bounding‑box map kept from stage 1) to produce **grounding** (page number + bounding polygon for each extracted value), runs any normalization rules, and emits the final JSON response with the `fields` object populated alongside the same `markdown` / `pages` / `tables` / `figures` from stage 1.

In **Pro mode** (preview, `2025-05-01-preview` API) the same stage‑2 architecture is extended to accept *multiple* input files plus external reference data and to perform multi‑step reasoning over them — but the underlying split is the same: specialized extraction per file, then a reasoning model called over the combined structured/Markdown context.

## 4. Where to find Microsoft's primary documentation

The most authoritative references on the architecture are:

- **"What is Azure Content Understanding in Foundry Tools?"** (`learn.microsoft.com/en-us/azure/ai-services/content-understanding/overview`) — contains the canonical framework diagram and the "Key components" table that names Content Extraction, Segmentation, Field Extraction, Contextualization, and Foundry Models as distinct pipeline stages.
- **"Azure Content Understanding in Foundry Tools document solutions"** (`.../content-understanding/document/overview`) — details what Content Extraction produces.
- **"Document Analysis: Extract Structured Content"** (`.../content-understanding/document/elements`) — the JSON/Markdown schema reference; this is the clearest single document showing exactly what the intermediate representation looks like.
- **"Choose the right Foundry tool for document processing"** (`.../content-understanding/choosing-right-ai-tool`) — explicitly states that Content Understanding is *built on the same foundational capabilities as Document Intelligence* and compares the three approaches (Document Intelligence, Content Understanding, build‑your‑own with Foundry models).
- **"Pricing for Azure Content Understanding"** (`.../content-understanding/pricing-explainer`) — explains the three‑component cost model (Content Extraction + Contextualization + your own Foundry model tokens), which directly reveals the pipeline structure.
- **"What's new in Content Understanding"** (`.../content-understanding/whats-new`) — confirms `prebuilt-read` and `prebuilt-layout` were imported from Document Intelligence, and documents the `to_llm_input()` helper that formats results as Markdown + YAML frontmatter.
- **GA announcement blog**, Joe Filcik, "Azure Content Understanding is now generally available", Microsoft Foundry Blog, November 25, 2025 — contains the clearest statement of the two‑stage architecture: specialized models for OCR/Layout/Transcription, GenAI for field extraction / segmentation / figure analysis, with Foundry model deployments now plugged in by the customer.
- **Bruno Lucas's blog**, "The new Content Understanding and how it compares to Document Intelligence" (May 2025) — independent comparison, useful for understanding the schema‑driven vs. label‑driven distinction vs. Document Intelligence.

## 5. How this differs from a hand‑rolled Document Intelligence + GPT pipeline

A custom pipeline that calls Document Intelligence `prebuilt-layout` and then feeds the Markdown output into your own GPT prompt is *architecturally similar* to what ACU does internally — but Microsoft's documentation and customer Q&A traffic surface several concrete differences:

1. **ACU is grounding‑forced and schema‑driven, not free‑form.** Microsoft's own Q&A guidance states that *"Content Understanding forces grounding — anchoring outputs in the text of the input documents — and will not return answers if they cannot be grounded."* If the analyzer is uncertain or cannot map a value back to a span/bounding box in the OCR output, it will return an empty value rather than hallucinate. A custom GPT pipeline would happily return text without traceable grounding.

2. **Stage‑1 behavior can be more aggressive than raw Document Intelligence.** The same Q&A documents a real case where ACU's `prebuilt-layout` returned an empty markdown/zero pages/zero words result for a PDF that Document Intelligence's `prebuilt-layout` (`2024-11-30`) parsed without issue (2,780 chars, 2 pages, 401 words). Microsoft confirmed this is by design: ACU's prebuilts are tuned for "higher‑level content extraction, RAG, and domain‑specific scenarios" and apply stricter grounding/quality thresholds, not as a "drop‑in replacement for raw OCR." If your scenario needs every legible glyph extracted no matter what, Microsoft still recommends Document Intelligence's Read/Layout directly. Litellm has also reported an issue (#25687) that ACU/Document Intelligence's `prebuilt-layout` Markdown output can be flattened compared to alternative OCR engines like Mistral OCR, suggesting that the "layout‑aware" Markdown is structurally simpler than some users expect — though tables and headings *are* preserved.

3. **Stage‑2 prompt engineering is hidden and managed.** The customer never writes a prompt — they define a JSON schema with field names, types, descriptions, and optional examples. ACU's Contextualization layer builds the actual prompt, handles in‑context‑example retrieval (with embeddings), normalizes output (currency, dates), and computes confidence. A custom pipeline must do all of this manually.

4. **Confidence scores and grounding are first‑class.** A custom GPT call returns text only; you would need to design your own logprob‑based or LLM‑judge confidence layer and rebuild a span→bounding‑box map. ACU's `estimateFieldSourceAndConfidence` setting yields a per‑field confidence value (0–1) and a back‑pointer (page, polygon, span offset/length) for each extracted value.

5. **Multimodal unification.** The same analyzer abstraction works across documents, images, audio, and video — Microsoft emits a consistent JSON schema with a `markdown` field regardless of modality (WebVTT inside `markdown` for audio/video). A custom pipeline would need to chain Document Intelligence for documents, Whisper/Speech for audio, Video Indexer for video, etc.

6. **Cost model is partly opaque.** You pay Microsoft for content extraction (per page/per minute) and contextualization (a fixed token rate based on input size), and you pay your own Foundry deployment for the LLM tokens consumed inside stage 2. The contextualization fee is essentially the price of Microsoft's managed prompt engineering, retry logic, grounding back‑mapping, and post‑processing — costs that a custom pipeline would absorb in its own engineering time. Standard mode charges 1,000 contextualization tokens per page; Pro mode is more expensive per call because reasoning consumes substantially more tokens.

7. **GA‑level features that are non‑trivial to replicate.** GA‑announced capabilities like multi‑page table stitching, Chart.js / Mermaid.js generation for figures, automatic document splitting + per‑segment routing to different analyzers, complex object schemas with nesting depth up to 7, and Pro‑mode multi‑file reasoning are first‑class in ACU but would each be significant engineering projects on a custom Document Intelligence + GPT stack.

8. **Known limitations of the ACU pipeline vs. a custom one.** Beyond the "grounding‑forced empty output" behavior, current public limitations include: bounding polygons are only four‑point quadrilaterals (no curved shapes); `source` (bounding box) information is only populated for rendered files (PDF/image), not for Office/HTML/text inputs that have no rendered pages; annotations (highlights, underlines) are only supported on digital PDFs; DOCX/EML inputs require Pro mode in certain regions; and the service is region‑limited (12 GA regions as of the November 2025 release). Because the LLM never sees the raw image, anything missed at the OCR layer is *also* lost to the LLM — whereas a custom VLM‑based pipeline that feeds page images directly to GPT‑4o/5 can sometimes recover content that OCR drops (at higher cost and lower throughput).

## Bottom Line

Internally, Azure Content Understanding is exactly the two‑step architecture you suspected:

- **Step 1** uses Microsoft's Document Intelligence OCR / Layout / Transcription models (now exposed as `prebuilt-read` and `prebuilt-layout` inside ACU, and equivalent specialized speech/vision models for audio/video). No LLM is involved here, and customers can in fact call this step standalone without configuring any Foundry model.
- **The intermediate representation** is a structured JSON document whose primary surface is a **layout‑aware Markdown string** (with HTML‑style tables, Unicode selection marks, LaTeX formulas, `<figure>` blocks, `<!-- PageBreak -->` markers, Chart.js/Mermaid for charts, WebVTT for audio), supplemented by parallel arrays of `pages`, `paragraphs`, `sections`, `tables`, `figures`, `words`, with each element carrying a `span` (offset into the Markdown) and a `source` (page + bounding polygon) plus confidence scores.
- **Step 2** sends this Markdown plus the analyzer's schema (field names, descriptions, types, and optionally retrieved labeled examples) — *not* the raw file, not a user prompt — to a Foundry LLM deployment that the customer brings (GPT‑4.1, GPT‑4.1‑mini, etc.). The service handles prompt construction, in‑context‑example retrieval (via an embeddings model), output parsing, confidence scoring, normalization, and grounding back to bounding polygons in a managed "Contextualization" layer.

Compared to manually chaining Document Intelligence + GPT, ACU trades flexibility for managed prompt engineering, grounding, confidence, multimodality, and integration with Azure AI Search / Foundry IQ — at the cost of a stricter grounding policy that can return empty values where raw OCR would still return text, and at the cost of an additional "contextualization" fee on top of your own Foundry model tokens.