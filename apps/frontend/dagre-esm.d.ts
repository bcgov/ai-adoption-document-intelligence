declare module "dagre-esm" {
  export * from "dagre";
  import dagre from "dagre";
  export default dagre;
}

// The auto-layout helper imports the ESM dist file directly so the Node
// 22 ESM loader (used by Vitest) picks the browser-friendly bundle
// instead of the CJS `main` entry. Re-use the upstream `dagre` types.
declare module "dagre-esm/dist/dagre.esm.js" {
  export * from "dagre";
  import dagre from "dagre";
  export default dagre;
}
