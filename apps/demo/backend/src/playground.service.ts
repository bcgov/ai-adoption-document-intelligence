import { Injectable } from '@nestjs/common';

interface ExampleQuery {
  name: string;
  query: string;
  variables: string;
}

@Injectable()
export class PlaygroundService {
  private readonly exampleQueries: ExampleQuery[] = [
    {
      name: 'Get All Documents',
      query: `query GetDocuments {
  documents {
    id
    title
    file_url
    file_type
    status
    ministry
    confidence_score
    created_date
    workspace {
      id
      name
    }
  }
}`,
      variables: '',
    },
    {
      name: 'Get Documents with Filters',
      query: `query GetFilteredDocuments($status: DocumentStatus, $limit: Int) {
  documents(status: $status, limit: $limit) {
    id
    title
    status
    ministry
    confidence_score
    workspace {
      name
    }
  }
}`,
      variables: JSON.stringify({
        status: 'processed',
        limit: 10,
      }, null, 2),
    },
    {
      name: 'Get Single Document',
      query: `query GetDocument($id: ID!) {
  document(id: $id) {
    id
    title
    file_url
    status
    ministry
    confidence_score
    extracted_data
    workspace {
      id
      name
    }
  }
}`,
      variables: JSON.stringify({
        id: 'your-document-id-here',
      }, null, 2),
    },
    {
      name: 'Get All Users',
      query: `query GetUsers {
  users {
    id
    email
    full_name
    role
    status
    createdAt
  }
}`,
      variables: '',
    },
    {
      name: 'Get All Workspaces',
      query: `query GetWorkspaces {
  workspaces {
    id
    name
    description
    createdAt
  }
}`,
      variables: '',
    },
  ];

  generatePlaygroundHTML(graphqlEndpoint: string): string {
    const defaultQuery = this.exampleQueries[0].query;
    const defaultVariables = this.exampleQueries[0].variables;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>GraphQL Playground</title>
  <style>
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    #graphiql {
      height: 100vh;
    }
    .example-queries-selector {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 1000;
      background: white;
      padding: 8px 12px;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      border: 1px solid #e0e0e0;
    }
    .example-queries-selector select {
      padding: 6px 10px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
    }
    .example-queries-selector label {
      margin-right: 8px;
      font-size: 14px;
      font-weight: 500;
    }
  </style>
  <link rel="stylesheet" href="https://unpkg.com/graphiql@3/graphiql.min.css" />
</head>
<body>
  <div class="example-queries-selector">
    <label for="example-select">Example Queries:</label>
    <select id="example-select">
      <option value="">Select an example...</option>
    </select>
  </div>
  <div id="graphiql">Loading...</div>
  <script
    crossorigin
    src="https://unpkg.com/react@18/umd/react.production.min.js"
  ></script>
  <script
    crossorigin
    src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"
  ></script>
  <script
    crossorigin
    src="https://unpkg.com/graphiql@3/graphiql.min.js"
  ></script>
  <script>
    const fetcher = GraphiQL.createFetcher({
      url: '${graphqlEndpoint}',
    });
    
    const exampleQueries = ${JSON.stringify(this.exampleQueries)};
    
    // Populate the dropdown
    const select = document.getElementById('example-select');
    exampleQueries.forEach((example, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = example.name;
      select.appendChild(option);
    });
    
    // Store current query state
    let currentQuery = ${JSON.stringify(defaultQuery)};
    let currentVariables = ${JSON.stringify(defaultVariables)};
    let renderKey = 0;
    let root = null;
    
    // Function to render GraphiQL with given query and variables
    function renderGraphiQL(query, variables) {
      const container = document.getElementById('graphiql');
      if (root) {
        root.unmount();
      }
      container.innerHTML = '';
      root = ReactDOM.createRoot(container);
      
      const props = {
        fetcher,
        key: 'graphiql-' + (renderKey++),
        defaultQuery: query,
        defaultVariables: variables,
      };
      
      const graphiqlElement = React.createElement(GraphiQL, props);
      root.render(graphiqlElement);
    }
    
