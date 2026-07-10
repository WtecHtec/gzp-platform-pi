import type {
  AgentTool,
  AgentToolResult,
} from '@earendil-works/pi-agent-core';
import ToolOutputCompactor from './tool-output-compactor';

function isTextContent(
  content: AgentToolResult<unknown>['content'][number],
): content is Extract<
  AgentToolResult<unknown>['content'][number],
  { type: 'text' }
> {
  return content.type === 'text';
}

export default function compactToolResults(
  tools: AgentTool[],
  compactor: ToolOutputCompactor,
): AgentTool[] {
  return tools.map((tool) => ({
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate) => {
      const result = await tool.execute(toolCallId, params, signal, onUpdate);
      const archiveRefs: Array<{
        path: string;
        originalChars: number;
      }> = [];
      const content = await Promise.all(
        result.content.map(async (part) => {
          if (!isTextContent(part)) return part;
          const compacted = await compactor.compactTextContent({
            toolCallId,
            toolName: tool.name,
            content: part,
          });
          if (compacted.archivePath) {
            archiveRefs.push({
              path: compacted.archivePath,
              originalChars: compacted.originalChars || part.text.length,
            });
          }
          return {
            type: 'text' as const,
            text: compacted.text,
          };
        }),
      );

      if (archiveRefs.length === 0) {
        return { ...result, content };
      }

      return {
        ...result,
        content,
        details: {
          ...(typeof result.details === 'object' && result.details !== null
            ? result.details
            : { value: result.details }),
          compactedToolOutput: archiveRefs,
        },
      };
    },
  }));
}
