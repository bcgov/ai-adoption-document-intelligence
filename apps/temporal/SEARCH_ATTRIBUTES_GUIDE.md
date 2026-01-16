# Temporal Search Attributes Guide

## Managing Search Attributes

### Register Search Attributes

Use the provided script to register all required search attributes:

```bash
cd apps/temporal
./register-search-attributes.sh
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

**Step 1: Register the attribute**

Option A - Using the script (recommended):
1. Edit `register-search-attributes.sh`
2. Add a new `docker exec` command for your attribute:
   ```bash
   docker exec temporal temporal operator search-attribute create \
       --address "${TEMPORAL_ADDRESS}" \
       --namespace "${NAMESPACE}" \
       --name YourNewAttribute \
       --type Keyword
   ```
3. Run the script: `./register-search-attributes.sh`

Option B - Manual registration:
```bash
docker exec temporal temporal operator search-attribute create \
  --address temporal:7233 \
  --namespace default \
  --name YourNewAttribute \
  --type Keyword
```

**Step 2: Update the code**

In `apps/backend-services/src/temporal/temporal-client.service.ts`, add the new attribute to the `searchAttributes` object:

```typescript
searchAttributes: {
  DocumentId: [documentId],
  FileName: [fileData.fileName],
  FileType: [fileData.fileType],
  Status: ["ongoing_ocr"],
  YourNewAttribute: [yourValue], // Add your new attribute here
},
```

**Step 3: Verify**

- Check registration: `docker exec temporal temporal operator search-attribute list --address temporal:7233 --namespace default`
- Test in UI: `YourNewAttribute = "test-value"`
- Restart backend services to pick up code changes

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
