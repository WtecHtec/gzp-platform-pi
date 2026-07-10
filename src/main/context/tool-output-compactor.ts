import type { TextContent } from '@earendil-works/pi-ai';
import type { ContextCompactionConfig } from './context-config';
import type { ToolOutputArchive } from './tool-output-archive';

export interface ToolOutputCompactionResult {
  output: string;
  archived: boolean;
  archivePath?: string;
  originalChars: number;
}

export default class ToolOutputCompactor {
  constructor(
    private readonly archive: ToolOutputArchive,
    private readonly config: Pick<ContextCompactionConfig, 'maxToolOutputChars'>,
  ) {}

  async compact(input: {
    toolCallId: string;
    toolName: string;
    output: string;
  }): Promise<ToolOutputCompactionResult> {
    if (input.output.length <= this.config.maxToolOutputChars) {
      return {
        output: input.output,
        archived: false,
        originalChars: input.output.length,
      };
    }

    const archivePath = await this.archive.save(input);
    const omittedChars = input.output.length - this.config.maxToolOutputChars;
    return {
      output:
        `${input.output.slice(0, this.config.maxToolOutputChars)}\n` +
        `[...省略 ${omittedChars} 字符，完整工具输出已归档到 ${archivePath}。` +
        `如需完整内容，请使用 read 工具读取该路径。]`,
      archived: true,
      archivePath,
      originalChars: input.output.length,
    };
  }

  async compactTextContent(input: {
    toolCallId: string;
    toolName: string;
    content: TextContent;
  }): Promise<TextContent & { archivePath?: string; originalChars?: number }> {
    const compacted = await this.compact({
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      output: input.content.text,
    });
    return {
      ...input.content,
      text: compacted.output,
      archivePath: compacted.archivePath,
      originalChars: compacted.originalChars,
    };
  }
}
