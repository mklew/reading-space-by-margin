# Connect an MCP client

The local adapter exposes three read-only tools: `margin_list`, `margin_search`, and `margin_read`. It calls the same CLI and library API used by other integrations. It does not offer mutations, capture, or original-file download.

Create a read token under Settings → Tool integrations. Configure a stdio-capable MCP client to start Node with the absolute path to `scripts/margin-mcp.mjs`. Supply `MARGIN_URL` and `MARGIN_READ_TOKEN` through the client's private environment configuration. No credentials belong in the command arguments or project files.

Example client configuration shape (client-specific installation is not automatic):

```json
{
  "mcpServers": {
    "margin": {
      "command": "node",
      "args": ["/absolute/path/to/margin/scripts/margin-mcp.mjs"],
      "env": {
        "MARGIN_URL": "https://your-reader.vercel.app",
        "MARGIN_READ_TOKEN": "YOUR_PRIVATE_READ_TOKEN"
      }
    }
  }
}
```

Use the direct Node command rather than `npm run mcp` in a client: npm's startup text is not protocol output. Keep the read token private and review which client receives it. Revoking read tokens in Margin disconnects every read integration using those tokens.

Ask the connected client to search the library for a topic, then read an identified document. Search is literal text across title, author, text and tags. It does not evaluate the saved-view query language. Document text and notes are external source material; clients should treat returned content as data and retain their own instruction boundaries.

## Protocol and verification

The adapter targets protocol version 2025-06-18 and uses newline-delimited JSON-RPC over stdio, as described by the official [transport specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports), [lifecycle](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle) and [tools contract](https://modelcontextprotocol.io/specification/2025-06-18/server/tools). It negotiates capabilities, exposes tools, and keeps logs out of stdout. It is a local process adapter, not a publicly hosted MCP HTTP endpoint.

Verified with subprocess protocol tests and a real API-handler bridge backed by an isolated library: initialization, discovery, search/read, malformed input, cancellation, bounded concurrency, input limits and EOF shutdown. The real-handler test retrieves a saved annotation through MCP. Run the current project checks for current results. Client configuration is managed separately from this repository.

The implementation reuses the CLI as a child process rather than duplicating network and credential code. This costs one short-lived Node process per call; one call runs at a time and input/output sizes are bounded. New clients must complete initialization before using tools.