    // Function to update editors directly using CodeMirror 6 API
    function updateEditorsDirectly(query, variables) {
      // Prevent duplicate updates
      if (updateEditorsDirectly._updating) {
        return;
      }
      updateEditorsDirectly._updating = true;
      
      const checkEditors = () => {
        // Try multiple selectors to find editors
        const editors = document.querySelectorAll('.cm-editor, [class*="cm-editor"], .graphiql-query-editor, .graphiql-editor');
        
        // Also check the GraphiQL container directly
        const graphiqlContainer = document.getElementById('graphiql');
        if (graphiqlContainer) {
          const allEditors = graphiqlContainer.querySelectorAll('.cm-editor');
          if (allEditors.length > 0) {
            return Array.from(allEditors);
          }
        }
        
        return Array.from(editors);
      };
      
      let attemptCount = 0;
      const maxAttempts = 50;
      
      const tryUpdate = () => {
        attemptCount++;
        const editors = checkEditors();
        
        if (editors.length === 0) {
          if (attemptCount < maxAttempts) {
            setTimeout(tryUpdate, 100);
          } else {
            updateEditorsDirectly._updating = false;
          }
          return;
        }
        
        // Find the query editor container (.graphiql-query-editor)
        // The .cm-editor elements are inside .graphiql-query-editor
        let queryEditor = null;
        
        // First try to find .graphiql-query-editor directly
        const graphiqlQueryEditor = document.querySelector('.graphiql-query-editor');
        if (graphiqlQueryEditor) {
          queryEditor = graphiqlQueryEditor;
        } else {
          // Fallback: find by checking editors and their parents
          for (const editor of editors) {
            const parent = editor.closest('.graphiql-query-editor');
            if (parent) {
              queryEditor = parent;
              break;
            }
            // Or check if editor itself has query in class name
            if (editor.className.includes('query') || editor.getAttribute('data-testid')?.includes('query')) {
              queryEditor = editor;
              break;
            }
          }
          // Last resort: use first editor
          if (!queryEditor && editors.length > 0) {
            queryEditor = editors[0];
          }
        }
        
        if (!queryEditor) return;
        
        // Try to find CodeMirror view (preferred method)
        let view = null;
        const findView = (element) => {
          if (!element) return null;
          for (const prop of ['__cm_view', '_cm_view', '__view', 'view']) {
            if (element[prop] && typeof element[prop].dispatch === 'function') {
              return element[prop];
            }
          }
          return null;
        };
        
        // Check queryEditor and its children
        view = findView(queryEditor) || 
               findView(queryEditor.querySelector('.cm-scroller')) ||
               findView(queryEditor.querySelector('.cm-content')?.parentElement);
        
        // Try React fiber if view not found
        if (!view) {
          const fiberKey = Object.keys(queryEditor).find(k => 
            k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
          );
          if (fiberKey) {
            let fiber = queryEditor[fiberKey];
            let depth = 0;
            while (fiber && depth < 15) {
              if (fiber.memoizedState?.view && typeof fiber.memoizedState.view.dispatch === 'function') {
                view = fiber.memoizedState.view;
                break;
              }
              if (fiber.stateNode) {
                for (const key of Object.keys(fiber.stateNode)) {
                  const val = fiber.stateNode[key];
                  if (val && typeof val === 'object' && typeof val.dispatch === 'function' && val.state) {
                    view = val;
                    break;
                  }
                }
              }
              if (view) break;
              fiber = fiber.return || fiber.child;
              depth++;
            }
          }
        }
        
        // Update using view if found
        let viewUpdateSucceeded = false;
        if (view && typeof view.dispatch === 'function') {
          try {
            const currentText = view.state.doc.toString();
            if (currentText !== query) {
              view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: query }
              });
              viewUpdateSucceeded = true;
            } else {
              viewUpdateSucceeded = true; // Already matches
            }
            // If view update succeeded, update variables and exit
            if (viewUpdateSucceeded) {
              // Update variables editor
              if (editors.length > 1) {
                const varEditor = editors[1];
                const varValue = variables || '';
                const varContent = varEditor.querySelector('textarea') || 
                                 varEditor.querySelector('.cm-content');
                
                if (varContent) {
                  if (varContent.tagName === 'TEXTAREA') {
                    varContent.value = varValue;
                  } else {
                    varContent.textContent = varValue;
                  }
                  varContent.dispatchEvent(new Event('input', { bubbles: true }));
                }
              }
              updateEditorsDirectly._updating = false;
              return;
            }
          } catch (e) {
            // Fall through to DOM method
            viewUpdateSucceeded = false;
          }
        }
        
        // Fallback: DOM manipulation (if view update didn't succeed)
        if (!viewUpdateSucceeded) {
          let content = queryEditor.querySelector('textarea') ||
                       queryEditor.querySelector('.cm-content') ||
                       queryEditor.querySelector('[role="textbox"]') ||
                       queryEditor.querySelector('[contenteditable="true"]');
          
          if (content) {
            // For textarea, try to find CodeMirror view through React fiber
            if (content.tagName === 'TEXTAREA' && !view) {
              const findReactFiber = (el) => {
                const fiberKey = Object.keys(el).find(k => 
                  k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
                );
                return fiberKey ? el[fiberKey] : null;
              };
              
              let fiber = findReactFiber(content) || findReactFiber(content.parentElement);
              
              if (fiber) {
                let currentFiber = fiber;
                let depth = 0;
                while (currentFiber && depth < 20) {
                  if (currentFiber.memoizedState) {
                    const state = currentFiber.memoizedState;
                    if (state.view && typeof state.view.dispatch === 'function') {
                      view = state.view;
                      break;
                    }
                    let nestedState = state;
                    while (nestedState && nestedState.next) {
                      nestedState = nestedState.next;
                      if (nestedState.view && typeof nestedState.view.dispatch === 'function') {
                        view = nestedState.view;
                        break;
                      }
                    }
                  }
                  
                  if (currentFiber.stateNode) {
                    const stateNode = currentFiber.stateNode;
                    if (stateNode.view && typeof stateNode.view.dispatch === 'function') {
                      view = stateNode.view;
                      break;
                    }
                    for (const key of Object.keys(stateNode)) {
                      const val = stateNode[key];
                      if (val && typeof val === 'object' && typeof val.dispatch === 'function' && val.state) {
                        view = val;
                        break;
                      }
                    }
                  }
                  
                  if (view) break;
                  currentFiber = currentFiber.return || currentFiber.child;
                  depth++;
                }
              }
              
              // If we found the view through textarea fiber, use it
              if (view && typeof view.dispatch === 'function') {
                try {
                  view.dispatch({
                    changes: { from: 0, to: view.state.doc.length, insert: query }
                  });
                  viewUpdateSucceeded = true;
                  // Reset flag and exit early
                  updateEditorsDirectly._updating = false;
                  return;
                } catch (e) {
                  // Fall through to DOM manipulation
                  viewUpdateSucceeded = false;
                }
              }
            }
            
            // DOM manipulation fallback
            if (!viewUpdateSucceeded) {
              if (content.tagName === 'TEXTAREA' || content.tagName === 'INPUT') {
                content.focus();
                content.select();
                content.setSelectionRange(0, content.value.length);
                content.value = query;
                
                const events = [
                  new Event('focus', { bubbles: true }),
                  new Event('select', { bubbles: true }),
                  new InputEvent('beforeinput', { 
                    inputType: 'deleteContentBackward',
                    bubbles: true,
                    cancelable: true
                  }),
                  new InputEvent('input', {
                    inputType: 'insertReplacementText',
                    data: query,
                    bubbles: true,
                    cancelable: true
                  }),
                  new Event('input', { bubbles: true }),
                  new Event('change', { bubbles: true })
                ];
                
                events.forEach(event => content.dispatchEvent(event));
              } else {
                content.textContent = query;
                ['input', 'change'].forEach(eventType => {
                  content.dispatchEvent(new Event(eventType, { bubbles: true }));
                });
              }
            }
          }
        }
        
        // Update variables editor
        if (editors.length > 1) {
          const varEditor = editors[1];
          const varValue = variables || '';
          const varContent = varEditor.querySelector('textarea') || 
                           varEditor.querySelector('.cm-content');
          
          if (varContent) {
            if (varContent.tagName === 'TEXTAREA') {
              varContent.value = varValue;
            } else {
              varContent.textContent = varValue;
            }
            varContent.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        
        // Reset flag after update completes
        updateEditorsDirectly._updating = false;
      };
      
      tryUpdate();
    }
    
    // Function to load an example query
    function loadExampleQuery(index) {
      const example = exampleQueries[index];
      if (!example) return;
      
      currentQuery = example.query;
      currentVariables = example.variables || '';
      
      // Check if editors exist using multiple selectors (this was working)
      const graphiqlContainer = document.getElementById('graphiql');
      const editors1 = document.querySelectorAll('.cm-editor');
      const editors2 = graphiqlContainer?.querySelectorAll('.cm-editor') || [];
      const editors3 = graphiqlContainer?.querySelectorAll('[class*="cm"]') || [];
      
      // Use whichever method found editors
      const editors = editors1.length > 0 ? editors1 : 
                     editors2.length > 0 ? editors2 : 
                     editors3;
      
      if (editors.length > 0) {
        // Editors exist, update them immediately
        updateEditorsDirectly(currentQuery, currentVariables);
      } else if (graphiqlContainer) {
        // Editors don't exist yet, set up a MutationObserver to watch for them
        const observer = new MutationObserver((mutations) => {
          const foundEditors = graphiqlContainer.querySelectorAll('.cm-editor');
          if (foundEditors.length > 0) {
            observer.disconnect();
            updateEditorsDirectly(currentQuery, currentVariables);
          }
        });
        
        observer.observe(graphiqlContainer, {
          childList: true,
          subtree: true
        });
        
        // Also try after a delay as fallback
        setTimeout(() => {
          observer.disconnect();
          updateEditorsDirectly(currentQuery, currentVariables);
        }, 2000);
      } else {
        // No container, just try after delay
        setTimeout(() => {
          updateEditorsDirectly(currentQuery, currentVariables);
        }, 200);
      }
    }
    
    // Handle dropdown change
    select.addEventListener('change', (e) => {
      const index = parseInt(e.target.value);
      if (!isNaN(index) && index >= 0 && index < exampleQueries.length) {
        loadExampleQuery(index);
        e.target.value = '';
      }
    });
    
    // Initial render
    renderGraphiQL(currentQuery, currentVariables);
  </script>
</body>
</html>
    `;
  }
}

