/** Read bounded provider responses. Never return response bodies/URLs in error messages. */
export async function boundedJson(response: Response, maxBytes: number): Promise<unknown> {
  if (!response.body) throw new Error('Empty upstream response');
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) throw new Error('Upstream response limit exceeded');
      parts.push(value);
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
