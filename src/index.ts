import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerLawTools } from "./tools/law.js";
import { registerAnnexTools } from "./tools/annex.js";
import { registerMinisterialOrdinanceTools } from "./tools/ministerial-ordinance.js";
import { registerParameterThresholdTools } from "./tools/parameter-thresholds.js";
import { registerCountryTools } from "./tools/country.js";
import { registerUserListTools } from "./tools/user-list.js";
import { registerCatchallTools } from "./tools/catchall.js";

const server = new McpServer({
  name: "export-regulation-mcp",
  version: "0.1.0",
});

// Register all tools
registerLawTools(server);
registerAnnexTools(server);
registerMinisterialOrdinanceTools(server);
registerParameterThresholdTools(server);
registerCountryTools(server);
registerUserListTools(server);
registerCatchallTools(server);

// Start server with stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
