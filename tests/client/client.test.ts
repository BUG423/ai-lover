import { describe, expect, it } from 'vitest';
import { consumeEvents } from '../../packages/ui/src/lib/sse';
import { dataSchema, draftSchema } from '../../packages/ui/src/lib/validation';
import { DEFAULT_DRAFT } from '../../packages/core/catalog';
import type { StreamEvent } from '../../packages/core/types';

function chunkedResponse(value: string): Response {
  const bytes = new TextEncoder().encode(value);
  let index = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (index >= bytes.length) {
          controller.close();
          return;
        }
        controller.enqueue(bytes.slice(index, ++index));
      },
    }),
  );
}
describe('browser stream decoding', () => {
  it('preserves Chinese characters and CRLF boundaries split byte by byte', async () => {
    const events: StreamEvent[] = [];
    await consumeEvents(
      chunkedResponse(
        ': ping\r\n\r\ndata: {"type":"delta","text":"你好🌷"}\r\n\r\ndata: {"type":"done","firstTokenMs":20,"totalMs":30}\r\n\r\n',
      ),
      (e) => events.push(e),
    );
    expect(events[0].text).toBe('你好🌷');
    expect(events[1].type).toBe('done');
  });
  it('detects truncated connections rather than reporting success', async () => {
    await expect(
      consumeEvents(chunkedResponse('data: {"type":"delta","text":"未完"}\n\n'), () => {}),
    ).rejects.toThrow('连接提前中断');
  });
  it('accepts a final error without a terminal newline', async () => {
    const events: StreamEvent[] = [];
    await consumeEvents(chunkedResponse('data: {"type":"error","message":"余额不足"}'), (e) =>
      events.push(e),
    );
    expect(events[0].message).toBe('余额不足');
  });
  it('finishes on a terminal event even if the connection stays open', async () => {
    let canceled = false;
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode('data: {"type":"done","firstTokenMs":20,"totalMs":30}\n\n'),
          );
        },
        cancel() {
          canceled = true;
        },
      }),
    );
    await consumeEvents(response, () => {});
    expect(canceled).toBe(true);
  });
});
describe('local data and profile validation', () => {
  it('migrates a legacy description as companion facts and defaults user facts to empty', () => {
    const { userBackground: _removed, ...legacy } = {
      ...DEFAULT_DRAFT,
      name: '小雨',
      background: '硕士，喜欢骑行',
    };
    const result = draftSchema.parse(legacy);
    expect(result.background).toBe('硕士，喜欢骑行');
    expect(result.userBackground).toBe('');
    expect(
      draftSchema.parse({ ...result, userBackground: '本科生，喜欢唱歌' }).userBackground,
    ).toBe('本科生，喜欢唱歌');
  });
  it('requires animal type without imposing a personality on gender', () => {
    expect(
      draftSchema.safeParse({ ...DEFAULT_DRAFT, name: '阿狸', gender: 'animal' }).success,
    ).toBe(false);
    expect(
      draftSchema.safeParse({
        ...DEFAULT_DRAFT,
        name: '阿狸',
        gender: 'animal',
        animalType: '狐狸',
        personalityIds: ['rational'],
      }).success,
    ).toBe(true);
  });
  it('rejects orphaned messages, duplicate companions and invalid local profiles', () => {
    const base = { version: 1, companions: [], conversations: {}, activeId: null };
    expect(dataSchema.safeParse({ ...base, conversations: { orphan: [] } }).success).toBe(false);
    expect(dataSchema.safeParse({ ...base, companions: [{ name: '<script>' }] }).success).toBe(
      false,
    );
  });
});
