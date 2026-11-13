---
title: "API Reference"
layout: page
---

<div class="vp-doc api-reference-intro">

# API Reference

Complete REST API documentation for the Document Intelligence Platform. All endpoints support Bearer token authentication (Keycloak SSO) or API key authentication.

::: info Authentication
This API supports two authentication methods: Bearer tokens (JWT from Keycloak SSO) or API keys passed via the `x-api-key` header.
:::

## API Endpoints Overview

- **Documents** - Document management, OCR results, and metadata operations
- **Upload** - Multipart file upload with workflow execution
- **Workflow** - Graph-based workflow configuration and monitoring
- **Template Models** - Template model management and document annotation
- **Training** - Custom model training and evaluation
- **HITL** - Human-in-the-loop review queue operations
- **API Keys** - API key lifecycle management
- **OCR** - OCR model information and capabilities

</div>

<RedocViewer />

<style>
.api-reference-intro {
	max-width: 960px;
	margin: 0 auto;
	padding: 48px 24px 24px;
}
</style>
