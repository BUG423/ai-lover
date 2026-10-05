export type Gender = 'male' | 'female' | 'undefined' | 'animal';
export type Stage = 'new' | 'flirting' | 'love' | 'steady' | 'separated' | 'divorced';
export interface CompanionDraft {
  name: string;
  userGender: Gender;
  gender: Gender;
  animalType: string;
  personalityIds: string[];
  stage: Stage;
  /** Background facts about the companion, including legacy optional descriptions. */
  background: string;
  /** Background facts about the user, kept separate from the companion's identity. */
  userBackground: string;
  avatar: string;
  color: string;
}
export interface Companion extends CompanionDraft {
  id: string;
  createdAt: number;
  updatedAt: number;
}
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  status: 'complete' | 'streaming' | 'error' | 'stopped';
  error?: string;
  /** Keep the original reply visible while preventing legacy role errors from propagating. */
  excludeFromContext?: boolean;
}
export interface ApiSettings {
  provider: 'mimo' | 'siliconflow';
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  remember: boolean;
}
export interface AppData {
  version: 1;
  companions: Companion[];
  conversations: Record<string, Message[]>;
  activeId: string | null;
}
export interface StreamEvent {
  type: 'delta' | 'done' | 'error';
  text?: string;
  message?: string;
  firstTokenMs?: number;
  totalMs?: number;
}
