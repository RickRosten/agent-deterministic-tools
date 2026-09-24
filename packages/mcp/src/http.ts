import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ToolRegistry } from '@rickrosten/agent-deterministic-tools-core';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { createMcpServer, silentLogger, type McpServerOptions } from './server.js';

export interface ProtectedResourceMetadata {
  /** Authorization server issuer URLs (RFC 9728 `authorization_servers`). */
  authorizationServers: string[];
  /** Canonical resource URL. Defaults to the server's public MCP URL. */
  resource?: string;
  scopesSupported?: string[];
}

export interface HttpAuthOptions {
  /** Static bearer token. Compared in constant time. */
  bearerToken?: string;
  /**
   * Custom authentication hook, e.g. OAuth 2.1 access-token validation against an
   * authorization server. Return `null` to reject the request with 401.
   */
  authenticate?: (req: IncomingMessage, token: string | undefined) => AuthInfo | null | Promise<AuthInfo | null>;
  /** Publishes `/.well-known/oauth-protected-resource` per the MCP authorization spec. */
  resourceMetadata?: ProtectedResourceMetadata;
}

export interface StreamableHttpOptions extends McpServerOptions {
  /** Interface to bind. Default 127.0.0.1 (local only). */
  host?: string;
  /** Port. Default 3333; 0 picks a free port. */
  port?: number;
  /** MCP endpoint path. Default /mcp. */
  path?: string;
  /** Allowed values of the Origin header. Loopback origins are always allowed on loopback binds. */
  allowedOrigins?: string[];
  /** Allowed Host header values (DNS-rebinding protection). Loopback names are always allowed on loopback binds. */
  allowedHosts?: string[];
  /** Public base URL used in auth metadata, e.g. https://mcp.example.com. */
  publicUrl?: string;
  auth?: HttpAuthOptions;
  /** Maximum request body in bytes. Default 1 MiB. */
  maxBodyBytes?: number;
}

export interface RunningHttpServer {
  httpServer: HttpServer;
  url: string;
  close(): Promise<void>;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host);
}

