import type { StreamEvent } from '../../../core/types';

/** Parse streaming UTF-8 SSE, including events split across network reads. */
export async function consumeEvents(
  response: Response,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  if (!response.body) throw new Error('服务没有返回可读取的内容');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let lines: string[] = [];
  let finished = false;
  const handleLine = (line: string) => {
    if (finished) return;
    if (line === '') {
      if (!lines.length) return;
      const json = lines.join('\n');
      lines = [];
      const event = JSON.parse(json) as StreamEvent;
      if (!event || !['delta', 'done', 'error'].includes(event.type))
        throw new Error('服务返回了未知消息格式');
      if (event.type === 'delta' && typeof event.text !== 'string')
        throw new Error('服务返回了无效的回复');
      if (event.type === 'done' || event.type === 'error') finished = true;
      onEvent(event);
    } else if (line.startsWith('data:')) lines.push(line.slice(5).replace(/^ /, ''));
  };
  const handleChunk = (chunk: string, atEnd = false) => {
    pending += chunk;
    // Keep a trailing CR until its potential LF arrives in the next read.
    while (true) {
      const index = pending.search(/[\r\n]/);
      if (index < 0 || (!atEnd && index === pending.length - 1 && pending[index] === '\r')) break;
      const width = pending[index] === '\r' && pending[index + 1] === '\n' ? 2 : 1;
      handleLine(pending.slice(0, index));
      pending = pending.slice(index + width);
    }
  };
  try {
    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;
      handleChunk(decoder.decode(value, { stream: true }));
    }
    handleChunk(decoder.decode(), true);
    if (pending) handleLine(pending);
    handleLine('');
    if (!finished) throw new Error('连接提前中断，请重试');
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
