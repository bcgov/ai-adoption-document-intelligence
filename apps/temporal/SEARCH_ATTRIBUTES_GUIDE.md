# Temporal Search Attributes Guide

## Managing Search Attributes

### Register Search Attributes

**Automatic Registration:**

The **backend** ensures these attributes when it connects to Temporal (`TemporalClientService.onModuleInit`). No separate Job or docker-compose service is used.

**Manual Registration (if needed):**

If you need to manually register search attributes (e.g. when running Temporal without the backend), use the Temporal CLI:

```bash
docker exec temporal temporal operator search-attribute create \
  --address temporal:7233 \
  --namespace default \
  --name DocumentId \
  --type Keyword

docker exec temporal temporal operator search-attribute create \
  --address temporal:7233 \
  --namespace default \
  --name FileName \
  --type Keyword

docker exec temporal temporal operator search-attribute create \
  --address temporal:7233 \
  --namespace default \
  --name FileType \
  --type Keyword

docker exec temporal temporal operator search-attribute create \
  --address temporal:7233 \
  --namespace default \
  --name Status \
  --type Keyword
```

This registers:
- **DocumentId** (Keyword) - Document ID from database
- **FileName** (Keyword) - Original filename
- **FileType** (Keyword) - File type: "pdf" or "image"
- **Status** (Keyword) - Workflow status

### Verify Registration

```bash
docker exec temporal temporal operator search-attribute list \
  --address temporal:7233 \
  --namespace default
```

### Adding a New Search Attribute

**Step 1: Update the backend**

In `apps/backend-services/src/temporal/temporal-client.service.ts`:

1. Add the new attribute to the `SEARCH_ATTRIBUTES` array in `ensureSearchAttributes` (same file).
2. Add the new attribute to the `searchAttributes` object in `startGraphWorkflow`:

```typescript
searchAttributes: {
  DocumentId: [documentId],
  FileName: [String(initialCtx.fileName ?? "")],
  FileType: [String(initialCtx.fileType ?? "")],
  Status: ["ongoing_ocr"],
  YourNewAttribute: [yourValue], // Add your new attribute here
},
```

**Step 2: Verify**

- Restart the backend to pick up code changes.
- Check registration: `docker exec temporal temporal operator search-attribute list --address temporal:7233 --namespace default`
- Test in UI: `YourNewAttribute = "test-value"`

**Supported Types:**
- `Keyword` - For exact string matches (most common)
- `Text` - For full-text search
- `Int` - For integer values
- `Double` - For decimal numbers
- `Bool` - For boolean values
- `Datetime` - For date/time values

## Query Syntax

**Rules:**
- String values must be in quotes (single or double)
- Use `=` for exact matches
- Attribute names are case-sensitive (`DocumentId`, not `documentId`)

**Example Queries:**

```
DocumentId = "cmkg1dwkb0000uye5k4n6t6tj"
FileName = "example.pdf"
FileType = "pdf"
Status = "ongoing_ocr"
FileType = "pdf" AND Status = "ongoing_ocr"
(FileType = "pdf" OR FileType = "image") AND Status = "ongoing_ocr"
```

## Using in Temporal UI

1. Go to **Workflows** page (http://localhost:8088)
2. Enter query in the search/filter box
3. Press Enter or click Apply

**Common Error: "incomplete expression"**
- Ensure complete expression: `AttributeName = "value"`
- Don't leave operator or value empty: ❌ `DocumentId =` ✅ `DocumentId = "some-id"`

## Supported Operators

- `=`, `!=` - Equals/Not equals
- `IN` - Value in list: `FileType IN ("pdf", "image")`
- `AND`, `OR` - Logical operators
- `()` - Grouping
