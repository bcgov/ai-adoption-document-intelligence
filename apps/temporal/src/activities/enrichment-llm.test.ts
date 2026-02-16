/**
 * Unit tests for enrichment LLM (prompt construction, response parsing, API call mocked)
 */

import axios from 'axios';
import {
  buildEnrichmentSystemMessage,
  buildEnrichmentUserMessage,
  parseEnrichmentResponse,
  callAzureOpenAI,
  llmChangesToEnrichmentChanges,
  stripBackslashes,
  redactPiiInText,
  type LlmEnrichmentRequest,
} from './enrichment-llm';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;
(mockedAxios as { isAxiosError: (p: unknown) => boolean }).isAxiosError = (p: unknown) =>
  typeof p === 'object' && p !== null && (p as { isAxiosError?: boolean }).isAxiosError === true;

describe('buildEnrichmentSystemMessage', () => {
  it('returns system message with OCR expert role', () => {
    const msg = buildEnrichmentSystemMessage();
    expect(msg).toContain('OCR');
    expect(msg).toContain('JSON');
  });
});

describe('redactPiiInText', () => {
  it('redacts SIN-like patterns (xxx-xxx-xxx)', () => {
    expect(redactPiiInText('SIN 802-507-116')).toBe('SIN [SIN]');
    expect(redactPiiInText('123 456 789')).toBe('[SIN]');
  });
  it('redacts phone-like patterns', () => {
    expect(redactPiiInText('(194) 590-9862')).toBe('[PHONE]');
    expect(redactPiiInText('802-507-1162')).toBe('[PHONE]');
  });
  it('redacts dollar amounts', () => {
    expect(redactPiiInText('$8.227:11')).toContain('[AMOUNT]');
    expect(redactPiiInText('$1,234.56')).toContain('[AMOUNT]');
  });
  it('leaves other text unchanged', () => {
    expect(redactPiiInText('Applicant Print Name')).toBe('Applicant Print Name');
  });
});