function hostName(hostHeader: string): string {
  if (hostHeader.startsWith('[')) return hostHeader.slice(0, hostHeader.indexOf(']') + 1);
  return hostHeader.split(':')[0] ?? '';
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

function jsonRpcError(res: ServerResponse, status: number, code: number, message: string, headers: Record<string, string> = {}): void {
  sendJson(res, status, { jsonrpc: '2.0', error: { code, message }, id: null }, headers);
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function bearerFrom(req: IncomingMessage): string | undefined {
  const header = req.headers['authorization'];
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim();
}

/**
 * Creates a Streamable HTTP MCP endpoint (stateless, JSON responses). Each POST gets a fresh
 * MCP server bound to the shared registry, so there is no per-session state to leak.
 */
export function createStreamableHttpServer(registry: ToolRegistry, options: StreamableHttpOptions = {}) {
  const host = options.host ?? '127.0.0.1';
  const path = options.path ?? '/mcp';
  const logger = options.logger ?? silentLogger;
  const loopback = isLoopbackHost(host);
  const auth = options.auth;
  const authRequired = Boolean(auth?.bearerToken || auth?.authenticate);
  const metadataPath = '/.well-known/oauth-protected-resource';

  const publicBase = (req: IncomingMessage) =>
    (options.publicUrl ?? `http://${req.headers.host ?? `${host}:${options.port ?? 3333}`}`).replace(/\/$/, '');

  const hostAllowed = (req: IncomingMessage): boolean => {
    const header = req.headers.host;
    if (!header) return false;
    const name = hostName(header);
    if (options.allowedHosts?.some((h) => h === header || h === name)) return true;
    if (loopback) return isLoopbackHost(name);
    return !options.allowedHosts || options.allowedHosts.length === 0;
  };

  const originAllowed = (req: IncomingMessage): boolean => {
    const origin = req.headers.origin;
    if (!origin) return true;
    if (options.allowedOrigins?.includes(origin)) return true;
    if (loopback) {
      try {
        return isLoopbackHost(new URL(origin).hostname);
      } catch {
        return false;
      }
    }
    return false;
  };

  const authenticate = async (req: IncomingMessage): Promise<AuthInfo | null | undefined> => {
    if (!authRequired) return undefined;
    const token = bearerFrom(req);
    if (auth?.authenticate) return auth.authenticate(req, token);
    if (!token || !auth?.bearerToken) return null;
    if (!timingSafeEqual(digest(token), digest(auth.bearerToken))) return null;
    return { token, clientId: 'static-token', scopes: [] };
  };

  const unauthorized = (req: IncomingMessage, res: ServerResponse) => {
    const challenge = auth?.resourceMetadata
      ? `Bearer resource_metadata="${publicBase(req)}${metadataPath}"`
      : 'Bearer realm="deterministic-tools"';
    jsonRpcError(res, 401, -32001, 'Unauthorized: a valid bearer token is required.', { 'www-authenticate': challenge });
  };

  const handleMcp = async (req: IncomingMessage & { auth?: AuthInfo }, res: ServerResponse) => {
    if (req.method !== 'POST') {
      jsonRpcError(res, 405, -32000, 'Method not allowed. This stateless endpoint only accepts POST.', { allow: 'POST' });
      return;
    }
    const length = Number(req.headers['content-length'] ?? 0);
    if (length > (options.maxBodyBytes ?? 1_048_576)) {
      jsonRpcError(res, 413, -32000, 'Request body too large.');
      return;
    }
    const server = createMcpServer(registry, options);
    // No sessionIdGenerator: stateless mode.
    const transport = new StreamableHTTPServerTransport({
      enableJsonResponse: true,
      maxRequestBodySize: options.maxBodyBytes ?? 1_048_576,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport as Transport);
    await transport.handleRequest(req, res);
  };

  const httpServer = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (!hostAllowed(req)) {
        logger('warn', 'rejected request with disallowed Host header', { host: req.headers.host });
        return jsonRpcError(res, 403, -32000, 'Forbidden: Host header not allowed.');
      }
      if (!originAllowed(req)) {
        logger('warn', 'rejected request with disallowed Origin', { origin: req.headers.origin });
        return jsonRpcError(res, 403, -32000, 'Forbidden: Origin not allowed.');
      }
      if (req.method === 'GET' && url.pathname === '/healthz') {
        return sendJson(res, 200, { status: 'ok', tools: registry.list().length });
      }
      if (req.method === 'GET' && (url.pathname === metadataPath || url.pathname === `${metadataPath}${path}`)) {
        if (!auth?.resourceMetadata) return sendJson(res, 404, { error: 'not_found' });
        return sendJson(res, 200, {
          resource: auth.resourceMetadata.resource ?? `${publicBase(req)}${path}`,
          authorization_servers: auth.resourceMetadata.authorizationServers,
          scopes_supported: auth.resourceMetadata.scopesSupported ?? [],
          bearer_methods_supported: ['header'],
        });
      }
      if (url.pathname !== path) return sendJson(res, 404, { error: 'not_found' });
      const authInfo = await authenticate(req);
      if (authInfo === null) return unauthorized(req, res);
      if (authInfo) (req as IncomingMessage & { auth?: AuthInfo }).auth = authInfo;
      await handleMcp(req, res);
    })().catch((error: unknown) => {
      logger('error', 'unhandled HTTP error', { message: error instanceof Error ? error.message : String(error) });
      if (!res.headersSent) jsonRpcError(res, 500, -32603, 'Internal server error');
      else res.end();
    });
  });

  return {
    httpServer,
    /** Starts listening and resolves with the MCP endpoint URL. */
    listen(): Promise<RunningHttpServer> {
      return new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(options.port ?? 3333, host, () => {
          httpServer.off('error', reject);
          const address = httpServer.address() as AddressInfo;
          const shownHost = address.family === 'IPv6' ? `[${address.address}]` : address.address;
          const url = `http://${shownHost}:${address.port}${path}`;
          if (!loopback && !authRequired) {
            logger('warn', `MCP endpoint ${url} is reachable from the network without authentication`);
          }
          logger('info', `MCP Streamable HTTP endpoint listening on ${url}`, { tools: registry.list().length });
          resolve({
            httpServer,
            url,
            close: () =>
              new Promise<void>((done, fail) => {
                httpServer.closeAllConnections?.();
                httpServer.close((e) => (e ? fail(e) : done()));
              }),
          });
        });
      });
    },
  };
}
