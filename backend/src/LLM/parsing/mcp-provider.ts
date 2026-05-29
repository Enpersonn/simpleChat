// Optional MCP bridge for story parsing. Not imported by pipeline.ts or skills.ts.
//
// Usage: add @llm-helpers/an-mcp-runtime-handler to backend/package.json, then:
//
//   import { buildMcpToolSystem } from './parsing/mcp-provider.js';
//   import { createParsingSkillRunner } from './parsing/skills.js';
//
//   const tools = await buildMcpToolSystem([
//     { name: 'tropes', command: 'node', args: ['./mcp-servers/trope-lookup.js'] },
//   ]);
//   const runner = createParsingSkillRunner({ tools });
//
// MCP tools are available inside skills as ctx.tool('mcp.<serverName>.<toolName>', args).
// Skills that depend on MCP tools declare them in needs.tools for startup validation.

import {
	createMcpClient,
	createMcpManager,
	createStdioTransport,
} from '@llm-helpers/an-mcp-runtime-handler';
import type { ToolSystem } from '@llm-helpers/tools';
import { createMcpProvider, createToolSystem } from '@llm-helpers/tools';

export type McpServerConfig = {
	args?: string[];
	command: string;
	env?: Record<string, string>;
	name: string;
};

export async function buildMcpToolSystem(
	servers: McpServerConfig[],
): Promise<ToolSystem> {
	const serverMap: Record<
		string,
		{ client: ReturnType<typeof createMcpClient> }
	> = {};

	for (const s of servers) {
		serverMap[s.name] = {
			client: createMcpClient(
				createStdioTransport({
					args: s.args ?? [],
					command: s.command,
				}),
			),
		};
	}

	const manager = createMcpManager({ servers: serverMap });
	await manager.connectAll();

	return createToolSystem({
		providers: [
			createMcpProvider({
				callTool: async ({
					arguments: args,
					name,
					options,
					serverName,
				}) =>
					manager.callTool({
						arguments: args,
						name,
						options,
						serverName,
					}),
				listTools: async () => manager.listTools(),
			}),
		],
	});
}
