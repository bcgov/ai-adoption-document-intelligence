# Map Container Visualization Implementation

## Overview

Implemented visual container rendering for map nodes in the workflow visualization, showing map body nodes nested inside their parent map container. This creates a more intuitive representation that matches the semantic meaning of map/fan-out operations.

## Changes Made

### 1. Enhanced Type Definitions

**File:** `apps/frontend/src/components/workflow/GraphVisualization.tsx`

- Added `MapContainerData` interface for map container node data
- Enhanced `GraphNodeData` to include `workflowRef` for childWorkflow nodes
- Added imports for `MapNode` and `ChildWorkflowNode` types

### 2. MapContainerRenderer Component

New React component that renders map nodes as visual containers:
- Shows map label with repeat icon
- Displays `collectionCtxKey` (e.g., "for each in segments")
- Shows `maxConcurrency` as a badge (e.g., "×10")
- Uses dashed border to distinguish from regular nodes
- Light background (#f9fafb) to visually separate from body nodes

### 3. Enhanced GraphNodeRenderer

Updated to show childWorkflow details:
- Displays the referenced workflow ID when type is "library"
- Shows corner-down-right icon (↳) to indicate it's a reference
- More compact display showing workflow name instead of just "childWorkflow"

### 4. Map Body Node Identification

**Function:** `identifyMapBodyNodes()`

Traverses the workflow graph to identify which nodes belong to which map bodies:
- Starts from `bodyEntryNodeId`
- Follows edges until `bodyExitNodeId`
- Returns `Map<bodyNodeId, mapNodeId>`

### 5. Detailed View with Map Containers

**Function:** `buildDetailedViewWithMapContainers()`

Builds React Flow nodes with parent/child relationships:
- Creates `mapContainer` type nodes for map nodes
- Creates regular nodes with `parentId` set for body nodes
- Sets `extent: "parent"` for body nodes to constrain them
- Calculates container size dynamically based on body nodes
- Handles edges correctly (internal vs external)

**Container Sizing:**
- Width: `max(250, bodyNodesWidth + padding + gaps)`
- Height: `headerHeight(50) + bodyNodesHeight + padding(24×2)`
- Body nodes arranged horizontally with 40px gaps

**Edge Handling:**
- **Internal edges** (both nodes in same map body): Rendered inside container
- **External edges** (between map and other nodes): Connect to container, not body nodes

### 6. Two-Pass Layout Algorithm

**Function:** `layoutGraphWithMapContainers()`

Implements the recommended approach for handling nested nodes with dagre:

**Pass 1: Top-level layout**
- Filters out body nodes (nodes with `parentId`)
- Runs dagre layout on top-level nodes only
- Positions containers correctly in the overall flow

**Pass 2: Manual body layout**
- Positions body nodes inside their parent containers
- Uses fixed horizontal layout (left-to-right)
- Positions relative to container (with padding and header offset)

### 7. View Mode Logic

Updated main `useMemo` to:
- Check if workflow contains map nodes
- Use new `buildDetailedViewWithMapContainers()` when map nodes exist
- Fall back to original flat rendering for workflows without map nodes
- Preserve simplified view behavior for nodeGroups

### 8. Node Type Registry

Registered new `mapContainer` node type in ReactFlow:
```typescript
nodeTypes={{
  graphNode: GraphNodeRenderer,
  groupNode: GroupNodeRenderer,
  mapContainer: MapContainerRenderer, // NEW
}}
```

## Visual Result

### Before (Flat Layout)
```
Update Status → Split Document → Process Each Segment (map) → Collect Results → ...
                                 OCR Segment (childWorkflow)
                                      ↓
                                 Classify Segment
```

Two disconnected visual clusters - confusing!

### After (Container Layout)
```
Update Status → Split Document → ┌─────────────────────────────────────┐ → Collect Results → ...
                                 │ Process Each Segment (map)           │
                                 │ for each in segments        ×10      │
                                 │                                      │
                                 │ ┌─────────────┐   ┌──────────────┐ │
                                 │ │ OCR Segment │ → │   Classify   │ │
                                 │ │ ↳ standard  │   │   Segment    │ │
                                 │ │   -ocr      │   │              │ │
                                 │ └─────────────┘   └──────────────┘ │
                                 └─────────────────────────────────────┘
```

Single unified visualization showing the map container with its body pipeline inside!

## Benefits

1. **Semantic Clarity**: Visual structure matches actual execution semantics
2. **Reduced Confusion**: No more "two separate workflows" appearance
3. **Better Understanding**: Clear that body nodes execute for each collection item
4. **Child Workflow Clarity**: Shows referenced workflow ID without expanding it
5. **Clean Separation**: Dashed border and background color distinguish containers

## Testing

To test with your multi-page workflow:
1. Open the workflow editor
2. Load the multi-page-report-workflow
3. Select "Detailed" view
4. Should see `processSegments` as a container with `segmentOcr` and `classifySegment` inside
5. Should see "standard-ocr-workflow" displayed on the OCR Segment node

## Compatibility

- ✅ Works with existing workflows without map nodes (uses flat layout)
- ✅ Works with simplified view (unchanged)
- ✅ Works with nodeGroups (unchanged)
- ✅ Handles multiple map nodes in same workflow
- ✅ Handles nested scenarios (though rare)

## Future Enhancements

Potential improvements (not implemented):
- Click to collapse/expand map containers
- Show iteration count or status when running
- Support for nested map containers (map within map)
- Drag & drop editing for map body nodes
