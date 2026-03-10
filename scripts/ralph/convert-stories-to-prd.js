#!/usr/bin/env node
/**
 * Converts user stories from write-user-stories format to Ralph's prd.json format
 *
 * Usage: node scripts/ralph/convert-stories-to-prd.js <user_stories_dir> [branch_name]
 * Example: node scripts/ralph/convert-stories-to-prd.js feature-docs/benchmarking/user_stories ralph/benchmarking
 */

const fs = require('fs');
const path = require('path');

function parsePriority(content) {
  // Look for priority section in the markdown
  if (content.includes('- [x] High (Must Have)')) return 1;
  if (content.includes('- [x] Medium (Should Have)')) return 2;
  if (content.includes('- [x] Low (Nice to Have)')) return 3;

  // Default to medium if not specified
  return 2;
}

function extractTitle(content) {
  // First line should be: # [Story ID]: [Title]
  const firstLine = content.split('\n')[0];
  const match = firstLine.match(/^#\s*([^:]+):\s*(.+)$/);
  if (match) {
    return match[2].trim();
  }
  return 'Untitled Story';
}

function extractAcceptanceCriteria(content) {
  const criteria = [];
  const lines = content.split('\n');
  let inAcceptanceCriteria = false;

  for (const line of lines) {
    if (line.includes('## Acceptance Criteria')) {
      inAcceptanceCriteria = true;
      continue;
    }
    if (inAcceptanceCriteria && line.startsWith('##')) {
      break;
    }
    if (inAcceptanceCriteria && line.trim().startsWith('- [ ]')) {
      // Extract scenario title
      const match = line.match(/- \[ \]\s*\*\*(.+?)\*\*/);
      if (match) {
        criteria.push(match[1]);
      }
    }
  }

  return criteria.length > 0 ? criteria : ['Implementation complete per story requirements'];
}

function extractRequirementsDoc(readmeContent) {
  // Look for: NOTE: The requirements document for this feature is available here: `path/to/REQUIREMENTS.md`.
  const match = readmeContent.match(/NOTE:.*?available here:\s*`([^`]+)`/);
  if (match) {
    return match[1];
  }
  return null;
}

function extractImplementationOrder(readmeContent) {
  // Extract story IDs from "Suggested Implementation Order" section
  const storyOrder = [];
  const lines = readmeContent.split('\n');
  let inImplementationOrder = false;

  for (const line of lines) {
    if (line.includes('## Suggested Implementation Order')) {
      inImplementationOrder = true;
      continue;
    }
    if (inImplementationOrder && line.startsWith('##') && !line.includes('Suggested Implementation Order')) {
      break;
    }
    if (inImplementationOrder) {
      // Look for lines like: - [ ] **US-001** (description)
      const match = line.match(/- \[.\]\s*\*\*(US-\d+)\*\*/);
      if (match) {
        storyOrder.push(match[1]);
      }
    }
  }

  return storyOrder;
}

function convertStoriesToPrd(userStoriesDir, branchName = 'ralph/user-stories') {
  if (!fs.existsSync(userStoriesDir)) {
    console.error(`Error: Directory ${userStoriesDir} does not exist`);
    process.exit(1);
  }

  // Read README.md to get requirements doc and implementation order
  const readmePath = path.join(userStoriesDir, 'README.md');
  let requirementsDoc = null;
  let implementationOrder = [];

  if (fs.existsSync(readmePath)) {
    const readmeContent = fs.readFileSync(readmePath, 'utf8');
    requirementsDoc = extractRequirementsDoc(readmeContent);
    implementationOrder = extractImplementationOrder(readmeContent);
  }

  // Read all story files
  const files = fs.readdirSync(userStoriesDir)
    .filter(f => f.startsWith('US-') && f.endsWith('.md'))
    .sort();

  const storiesMap = {};

  for (const file of files) {
    const filePath = path.join(userStoriesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    // Extract story ID from filename: US-001-description.md -> US-001
    const id = file.split('-').slice(0, 2).join('-');

    const story = {
      id,
      title: extractTitle(content),
      acceptanceCriteria: extractAcceptanceCriteria(content),
      priority: parsePriority(content),
      passes: false,
      notes: "",
      file: path.relative(process.cwd(), filePath)
    };

    storiesMap[id] = story;
  }

  // Order stories according to implementation order from README
  let userStories = [];
  if (implementationOrder.length > 0) {
    // Use README order
    for (const id of implementationOrder) {
      if (storiesMap[id]) {
        userStories.push(storiesMap[id]);
      }
    }
    // Add any stories not in the implementation order (shouldn't happen, but just in case)
    for (const id in storiesMap) {
      if (!implementationOrder.includes(id)) {
        userStories.push(storiesMap[id]);
      }
    }
  } else {
    // Fallback to alphabetical order if no README
    userStories = Object.values(storiesMap);
  }

  const prd = {
    branchName,
    userStories
  };

  // Add requirements doc if found
  if (requirementsDoc) {
    prd.requirementsDoc = requirementsDoc;
  }

  const outputPath = path.join(__dirname, 'prd.json');
  fs.writeFileSync(outputPath, JSON.stringify(prd, null, 2));

  console.log(`Converted ${userStories.length} user stories to ${outputPath}`);
  console.log(`Branch: ${branchName}`);
  if (requirementsDoc) {
    console.log(`Requirements: ${requirementsDoc}`);
  }
  if (implementationOrder.length > 0) {
    console.log(`Using implementation order from README (${implementationOrder.length} stories)`);
  }
  console.log('\nStories (in implementation order):');
  userStories.forEach((s, i) => {
    console.log(`  ${i + 1}. ${s.id}: ${s.title} (Priority ${s.priority})`);
  });
}

// Main execution
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node convert-stories-to-prd.js <user_stories_dir> [branch_name]');
  console.error('Example: node scripts/ralph/convert-stories-to-prd.js feature-docs/benchmarking/user_stories ralph/benchmarking');
  process.exit(1);
}

const userStoriesDir = args[0];
const branchName = args[1] || 'ralph/user-stories';

convertStoriesToPrd(userStoriesDir, branchName);
