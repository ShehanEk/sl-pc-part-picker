import Anthropic from '@anthropic-ai/sdk'

import type { Category } from '@/scrapers/types'

/**
 * The one place a model is used in this codebase: fuzzy title → canonical part
 * matching at ingest time.
 *
 * Two rules shape this prompt, both from the project spec:
 *
 *  - The model is only ever asked to *choose among candidates we supply*, never
 *    to recall a specification from memory. Every fact it sees is one we read
 *    off a page.
 *  - It runs at ingest, never at query time. Compatibility answers stay
 *    deterministic, because a wrong "your PSU is fine" is a dead motherboard.
 *
 * Declining to match is a first-class answer. An unmatched row is a gap in the
 * data; a wrongly matched row is a wrong price shown to a real buyer.
 */

const MODEL = 'claude-haiku-4-5-20251001'

export type Candidate = {
  partId: string
  model: string
  brand: string
}

export type AiMatch = {
  partId: string | null
  confidence: 'high' | 'low'
  reason: string
}

let client: Anthropic | null = null

export function aiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
    client = new Anthropic({ apiKey })
  }
  return client
}

const SYSTEM = `You match a retailer's product listing title to a canonical PC part.

You will be given a listing title, its category, and a list of candidate parts.
Choose the candidate that refers to the SAME product, or decline.

Rules:
- Only choose a candidate from the supplied list. Never invent a part_id.
- Judge only from the title text given. Do not use remembered specifications.
- Different capacity, wattage or efficiency tier means a DIFFERENT product.
  "RTX 5070 12GB" is not "RTX 5070 Ti 16GB". "850W Gold" is not "850W Platinum".
- A variant suffix is part of the product name, not decoration. SUPER, Ti, XT
  and XTX each denote a distinct card at a distinct price:
  "RTX 4070 SUPER" is NOT "RTX 4070". "RX 9070 XT" is NOT "RX 9070".
- An architecture or product-line name is likewise part of the identity, because
  the same number is reused across generations: "RTX PRO 2000 Blackwell" is NOT
  "RTX 2000 Ada". Treat Ada, Blackwell, Ampere, Turing and the PRO/A-series
  workstation lines as distinguishing.
- Never settle for the nearest available candidate. If the exact product is not
  in the list, return null even when something close to it is. "The closest
  match is X" is always the wrong answer — return null instead.
- Board partner, cooler name, colour and warranty text do not make a different
  product: an ASUS TUF and an MSI Ventus RTX 5070 12GB are the same part.
- If no candidate is clearly the same product, return null. Declining is correct
  and expected — a wrong match shows a shopper the wrong price.`

/**
 * Ask the model to pick a canonical part for a title we could not parse.
 * Returns a null partId when it declines or when anything goes wrong: this path
 * must never be able to fail the whole ingest run.
 */
export async function matchTitleToPart(
  rawTitle: string,
  category: Category,
  candidates: Candidate[],
): Promise<AiMatch> {
  if (candidates.length === 0) {
    return { partId: null, confidence: 'low', reason: 'no candidates supplied' }
  }

  const tool: Anthropic.Tool = {
    name: 'report_match',
    description: 'Report which canonical part the listing refers to.',
    input_schema: {
      type: 'object',
      properties: {
        part_id: {
          type: ['string', 'null'],
          description: 'A part_id from the candidate list, or null to decline.',
        },
        confidence: { type: 'string', enum: ['high', 'low'] },
        reason: { type: 'string', description: 'One short sentence.' },
      },
      required: ['part_id', 'confidence', 'reason'],
    },
  }

  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 512,
      system: SYSTEM,
      tools: [tool],
      tool_choice: { type: 'tool', name: 'report_match' },
      messages: [
        {
          role: 'user',
          content: [
            `Category: ${category}`,
            `Listing title: ${rawTitle}`,
            '',
            'Candidates:',
            ...candidates.map((c) => `- ${c.partId} | ${c.brand} | ${c.model}`),
          ].join('\n'),
        },
      ],
    })

    const block = response.content.find((c) => c.type === 'tool_use')
    if (!block || block.type !== 'tool_use') {
      return { partId: null, confidence: 'low', reason: 'model returned no tool call' }
    }

    const input = block.input as {
      part_id?: string | null
      confidence?: string
      reason?: string
    }

    // Guard against a hallucinated id: only accept something we offered.
    const chosen =
      input.part_id && candidates.some((c) => c.partId === input.part_id)
        ? input.part_id
        : null

    return {
      partId: chosen,
      confidence: input.confidence === 'high' ? 'high' : 'low',
      reason: input.reason ?? '',
    }
  } catch (err) {
    return {
      partId: null,
      confidence: 'low',
      reason: `ai call failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
