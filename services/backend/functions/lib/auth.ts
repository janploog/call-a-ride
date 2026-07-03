import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

/**
 * Prüft die Cognito-Gruppe "admin" aus dem JWT. Der HTTP-API-Authorizer
 * liefert cognito:groups je nach Fall als Array oder als String "[admin …]".
 */
export function isAdmin(event: APIGatewayProxyEventV2WithJWTAuthorizer): boolean {
  const groups = event.requestContext.authorizer.jwt.claims["cognito:groups"];
  if (Array.isArray(groups)) return groups.includes("admin");
  if (typeof groups === "string") {
    return groups
      .replace(/^\[|\]$/g, "")
      .split(/[\s,]+/)
      .includes("admin");
  }
  return false;
}

export function getUserId(event: APIGatewayProxyEventV2WithJWTAuthorizer): string | null {
  const sub = event.requestContext.authorizer.jwt.claims.sub;
  return typeof sub === "string" && sub.length > 0 ? sub : null;
}
