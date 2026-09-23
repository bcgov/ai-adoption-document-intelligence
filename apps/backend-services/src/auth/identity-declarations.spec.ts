import { readdirSync } from "node:fs";
import { join } from "node:path";
import { PATH_METADATA } from "@nestjs/common/constants";
import { IDENTITY_KEY, type IdentityOptions } from "./identity.decorator";

/** One route handler that declares group-scoped authorization. */
interface GroupScopedRoute {
  handler: string;
  route: string;
  groupPermissions: NonNullable<IdentityOptions["groupPermissions"]>;
}

function findControllerFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return findControllerFiles(path);
    return entry.name.endsWith(".controller.ts") ? [path] : [];
  });
}

/** Nest stores a route path as a string or an array of strings. */
function pathsOf(metadata: unknown): string[] {
  if (Array.isArray(metadata)) return metadata.map(String);
  return typeof metadata === "string" ? [metadata] : [];
}

/**
 * Loads every controller under src and returns each handler whose @Identity
 * declares groupPermissions, resolved the way IdentityGuard resolves it:
 * handler metadata first, then class metadata.
 */
async function collectGroupScopedRoutes(): Promise<GroupScopedRoute[]> {
  const routes: GroupScopedRoute[] = [];
  for (const file of findControllerFiles(join(__dirname, ".."))) {
    const moduleExports: Record<string, unknown> = await import(file);
    for (const exported of Object.values(moduleExports)) {
      if (typeof exported !== "function") continue;
      const prefixes = pathsOf(Reflect.getMetadata(PATH_METADATA, exported));
      if (prefixes.length === 0) continue;
      const prototype: Record<string, unknown> = exported.prototype;
      for (const name of Object.getOwnPropertyNames(prototype)) {
        const handler = prototype[name];
        if (name === "constructor" || typeof handler !== "function") continue;
        const paths = pathsOf(Reflect.getMetadata(PATH_METADATA, handler));
        const options: IdentityOptions | undefined =
          Reflect.getMetadata(IDENTITY_KEY, handler) ??
          Reflect.getMetadata(IDENTITY_KEY, exported);
        if (paths.length === 0 || !options?.groupPermissions) continue;
        for (const prefix of prefixes) {
          for (const path of paths) {
            routes.push({
              handler: `${exported.name}.${name}`,
              route: `${prefix}/${path}`,
              groupPermissions: options.groupPermissions,
            });
          }
        }
      }
    }
  }
  return routes;
}

describe("@Identity group-scoped declarations", () => {
  let routes: GroupScopedRoute[] = [];

  beforeAll(async () => {
    routes = await collectGroupScopedRoutes();
  });

  it("discovers group-scoped routes across the controllers", () => {
    // Keeps the checks below from passing on an empty list.
    expect(routes.map((r) => r.handler)).toEqual(
      expect.arrayContaining([
        "GroupController.getGroupMembers",
        "AzureController.deleteClassifier",
      ]),
    );
  });

  it("lists at least one required permission on every group-scoped route", () => {
    // IdentityGuard answers an empty list with a 500 for every non-system-admin.
    const offenders = routes
      .filter((r) => r.groupPermissions.requiredPermissions.length === 0)
      .map((r) => r.handler);
    expect(offenders).toEqual([]);
  });

  it("reads the group id from exactly one place", () => {
    const offenders = routes
      .filter(({ groupPermissions: { groupIdFrom } }) => {
        const { param, query, body } = groupIdFrom;
        return [param, query, body].filter(Boolean).length !== 1;
      })
      .map((r) => r.handler);
    expect(offenders).toEqual([]);
  });

  it("reads a route-param group id from a param the route declares", () => {
    // A mismatch makes IdentityGuard answer 400 before the handler runs.
    const offenders = routes
      .filter(({ route, groupPermissions: { groupIdFrom } }) => {
        const { param } = groupIdFrom;
        return param !== undefined && !route.split("/").includes(`:${param}`);
      })
      .map(
        (r) =>
          `${r.handler}: ${r.route} has no :${r.groupPermissions.groupIdFrom.param}`,
      );
    expect(offenders).toEqual([]);
  });
});
