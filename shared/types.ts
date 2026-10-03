export type Gender = 'male' | 'female' | 'undefined' | 'animal';
export type Stage = 'new' | 'flirting' | 'love' | 'steady' | 'separated' | 'divorced';
export interface CompanionDraft {
  name: string;
  userGender: Gender;
  gender: Gender;
  animalType: string;
  personalityIds: string[];
  stage: Stage;
  background: string;
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
}
export interface ApiSettings {
  provider: 'siliconflow' | 'siliconflow-international' | 'custom';
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
