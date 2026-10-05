import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DRAFT } from '../shared/catalog';
import type { Message } from '../shared/types';
import { loadData, persistData } from '../src/lib/storage';

const DATA_KEY = 'zhixin.data.v1';
const companionId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const assistantId = '33333333-3333-4333-8333-333333333333';

describe('profile and conversation upgrade', () => {
  let entries: Map<string, string>;

  beforeEach(() => {
    entries = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  function legacyData() {
    const { userBackground: _removed, ...profile } = DEFAULT_DRAFT;
    return {
      version: 1,
      companions: [
        {
          ...profile,
          id: companionId,
          name: '小雨',
          background: '文学硕士，喜欢爵士乐',
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      conversations: {
        [companionId]: [
          {
            id: userId,
            role: 'user',
            content: '你喜欢什么音乐？',
            createdAt: 3,
            status: 'complete',
          },
          {
            id: assistantId,
            role: 'assistant',
            content: '你喜欢爵士乐，可以跟小雨聊聊。',
            createdAt: 4,
            status: 'complete',
          },
        ],
      },
      activeId: companionId,
    };
  }

  it('retains original profile, user messages and assistant text while excluding legacy replies', () => {
    const original = legacyData();
    entries.set(DATA_KEY, JSON.stringify(original));
    const { data, warning } = loadData();
    expect(warning).toBeUndefined();
    expect(data.companions[0]).toEqual({ ...original.companions[0], userBackground: '' });
    expect(data.conversations[companionId][0]).toEqual(original.conversations[companionId][0]);
    expect(data.conversations[companionId][1]).toEqual({
      ...original.conversations[companionId][1],
      excludeFromContext: true,
    });
    expect(data.activeId).toBe(companionId);
    // Loading alone must not overwrite the original payload.
    expect(entries.get(DATA_KEY)).toBe(JSON.stringify(original));
  });

  it('migrates once and allows new replies to participate in remembered context after reload', () => {
    entries.set(DATA_KEY, JSON.stringify(legacyData()));
    const { data } = loadData();
    const newReply: Message = {
      id: '44444444-4444-4444-8444-444444444444',
      role: 'assistant',
      content: '我喜欢爵士乐，尤其喜欢即兴的部分。',
      createdAt: 5,
      status: 'complete',
    };
    data.conversations[companionId].push(newReply);
    persistData(data);
    const reloaded = loadData().data;
    expect(reloaded.conversations[companionId][1].excludeFromContext).toBe(true);
    expect(reloaded.conversations[companionId][2]).toEqual(newReply);
    expect(
      reloaded.conversations[companionId]
        .filter((message) => message.status === 'complete' && !message.excludeFromContext)
        .map((message) => message.content),
    ).toEqual(['你喜欢什么音乐？', newReply.content]);
    persistData(reloaded);
    expect(loadData().data).toEqual(reloaded);
  });

  it('keeps current-version replies and both profile descriptions through an interrupted stream', () => {
    const current = legacyData();
    entries.set(
      DATA_KEY,
      JSON.stringify({
        ...current,
        companions: [{ ...current.companions[0], userBackground: '设计本科生，喜欢猫' }],
        conversations: {
          [companionId]: current.conversations[companionId].map((message) =>
            message.role === 'assistant' ? { ...message, status: 'streaming' } : message,
          ),
        },
      }),
    );
    const { data } = loadData();
    expect(data.companions[0].background).toBe('文学硕士，喜欢爵士乐');
    expect(data.companions[0].userBackground).toBe('设计本科生，喜欢猫');
    expect(data.conversations[companionId][1].status).toBe('stopped');
    expect(data.conversations[companionId][1].excludeFromContext).toBeUndefined();
    expect(data.conversations[companionId][1].content).toBe(
      current.conversations[companionId][1].content,
    );
  });

  it('preserves unreadable local data and does not suggest the removed import feature', () => {
    const raw = '{incomplete payload';
    entries.set(DATA_KEY, raw);
    const { data, warning } = loadData();
    expect(data.companions).toHaveLength(0);
    expect(warning).toContain('原始数据已保留');
    expect(warning).not.toContain('导入');
    expect(entries.get(DATA_KEY)).toBe(raw);
  });
});
