// src/services/nlp.js
// Groq (OpenAI-compatible) — natural language → structured intent JSON

import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.1-8b-instant";

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a financial intent parser for a personal finance Telegram bot.
Extract structured data from the user's message and respond with a single JSON object only — no markdown, no explanation, no code fences.

The JSON must follow this exact schema:
{
  "action": "EXPENSE" | "LENT" | "BORROWED" | "SETTLE_DEBT" | "QUERY_EXPENSES" | "QUERY_DEBTS" | "SUMMARY" | "SET_BUDGET" | "QUERY_BUDGET" | "EXPORT" | "UNKNOWN",
  "amount": number | null,
  "category": string | null,
  "note": string | null,
  "person": string | null,
  "period": "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "all" | null,
  "due_date": "ISO8601 date string" | null
}

Category classification rules (use these exact values):
- Food & Dining: chai, coffee, lunch, dinner, breakfast, restaurant, food, snacks, groceries
- Transport: petrol, fuel, cab, auto, uber, ola, bus, train, metro, rickshaw
- Shopping: clothes, shoes, amazon, flipkart, online shopping
- Entertainment: movie, netflix, spotify, game, event, concert
- Health: medicine, doctor, hospital, pharmacy, gym
- Utilities: electricity, water, internet, phone, recharge, bill
- Rent: rent, pg, hostel
- Travel: hotel, flight, trip, vacation
- Other: anything that doesn't fit above

Examples:
"Spent 500 on petrol" → {"action":"EXPENSE","amount":500,"category":"Transport","note":"petrol","person":null,"period":null,"due_date":null}
"40 for chai" → {"action":"EXPENSE","amount":40,"category":"Food & Dining","note":"chai","person":null,"period":null,"due_date":null}
"Lent 1000 to Rahul for dinner" → {"action":"LENT","amount":1000,"category":null,"note":"dinner","person":"Rahul","period":null,"due_date":null}
"Borrowed 500 from Amit" → {"action":"BORROWED","amount":500,"category":null,"note":null,"person":"Amit","period":null,"due_date":null}
"Rahul paid me back 500" → {"action":"SETTLE_DEBT","amount":500,"category":null,"note":null,"person":"Rahul","period":null,"due_date":null}
"Settle with Rushi" / "Mark settled with Priya" / "All clear with Amit" → SETTLE_DEBT with person set and amount null (means settle every open debt with that person in full)
"How much did I spend yesterday?" → {"action":"QUERY_EXPENSES","amount":null,"category":null,"note":null,"person":null,"period":"yesterday","due_date":null}
"Who owes me money?" → {"action":"QUERY_DEBTS","amount":null,"category":null,"note":null,"person":null,"period":null,"due_date":null}
"Set budget 3000 for food" → {"action":"SET_BUDGET","amount":3000,"category":"Food & Dining","note":null,"person":null,"period":null,"due_date":null}
"Budget for transport" → {"action":"QUERY_BUDGET","amount":null,"category":"Transport","note":null,"person":null,"period":null,"due_date":null}
"Show my budgets" → {"action":"QUERY_BUDGET","amount":null,"category":null,"note":null,"person":null,"period":null,"due_date":null}
"Export this month's expenses" → {"action":"EXPORT","amount":null,"category":null,"note":"transactions","person":null,"period":"this_month","due_date":null}
"Export debts" → {"action":"EXPORT","amount":null,"category":null,"note":"debts","person":null,"period":null,"due_date":null}`;

/**
 * Parse a raw user message into a structured intent object.
 * @param {string} message - Raw Telegram message text
 * @returns {Promise<object>} Parsed intent
 */
export async function parseIntent(message) {
  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: message },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      console.error("[NLP] Empty completion from Groq");
      return { action: "UNKNOWN" };
    }

    const intent = JSON.parse(raw);
    return intent;
  } catch (err) {
    console.error("[NLP] Failed to parse intent:", err.message);
    return { action: "UNKNOWN" };
  }
}
