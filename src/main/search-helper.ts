export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export function truncateText(str: string, limit = 300): string {
  if (!str) return '';
  return str.length > limit ? str.slice(0, limit) + '... (已截断)' : str;
}

export async function performTavilySearch(
  apiKey: string,
  query: string,
  maxResults: number,
): Promise<SearchResultItem[]> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body}`);
  }

  const data = (await response.json()) as any;
  if (!data.results || !Array.isArray(data.results)) {
    throw new Error('Invalid Tavily response format');
  }

  return data.results.map((r: any) => ({
    title: r.title || '无标题',
    url: r.url || '',
    snippet: truncateText(r.content || ''),
  }));
}

export async function performBraveSearch(
  apiKey: string,
  query: string,
  maxResults: number,
): Promise<SearchResultItem[]> {
  const response = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
      query,
    )}&count=${maxResults}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey,
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body}`);
  }

  const data = (await response.json()) as any;
  const results = data.web?.results || [];
  if (!Array.isArray(results)) {
    throw new Error('Invalid Brave response format');
  }

  return results.map((r: any) => ({
    title: r.title || '无标题',
    url: r.url || '',
    snippet: truncateText(r.description || ''),
  }));
}
