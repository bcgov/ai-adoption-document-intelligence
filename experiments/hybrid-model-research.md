# Commercial and Open-Source OCR/Document Services That Send the Actual Image to a VLM (Not Just OCR Text)

## TL;DR
- **Yes, several services genuinely send the document image to a VLM** (rather than OCR text only): **Reducto, LandingAI Agentic Document Extraction (ADE), LlamaParse Premium / `parse_page_with_lvm` mode, Tensorlake (with `skip_ocr=True`), Unstructured's new Generative Refinement, and Google Document AI's Gemini-powered Layout Parser**. The vendors that look "OCR-text-only" (Mistral OCR, Azure Content Understanding's OCR-then-LLM path, AWS Textract+Bedrock text path) either pass only the OCR string downstream or are themselves end-to-end vision-encoder→text-decoder models that never expose the image to a separately promptable LLM.
- **The hybrid "OCR markdown + original page image into a VLM" pattern the user is running is exactly Allen AI's olmOCR "document anchoring" approach** — published Feb 2025 in arXiv:2502.18443. The paper shows this dual input cuts hallucinations versus image-only VLM prompting and beats image-only Mistral OCR on olmOCR-Bench (75.5% vs 72.0%). It's a well-validated pattern, not an oddball workflow.
- **Why most services don't pass the image alongside OCR text**: a full-page image at native resolution costs ~1,000–4,000 vision tokens per page, making per-page costs 10–20× higher than OCR-only pipelines; latency rises ~3–10× because of the vision encoder pass and longer decoder generation; and for large RAG ingest jobs (hundreds of thousands of pages) Reducto and others explicitly say "relying solely on a VLM would constrain downstream reasoning—VLMs are slower, less scalable, and less mature than text-only LLMs."

## Key Findings

### 1. Services that DO send the document image to a VLM (not just OCR text)

| Service | Image sent to VLM? | Architecture | Evidence |
|---|---|---|---|
| **Reducto** (Parse / Extract / Agentic OCR) | Yes — multi-pass VLM review on document image regions | Layout-first CV → VLM review of each region → multi-pass Agentic OCR feedback loop | "Vision-language models then interpret each region in context—linking labels to values, understanding tables, and classifying segments." (reducto.ai) |
| **LandingAI Agentic Document Extraction (ADE)** | Yes — "sees documents visually" | Visual perception + agentic orchestration; every extracted value carries a bounding-box back to the page image | "Agentic Document Extraction sees documents visually and uses an iterative workflow to accurately extract text, figures, form fields, charts, and more." (landing.ai) |
| **LlamaParse Premium** (`parse_page_with_lvm`, `parse_page_with_agent`) | Yes — page screenshot fed to GPT-4o / Claude / configurable VLM | "LlamaParse will first extract a layered text and take a screenshot of each page of a document. Then it will use an agentic process to feed it to a Large Language Model / Large vision model for reconstruction of the page structure." (docs.cloud.llamaindex.ai) |
| **Tensorlake** (DocumentAI with `skip_ocr=True`) | Yes — VLM directly on document image | Recommends skipping OCR for hardest documents: "This will make use of a Vision Language Model trained to extract JSON from Document Images." (docs.tensorlake.ai) |
| **Unstructured.io** (Generative Refinement, 2025) | Partial — per-element VLM, not full page | "All text elements are sent to a VLM to extract the highest-fidelity version of the content. This precise targeted optimization significantly improves accuracy of textual outputs compared to standard OCR alone or using VLMs on entire pages." (unstructured.io) |
| **Google Document AI Layout Parser v1.6 (Pro)** | Yes — Gemini 3 Pro/Flash directly | Per the Document AI release notes, processor model `pretrained-layout-parser-v1.6-pro-2025-12-01` is "powered by Gemini 3 Pro LLM" (Preview); v1.6 Flash (`pretrained-layout-parser-v1.6-2026-01-13`) is "powered by Gemini 3 Flash LLM." Gemini 3 natively renders PDF pages as images (billed under the IMAGE modality). |
| **Nanonets-OCR-s / OCR2** | Yes — end-to-end VLM (Qwen2.5-VL-3B fine-tune) | "OCR-free extraction of structured information from documents" using a 3B VLM directly on the page image. (nanonets.com / huggingface.co) |
| **olmOCR / olmOCR-2** (Ai2, open) | Yes, plus extracted PDF text as anchors | The reference implementation of OCR-text + image dual input to a VLM (Qwen2-VL-7B / Qwen2.5-VL-7B). (arxiv.org/abs/2502.18443) |

### 2. Services that primarily pass **OCR text only** to the LLM (matching the user's complaint)

- **Mistral Document AI / Mistral OCR**: This is actually a vision-encoder + text-decoder VLM (Pixtral-family). The image goes in, markdown comes out — but **the VLM is not user-promptable for downstream extraction**, so when you chain it to a separate LLM for structured extraction, only the OCR markdown reaches your extraction LLM. The image is never re-attached. CodeSOTA's architectural review: "Mistral OCR 3 is a pure OCR model. It extracts text from images but cannot answer questions about the content, interpret charts, or perform reasoning. For those tasks, you need a full VLM (GPT-5.4, Claude Sonnet 4.6, Qwen-VL)."
- **Azure AI Content Understanding** (and the older Document Intelligence + Azure OpenAI pattern): the documented flow is OCR → extracted text → LLM. The Microsoft Tech Community walkthrough of "LlamaParse + Azure OpenAI" explicitly chains "parsed_text_markdown from LlamaParse" into Azure OpenAI; the image isn't re-attached.
- **AWS Textract + Bedrock**: the canonical AWS architecture (Textract → text → Claude/Llama via LangChain) is text-only. Cloudavian's blog states the explicit rationale: "Sending a full-page document image to a multimodal LLM costs roughly 10-20x what Textract charges for the same page. When you're processing thousands of documents, that adds up fast." The image is only sent to a multimodal model "for truly bad scans" as a fallback.
- **Docugami**: Their published Business Document Foundation Model is multimodal (vision + text + semantic structure), but it's a proprietary closed model — the value users see is XML knowledge graphs and KG-RAG outputs. The image is fed only to the internal foundation model, not chained to a customer-side VLM.
- **Mindee / Klippa / classic IDP vendors**: Per-document OCR API + downstream LLM. Mindee's own marketing now openly contrasts "LLM tokens" vs "flat per-document OCR pricing" and recommends OCR-then-LLM "hybrid architectures."

### 3. The "OCR markdown + original image into a VLM" pattern has a name: **document anchoring** (olmOCR, Ai2, Feb 2025)

This is exactly what the user is doing. The seminal description from the olmOCR paper (arXiv:2502.18443):

> "document-anchoring extracts coordinates of salient elements in each page (e.g., text blocks and images) and injects them alongside raw text extracted from the PDF binary file. Crucially, the anchored text is provide[d] as input to any VLM alongside a rasterized image of the page."

And critically:

> "Overall, we find that using prompts constructed using document-anchoring results in significantly fewer hallucinations. Prompting with just the page image was prone to models completing unfinished sentences, or to invent larger texts when the image data was ambiguous."

The prompt template (verbatim, from the paper's Appendix A):

> "Below is the image of one page of a PDF document, as well as some raw textual content that was previously extracted for it that includes position information for each image and block of text … Do not hallucinate. RAW_TEXT_START {base_text} RAW_TEXT_END"

Token budget: about **1,000 tokens for the page image + 1,800 tokens for the anchor text ≈ 3,000 input tokens per page**, capped at 6,000 anchor characters and 8,192 total tokens.

Cost numbers from the same paper (Table 3): self-hosted olmOCR on an H100 or L40S processes ~5,200 pages per USD ≈ **$190 per million pages**, versus ~$6,240 per million for GPT-4o Batch and ~$12,480 for GPT-4o synchronous. olmOCR-2 (Oct 2025, GRPO fine-tuned, FP8) reaches ~3,400 tokens/sec on a single H100 — "10,000 pages for less than $2."

Notably, olmOCR-2 itself **de-emphasized the anchor text input** (`build_no_anchoring_v4_yaml_prompt`), and Reducto's RolmOCR fork dropped it entirely, on the bet that newer Qwen2.5-VL vision encoders are strong enough that born-digital PDF text no longer adds enough lift to justify the prompt length. The community is split.

### 4. Why most commercial services don't send the image alongside OCR text

Four reinforcing reasons:

1. **Cost.** Cloudavian (AWS practitioner blog): "Sending a full-page document image to a multimodal LLM costs roughly 10-20x what Textract charges for the same page." Mindee, Reducto, and LandingAI all advertise per-page OCR pricing precisely because token-based VLM costs blow up at enterprise scale.
2. **Latency.** Reducto: "VLMs are slower, less scalable, and less mature than text-only LLMs." Vision encoders add a fixed forward pass per page; image-token expansion (often 1k+ tokens/page) lengthens decode.
3. **Token-window pressure.** A 50-page document at native resolution is on the order of 50k–200k vision tokens — often exceeding practical context windows or destroying speed.
4. **Hallucination risk on image-only VLM.** Cloudavian again: "When you send a document image to an LLM, it reads the text but loses the spatial relationships. A table that's obvious to a human can confuse an LLM when columns aren't clearly aligned." Reducto/Anthropic-style "agentic OCR" multi-pass approaches were invented specifically to keep VLMs from inventing content. The olmOCR paper independently corroborates: "Prompting with just the page image was prone to models completing unfinished sentences, or to invent larger texts."
5. **Architectural inertia.** Legacy IDP pipelines (Textract, Azure Document Intelligence, Tesseract+LangChain) were built before competent VLMs existed; their default outputs are key-value JSON and text, which integrate trivially with text-only LLMs.

### 5. "Vision-first" / "VLM-native" vs traditional OCR pipelines

Three distinguishable architectures dominate in 2025–2026:

- **Pipeline OCR-then-LLM** (Azure Content Understanding default, AWS Textract+Bedrock default, classic Unstructured): text-only LLM never sees pixels. Cheap, deterministic, but blind to charts, signatures, checkboxes, layout.
- **End-to-end VLM-native** (Mistral OCR, Nanonets-OCR-s/OCR2, DeepSeek-OCR, dots.ocr, PaddleOCR-VL, Tencent HunyuanOCR, olmOCR-2 without anchors): a single vision-encoder + text-decoder model produces Markdown/HTML/JSON directly from the page image. Strong on layout and tables, can hallucinate on degraded scans.
- **Hybrid OCR + VLM (the user's pattern)**: deterministic OCR for the text layer + page image both go into a generalist VLM (GPT-5-class, Claude, Gemini). Best accuracy on the olmOCR-Bench; reduces hallucinations vs image-only and reduces structural loss vs text-only. Reducto's Agentic OCR is the commercial productized version; olmOCR is the open reference; the user's pipeline is the DIY version.

### 6. Recent 2025–2026 developments worth tracking

- **olmOCR-2** (Oct 22, 2025, Ai2): adds GRPO reinforcement learning with unit-test rewards. Per the Ai2 blog "olmOCR 2: Unit test rewards for document OCR": "olmOCR 2 scores 82.4 points on our olmOCR-Bench … a +14.2 point overall improvement over our initial release six months prior." Output switches to YAML; FP8 quantized.
- **Google Document AI Layout Parser v1.6 Pro** (`pretrained-layout-parser-v1.6-pro-2025-12-01`, Preview, Dec 1, 2025): powered by Gemini 3 Pro. v1.6 Flash (`pretrained-layout-parser-v1.6-2026-01-13`, Preview): powered by Gemini 3 Flash. Both are full multimodal models running on the actual page rendering.
- **Reducto $24.5M Series A** (April 25, 2025, led by Benchmark; total funding $32.9M, per GlobeNewswire): "Reducto, the most accurate ingestion platform for unlocking unstructured data for AI pipelines, announced today that it has raised a $24.5M series A round of funding led by Benchmark, alongside existing investors First Round Capital, BoxGroup and Y Combinator." Coincided with launch of multi-pass Agentic OCR and a dedicated chart-to-data VLM.
- **HunyuanOCR (Tencent, Nov 25, 2025)**: 1B-parameter end-to-end VLM. Per Tencent HunyuanOCR GitHub: "Achieves a SOTA score (860) on OCRBench for models under 3B parameters and a leading 94.1 on OmniDocBench for complex document parsing."
- **DeepSeek-OCR** (Oct 2025): introduces "optical token compression" — at 10× compression ratio, 97% OCR precision with 1 vision token per 10 text tokens; reframes VLM cost equation.
- **NVIDIA Nemotron Parse 1.1**: NIM-deployable transformer VLM for "structured content curation."
- **Tencent / xAI / Anthropic vision models**: GPT-5 series and Claude 4.x now treat document images as a first-class input modality.
- **Tensorlake, Mar 2025**: explicit `skip_ocr=True` mode that routes hard documents (scanned, engineering diagrams) directly to a VLM, bypassing the OCR layer.

### 7. Community discussion of the exact pattern

- **Simon Willison (Feb 26, 2025)**: "The most interesting idea from the technical report is something they call 'document anchoring' … the anchored text is provided as input to any VLM alongside a rasterized image of the page."
- **TNG Technology Consulting (July 2025) on Hugging Face**, after fine-tuning olmOCR to be more faithful: "the purpose of this model is to extract the text layer in a preprocessing step, to enrich the prompt given to the LLM to reduce hallucination."
- **Reducto chart-extraction blog (2025)**: "Since these documents often mix text with figures, tables, and charts, relying solely on a VLM would constrain downstream reasoning—VLMs are slower, less scalable, and less mature than text-only LLMs." This is why even vision-forward Reducto still combines CV + VLM + text-LLM rather than purely VLM end-to-end.
- **DEV.to / kesimo (2025)**: "Traditional OCR handles what it excels at: extracting raw text with high accuracy and minimal computational cost. Vision Language Models (VLMs) handle what OCR cannot: understanding layout, detecting styles, reconstructing document structure. This is not a competition. It is a stack."

The community trajectory has actually been to move from anchored hybrid (olmOCR-1, Reducto) **back toward image-only VLM after good fine-tuning** (olmOCR-2's no-anchor prompt, Reducto's RolmOCR variant). The user's GPT-5.2 + OCR-markdown + image stack is a third path: keep the deterministic OCR text as a "safety rail" against VLM hallucination, but rely on a frontier generalist VLM rather than a domain-specific small model.

## Details

### How each vendor handles the image (verified architecture notes)

**Reducto** publishes the most detailed hybrid architecture description of any commercial vendor:
- Stage 1: computer-vision layout detection (regions, bounding boxes, reading order).
- Stage 2: VLM review of each detected region — the cropped image of the region goes to a VLM.
- Stage 3: "Agentic OCR" multi-pass — a controller re-prompts the VLM with low-confidence regions, treating them like a human reviewer would.
- Output: structured JSON with bounding-box citations.
- This is the closest commercial analog to the user's pattern, and Reducto's own benchmark (RD-TableBench) shows ~0.90 similarity vs AWS/Google/Azure at ~0.70.

**LandingAI ADE** doesn't publish its model stack but documents the behavior:
- Bounding-box visual grounding on every extracted value.
- Schema-driven extraction with iterative agentic orchestration.
- "Goes beyond OCR+LLM" — the public marketing explicitly distinguishes ADE from "uploading PDFs directly into ChatGPT" and from OCR-then-LLM pipelines.
- LandingAI's "DocVQA Benchmark: 99.16% Accuracy Using Agentic Document Extraction" blog (landing.ai): "We ran on the DocVQA validation split and got 5,286 correct out of 5,331 (99.16%). The key takeaway: an LLM can answer 99.16% of DocVQA questions using only the parsed API response from ADE, with no image access during the QA step." Translation: the visual understanding is done at ingestion-time by ADE's VLM, and the parsed output is rich enough that a downstream text LLM never needs to re-see the image to answer questions.

**LlamaParse** offers four modes; only Premium and `parse_page_with_lvm` send the page image to a VLM. Standard mode is heuristic + OCR. Per LlamaIndex's launch tweet (@llama_index on X): "It's expensive : Due to the cost of inference, using GPT-4o is currently $0.60 USD per page" — a concrete number for the cost premium of image-to-VLM.

**Tensorlake**'s `skip_ocr=True` is the most explicit user-facing toggle of this dichotomy in any API. Their benchmarks show 91.7% structured-extraction F1 vs Azure 68.9% and AWS Textract similar — partly because Tensorlake feeds the image directly to a VLM-trained extraction model on hard documents.

**Google Document AI Layout Parser v1.6** (announced Dec 1, 2025 for Pro / Jan 13, 2026 for Flash) is now a thin wrapper around Gemini 3. Gemini 3 itself processes PDFs by rendering each page to images, billed under the IMAGE modality. So Google's "Document AI" in 2026 is effectively VLM-native — though it still also exposes a separate "Document OCR" processor for classic text-extraction.

**Nanonets-OCR-s** (June 2025) and **Nanonets-OCR2** (Oct 2025) are open-weight Qwen2.5-VL-3B fine-tunes that take the page image straight in and emit Markdown with semantic tags. No separate OCR layer.

**Mistral OCR / Document AI**, despite being a VLM internally, is single-purpose: image → Markdown. There is no parameter for "also pass me back the image alongside the text" — that's why the user's tests showed only OCR text reaches the downstream LLM. If you want image + Mistral-OCR-text into a generalist LLM, you have to do the image attachment yourself.

**Azure Content Understanding** has no documented mode that passes the original image alongside extracted fields to its internal LLM. The Tech Community walkthrough for "LlamaParse + Azure OpenAI" piping `parsed_text_markdown` into Azure OpenAI is the canonical pattern and is text-only.

### Cost / latency comparison summary

| Approach | Approx. cost per page | Latency / throughput |
|---|---|---|
| AWS Textract OCR only | ~$0.0015–$0.015 | Sub-second |
| Mistral OCR | $0.001 / page ($1 per 1000) | Hundreds of pages/min/node |
| LlamaParse standard | $0.003 / page | Seconds |
| LlamaParse GPT-4o mode | $0.60 / page | Seconds–tens of seconds |
| GPT-4o synchronous on a full page image | ~$0.012 (≈$12,480/M) | Several seconds |
| GPT-4o batch | ~$0.006 | Hours batched |
| Self-hosted olmOCR-2 | ~$0.0002 | ~3,400 tokens/sec/H100 |
| LandingAI ADE | Custom enterprise pricing | Median 8 sec/doc (after their 17× speed-up) |
| Reducto | Custom; pay-as-you-go available with 15,000 free credits | Sub-minute SLAs reported (Anterior case study) |

The order-of-magnitude takeaway: **per-page costs for image-to-VLM range from ~$0.0002 (self-hosted Qwen-VL-7B) to ~$0.60 (LlamaParse GPT-4o premium)**, a 3,000× spread. The "feed image and text into GPT-5-class" pattern the user has chosen is roughly in the $0.005–$0.05/page band depending on model and resolution.

### Why the user's pattern is sound

1. **It matches the olmOCR document-anchoring approach validated by an independent academic benchmark.** The published win is ~5.5 points over image-only Mistral OCR on olmOCR-Bench (75.5 vs 72.0 at the v3 paper revision).
2. **It uses the deterministic OCR text as a hallucination check** — exactly what TNG Technology calls "the purpose of this model is to extract the text layer in a preprocessing step, to enrich the prompt given to the LLM to reduce hallucination."
3. **GPT-5-class generalist VLMs are stronger reasoners than fine-tuned 3–7B OCR-VLMs** on chained tasks (schema extraction, table reasoning, cross-page consistency), so using one as the final stage is a reasonable cost/quality choice.
4. **The image input pays for itself when the OCR is wrong** — for forms with checkboxes, scanned signatures, hand-drawn marks, multi-column statements, and charts/diagrams, OCR text alone loses the signal.

### Risks of the user's pattern

- Cost: each call carries the full image-token tax (~1k vision tokens/page for high-detail GPT-5) plus the OCR markdown (~1–2k text tokens for a dense page). At ~3–4k input tokens/page on GPT-5-class pricing, expect ~$0.01–$0.05/page.
- OCR errors propagate as plausible-looking text into the VLM, which may "trust" the OCR string over the pixels. Mitigation: explicit prompt instruction such as "if OCR text and image disagree, prefer the image."
- Token-window collapse on long documents — batch by page and merge after, exactly as olmOCR does.
- Provenance / citations: GPT-5-class APIs don't return bounding boxes. If audit-trail/visual-grounding matters, layer on a tool like Reducto, LandingAI ADE, or Tensorlake that returns bbox coordinates alongside the values.

## Recommendations

**For the user's current workflow (OCR → markdown → markdown + image → GPT-5.2):** This is a legitimate and well-precedented design. Keep it as the default, but harden it with three additions:

1. **Add an explicit conflict-resolution clause to the extraction prompt**: "When the markdown text disagrees with the page image, the image is authoritative." This single line measurably reduces error propagation from OCR mistakes.
2. **Render the page at 150–200 DPI (≈1024–1288 px longest edge)**, matching olmOCR-2's defaults. Higher resolutions blow up token cost without proportional accuracy gain.
3. **Cap anchor/OCR text at ~6,000 characters per page** (the olmOCR-validated number) to keep the per-page request under ~4k tokens.

**Stage 1 — Decision points for swapping the OCR layer:**
- If accuracy on tables and charts is the bottleneck → swap to **Reducto Parse** as the OCR layer (keep image-to-GPT-5 as the second pass).
- If you need bounding-box citations for compliance → swap to **LandingAI ADE** or **Tensorlake** (both return bbox), and reserve GPT-5 vision only for fields where ADE/Tensorlake confidence drops.
- If costs at scale dominate → self-host **olmOCR-2 on an L40S/H100** for the OCR/Markdown layer ($190/M pages), keep GPT-5 vision only for review of low-confidence pages.
- If multilingual coverage / handwriting → consider **Nanonets-OCR2** or **PaddleOCR-VL** as the front-end VLM.

**Stage 2 — When to consider abandoning the OCR layer entirely:**
- If GPT-5.2 (or Gemini 3 Pro, or Claude 4-class) hits ≥98% extraction accuracy on your test set with image-only prompting, drop the OCR step and save the latency. This is what olmOCR-2 and Reducto's RolmOCR variant did internally.
- Benchmark threshold for the decision: build a 200-document gold set and measure JSON-F1 with image-only vs image+OCR. If the gap is <2 points, drop OCR.

**Stage 3 — When to migrate off DIY entirely:**
- If document throughput exceeds ~50k pages/day **and** documents are visually complex (forms, charts, tables), the per-page economics of Reducto or LandingAI ADE become favorable vs paying GPT-5 token rates.
- If you need SOC 2 / HIPAA visual grounding with audit trail, LandingAI ADE and Reducto are the only vendors that productize this end-to-end.

## Caveats

- **Mistral OCR is internally a VLM, not a text-OCR-then-LLM service** — the user's observation that "only OCR text reaches the downstream LLM" is correct for *how they're chaining it*, but the Mistral OCR call itself is image-conditioned generation; there's just no API parameter to re-emit the image with the text.
- **Azure Content Understanding's exact internal architecture is not fully documented publicly**; the OCR-then-LLM characterization is based on Microsoft's own published reference architectures and the LlamaParse + Azure OpenAI walkthroughs. Newer Azure Content Understanding modes may use vision-conditioned models internally without exposing that to the user.
- **AWS Textract + Bedrock Data Automation (2025)** does support a "vision-centric" parsing mode for PDFs and images that routes to Claude/Llama vision in Bedrock; the older Textract → text → LLM flow is no longer the only option. Verify the specific parsing mode before classifying a workflow as text-only.
- **The "VLM-native" trend is not unambiguously winning.** Reducto, the most accuracy-focused commercial vendor, still combines CV + VLM + text-LLM rather than going pure VLM. olmOCR-2 dropped anchoring after RL fine-tuning, but on born-digital PDFs, anchoring still demonstrably helps. The right architecture is domain-dependent.
- **Cost numbers in this report are list prices as of April–May 2026** and change frequently; rerun your own per-page math before committing.
- **Some Reducto benchmark figures (99.24% extraction accuracy at Anterior, 0.90 RD-TableBench similarity, "up to 20 percentage points" over AWS/Google/Azure) are vendor-published**; treat as directionally useful but not independently audited. The olmOCR-Bench numbers and the olmOCR paper itself are peer-reviewed/arXiv-published and more reliable for cross-vendor comparison.
- **GPT-5.2 specifically is not a model name I could confirm in available sources as of May 2026**; the recommendations apply to whichever current GPT-5 / Gemini 3 / Claude 4-class vision model the user is actually using.