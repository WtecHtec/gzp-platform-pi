const writingTerms =
  /公众号|文章|选题|标题|写作|改写|润色|排版|配图|封面|素材|读者|文案|草稿|发布|复盘|风格|范文/;
const continuationTerms =
  /^(继续|可以|好的?|是|否|第?[一二三四五六七八九十\d]+个?|这个|换一个|再短一点|再长一点|更.+一点)$/;
const clearlyUnrelated =
  /写.{0,4}代码|编程|数学题|翻译合同|天气|股票|订机票|播放音乐|闲聊|讲笑话/;

export interface IntentDecision {
  allowed: boolean;
  reason?: string;
}

export default function checkWritingIntent(
  input: string,
  hasActiveWorkflow: boolean,
): IntentDecision {
  const normalized = input.trim();
  if (!normalized) return { allowed: false, reason: '请输入写作需求。' };
  if (clearlyUnrelated.test(normalized)) {
    return {
      allowed: false,
      reason:
        '这个助手只处理公众号文章创作。你可以告诉我想写的主题、目标读者或已有素材。',
    };
  }
  if (writingTerms.test(normalized)) return { allowed: true };
  if (hasActiveWorkflow && continuationTerms.test(normalized)) {
    return { allowed: true };
  }
  return { allowed: true };
}
