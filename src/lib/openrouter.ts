import type { StructuredToolDefinition } from '@/lib/agent/structuredTools';

export type OpenRouterRole = 'system' | 'user' | 'assistant' | 'tool';

export interface OpenRouterToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenRouterMessage {
  role: OpenRouterRole;
  content: string | null;
  tool_call_id?: string;
  tool_calls?: OpenRouterToolCall[];
}

export interface OpenRouterChoice {
  message?: {
    role?: string;
    content?: string | null;
    tool_calls?: OpenRouterToolCall[];
  };
}

export interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
  error?: {
    message?: string;
  };
}

interface CreateOpenRouterCompletionOptions {
  messages: OpenRouterMessage[];
  tools?: StructuredToolDefinition[];
  temperature?: number;
  toolChoice?: 'auto' | 'none';
  parallelToolCalls?: boolean;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';

export async function createOpenRouterCompletion({
  messages,
  tools,
  temperature = 0.2,
  toolChoice = 'auto',
  parallelToolCalls = false,
}: CreateOpenRouterCompletionOptions): Promise<OpenRouterResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured.');
  }

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'irop-agent-prototype',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL,
      messages,
      tools,
      tool_choice: tools?.length ? toolChoice : undefined,
      parallel_tool_calls: tools?.length ? parallelToolCalls : undefined,
      temperature,
    }),
  });

  const payload = (await response.json()) as OpenRouterResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message || 'OpenRouter request failed.');
  }

  return payload;
}
