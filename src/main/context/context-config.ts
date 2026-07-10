export interface ContextCompactionConfig {
  maxToolOutputChars: number;
  compactionTokenThreshold: number;
  keepRecentMessages: number;
  summaryMessageCharLimit: number;
  summaryMaxTokens: number;
}

export const defaultContextCompactionConfig: ContextCompactionConfig = {
  maxToolOutputChars: 2000,
  compactionTokenThreshold: 80_000,
  keepRecentMessages: 8,
  summaryMessageCharLimit: 500,
  summaryMaxTokens: 1024,
};