describe('stripBackslashes', () => {
  it('leaves text without backslashes unchanged', () => {
    expect(stripBackslashes('hello world')).toBe('hello world');
  });

  it('strips all backslashes', () => {
    expect(stripBackslashes('C:\\path\\to\\file')).toBe('C:pathtofile');
    expect(stripBackslashes('a\\sb\\x')).toBe('asbx');
    expect(stripBackslashes('end\\')).toBe('end');
  });

  it('strips multiple consecutive backslashes', () => {
    expect(stripBackslashes('a\\\\b')).toBe('ab');
  });

  it('produces a string with no backslashes so JSON serialization has no invalid escapes', () => {
    const raw = 'text with \\s and \\y and trailing\\';
    const stripped = stripBackslashes(raw);
    const payload = { content: stripped };
    const json = JSON.stringify(payload);
    expect(json).not.toMatch(/\\[^"\\/bfnrtu]/);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

describe('buildEnrichmentUserMessage', () => {
  it('includes extracted text and fields JSON', () => {
    const request: LlmEnrichmentRequest = {
      extractedText: 'Sample document text',
      fields: [
        { fieldKey: 'Date', value: '2O24-0l-15', expectedType: 'date', confidence: 0.7 },
        { fieldKey: 'Amount', value: '1,234', expectedType: 'number', confidence: 0.75 },
      ],
    };
    const msg = buildEnrichmentUserMessage(request);
    expect(msg).toContain('Sample document text');
    expect(msg).toContain('Date');
    expect(msg).toContain('2O24-0l-15');
    expect(msg).toContain('Amount');
    expect(msg).toContain('correctedValues');
    expect(msg).toContain('summary');
    expect(msg).toContain('changes');
  });

  it('produces a payload that serializes to valid JSON', () => {
    const request: LlmEnrichmentRequest = {
      extractedText: 'Text with special chars: $8.227 (250/P)',
      fields: [
        { fieldKey: 'path', value: 'C:\\folder\\file', expectedType: 'string', confidence: 0.5 },
      ],
    };
    const msg = buildEnrichmentUserMessage(request);
    const payload = { messages: [{ role: 'user', content: msg }] };
    const json = JSON.stringify(payload);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('strips backslashes from extractedText and field values only (embedded JSON kept valid)', () => {
    const request: LlmEnrichmentRequest = {
      extractedText: 'Doc with \\s and \\z',
      fields: [
        { fieldKey: 'key\\with\\slash', value: 'val\\ue', expectedType: 'string', confidence: 0.5 },
      ],
    };
    const msg = buildEnrichmentUserMessage(request);
    expect(msg).toContain('Doc with s and z');
    expect(msg).toContain('keywithslash');
    expect(msg).toContain('value');
    const payload = { messages: [{ role: 'user', content: msg }] };
    const json = JSON.stringify(payload);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

describe('parseEnrichmentResponse', () => {
  it('parses plain JSON response', () => {
    const json = JSON.stringify({
      correctedValues: { Date: '2024-01-15', Amount: '1234' },
      summary: 'Fixed date and number.',
      changes: [
        { fieldKey: 'Date', originalValue: '2O24-0l-15', correctedValue: '2024-01-15', reason: 'OCR confusion' },
      ],
    });
    const result = parseEnrichmentResponse(json);
    expect(result.correctedValues).toEqual({ Date: '2024-01-15', Amount: '1234' });
    expect(result.summary).toBe('Fixed date and number.');
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].fieldKey).toBe('Date');
  });

  it('strips markdown code fence', () => {
    const inner = JSON.stringify({
      correctedValues: {},
      summary: 'No changes',
      changes: [],
    });
    const wrapped = '```json\n' + inner + '\n```';
    const result = parseEnrichmentResponse(wrapped);
    expect(result.summary).toBe('No changes');
  });

  it('handles missing fields with defaults', () => {
    const result = parseEnrichmentResponse('{}');
    expect(result.correctedValues).toEqual({});
    expect(result.summary).toBe('');
    expect(result.changes).toEqual([]);
  });
});

describe('llmChangesToEnrichmentChanges', () => {
  it('maps changes with source llm', () => {
    const changes = [
      { fieldKey: 'x', originalValue: 'a', correctedValue: 'b', reason: 'Fixed' },
    ];
    const out = llmChangesToEnrichmentChanges(changes);
    expect(out).toHaveLength(1);
    expect(out[0].fieldKey).toBe('x');
    expect(out[0].originalValue).toBe('a');
    expect(out[0].correctedValue).toBe('b');
    expect(out[0].reason).toBe('Fixed');
    expect(out[0].source).toBe('llm');
  });
});

describe('callAzureOpenAI', () => {
  it('calls Azure OpenAI and returns parsed response', async () => {
    const request: LlmEnrichmentRequest = {
      extractedText: 'Text',
      fields: [{ fieldKey: 'F1', value: 'v1', expectedType: 'string', confidence: 0.5 }],
    };
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                correctedValues: { F1: 'v1-corrected' },
                summary: 'Corrected F1.',
                changes: [
                  { fieldKey: 'F1', originalValue: 'v1', correctedValue: 'v1-corrected', reason: 'Typo' },
                ],
              }),
            },
          },
        ],
      },
    });

    const result = await callAzureOpenAI(request, 'gpt-4o', {
      endpoint: 'https://example.openai.azure.com',
      apiKey: 'test-key',
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/openai/deployments/gpt-4o/chat/completions'),
      expect.stringContaining('"messages"'),
      expect.any(Object)
    );
    expect(result.correctedValues).toEqual({ F1: 'v1-corrected' });
    expect(result.summary).toBe('Corrected F1.');
    expect(result.changes).toHaveLength(1);
  });

  it('throws when response missing content', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { choices: [] } });
    await expect(
      callAzureOpenAI(
        { extractedText: '', fields: [] },
        'gpt-4o',
        { endpoint: 'https://example.com', apiKey: 'key' }
      )
    ).rejects.toThrow('Azure OpenAI response missing choices');
  });

  it('includes Azure response body in error on 400', async () => {
    const azureError = { error: { code: 'InvalidRequest', message: 'Invalid response_format provided.' } };
    mockedAxios.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 400, data: azureError },
    });
    await expect(
      callAzureOpenAI(
        { extractedText: '', fields: [] },
        'gpt-4o',
        { endpoint: 'https://example.com', apiKey: 'key' }
      )
    ).rejects.toThrow(/Invalid response_format/);
  });
});
