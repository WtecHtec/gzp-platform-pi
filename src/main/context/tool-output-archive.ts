import { promises as fs } from 'fs';
import path from 'path';

export interface ToolOutputArchive {
  save(input: {
    toolCallId: string;
    toolName: string;
    output: string;
  }): Promise<string>;
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'tool-output';
}

export default class WorkspaceToolOutputArchive implements ToolOutputArchive {
  constructor(private readonly workspaceRootFn: () => Promise<string>) {}

  async save(input: {
    toolCallId: string;
    toolName: string;
    output: string;
  }): Promise<string> {
    const workspaceRoot = await this.workspaceRootFn();
    const relativePath = path.join(
      '.gzh-context',
      'tool-outputs',
      `${Date.now()}-${safeName(input.toolName)}-${safeName(
        input.toolCallId,
      )}.txt`,
    );
    const absolutePath = path.join(workspaceRoot, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, input.output, 'utf8');
    return relativePath;
  }
}
