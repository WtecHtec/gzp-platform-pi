import type { ToolStep } from '../../shared/contracts';

// ---------------------------------------------------------------------------
// Agent error → human-readable string
// ---------------------------------------------------------------------------

export function readableAgentError(error: unknown): string {
  const message = error instanceof Error ? error.message : '未知错误';
  if (message.includes('AGENT_CANCELLED')) return '已停止生成。';
  const intentReason = message.split('INTENT_REJECTED:')[1];
  if (intentReason) return intentReason;
  if (message.includes('MODEL_API_KEY_MISSING')) {
    return '尚未配置 API Key，请先打开设置完成模型配置。';
  }
  if (
    message.includes('MODEL_STRUCTURED_OUTPUT_INVALID') ||
    message.includes('MODEL_RESPONSE_INVALID') ||
    message.includes('MODEL_TOPICS_INVALID')
  ) {
    return '模型返回的数据格式不完整，请重试或更换模型。';
  }
  if (
    message.includes('network_error') ||
    message.includes('fetch failed') ||
    message.includes('ECONNREFUSED') ||
    message.includes('ENOTFOUND') ||
    message.includes('timeout')
  ) {
    return `接口请求失败：网络连接异常或接口超时 (${message.includes('network_error') ? 'network_error' : '网络连接错误'})。\n\n这通常是因为：\n1. **API 地址 (Base URL)** 填写错误，或者该服务接口不可达。\n2. 代理软件/VPN 设置阻止了请求，或者本地没有正常连接到网络。\n3. API Key 填错、额度耗尽或账号被封禁导致请求被拒。`;
  }
  return `生成失败：${message}`;
}

// ---------------------------------------------------------------------------
// ToolStep → display ViewModel
// ---------------------------------------------------------------------------

export interface ToolStepViewModel extends ToolStep {
  statusText: string;
  statusClass: 'pending' | 'done' | 'error';
}

export function toToolStepViewModel(step: ToolStep): ToolStepViewModel {
  let statusText: string;
  let statusClass: 'pending' | 'done' | 'error';

  if (!step.completed) {
    statusText = '…';
    statusClass = 'pending';
  } else if (step.isError) {
    statusText = '×';
    statusClass = 'error';
  } else {
    statusText = '✓';
    statusClass = 'done';
  }

  return { ...step, statusText, statusClass };
}
