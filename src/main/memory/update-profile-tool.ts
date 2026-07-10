import type { AgentTool } from '@earendil-works/pi-agent-core';
import SessionProfileStore, { SessionProfile } from './session-profile-store';

function profileFieldValue(profile: SessionProfile, field: string): string {
  if (field === 'account_name') return profile.account_name;
  if (field === 'niche') return profile.niche;
  if (field === 'target_audience') return profile.target_audience;
  if (field === 'tone') return profile.tone;
  if (field === 'posting_schedule') return profile.posting_schedule;
  if (field === 'notes') return profile.notes;
  return '';
}

export default function createUpdateProfileTool(
  sessionId: string,
  profileStore: SessionProfileStore,
): AgentTool {
  return {
    name: 'update_profile',
    label: '更新长期记忆',
    description:
      '当用户明确提供或修正公众号账号的长期性信息（名称、定位、受众、风格偏好、发布节奏、长期规则、补充笔记）时调用，写入该会话绑定的长期记忆。',
    parameters: {
      type: 'object',
      properties: {
        field: {
          type: 'string',
          description:
            '字段名：account_name / niche / target_audience / tone / posting_schedule / notes',
        },
        value: { type: 'string', description: '要写入的长期记忆内容' },
        reason: {
          type: 'string',
          description: '写入依据，引用用户原话或明确说明来源',
        },
      },
      required: ['field', 'value', 'reason'],
    } as any,
    executionMode: 'sequential',
    execute: async (_toolCallId, parameters) => {
      const input = parameters as {
        field: string;
        value: string;
        reason: string;
      };
      const profile = await profileStore.update(sessionId, {
        field: input.field,
        value: input.value,
        reason: input.reason,
      });
      const value =
        input.field === 'notes'
          ? input.value.trim()
          : profileFieldValue(profile, input.field);
      return {
        content: [
          {
            type: 'text',
            text: `已更新长期记忆：${input.field} = ${value}`,
          },
        ],
        details: {
          sessionId,
          field: input.field,
          value,
          reason: input.reason,
        },
      };
    },
  };
}
