---
title: "Architecture Diagrams"
---

# Architecture Diagrams

Diagrams of the system architecture, the document ingestion flow, the deployment topology, and the authentication flow. Each diagram is drawn from its Mermaid source in `docs/_diagrams/` and follows the light or dark theme you have selected. Each one is fitted to the page; **Open full size** shows it at its natural size in a new tab.

## System Overview {#system-overview}

High-level view of all platform components: frontend, backend services, Temporal, and storage.

<!--@include: ./_diagrams/system-overview.md-->

The top-level architecture diagram showing:

- **Frontend:** React SPA served via OpenShift
- **Backend Services:** REST API and business logic layer
- **Temporal:** Workflow orchestration engine
- **Storage:** Database and object storage connections
- **External integrations:** AI services and downstream APIs

## Document Ingestion Flow {#document-ingestion}

Sequence diagram of the full document upload, processing, and extraction pipeline.

<!--@include: ./_diagrams/document-ingestion.md-->

End-to-end sequence showing:

- Upload from external source (user or API consumer)
- Frontend relay to backend REST API
- Workflow initiation in Temporal
- Activity execution: extraction, classification, storage
- Status callbacks and result delivery

## Deployment Topology {#deployment}

OpenShift cluster layout, ingress, services, and external dependencies.

<!--@include: ./_diagrams/deployment.md-->

Infrastructure layout showing:

- OpenShift cluster boundaries and namespaces
- Ingress routing and service mesh
- Internet-facing vs internal traffic paths
- External service dependencies and endpoints

## Authentication Flow {#authentication-flow}

OAuth 2.0 Authorization Code + PKCE sequence — login, token refresh, and logout.

<!--@include: ./_diagrams/authentication-flow.md-->

OAuth 2.0 sequence showing:

- Login with PKCE and state parameter
- Authorization code exchange via openid-client
- Proactive token refresh and 401 interceptor
- API key authentication alternative
- Logout and session termination
