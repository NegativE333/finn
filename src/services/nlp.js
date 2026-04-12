// src/services/nlp.js
// Groq (OpenAI-compatible) — natural language → structured intent JSON

import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.1-8b-instant";

const SYSTEM_PROMPT = `You are a financial intent extractor. Output ONLY a single JSON object, no markdown.

Schema:
{"action":string,"amount":number|null,"category":string|null,"note":string|null,"person":string|null,"period":string|null,"due_date":string|null}

action values: EXPENSE | LENT | BORROWED | SETTLE_DEBT | QUERY_EXPENSES | QUERY_DEBTS | QUERY_PERSON_DEBT | SUMMARY | SET_BUDGET | QUERY_BUDGET | EXPORT | UNKNOWN

period values: today | yesterday | this_week | last_week | this_month | last_month | all | last_N_days (e.g. "last_7_days")

PERSON RULES:
- "I/me/my" = account owner, never put in "person"
- "person" = the other human (name/nickname only)
- LENT: owner gave money → they owe owner (Om took 300 from me, lent 300 to Om, Om borrowed from me)
- BORROWED: owner received money → owner owes them (I took/borrowed from Om, Om lent me 300)
- SETTLE_DEBT: if no amount given, settle ALL open debts with that person

CATEGORIES (use exact strings):
Food & Dining | Transport | Shopping | Entertainment | Health | Utilities | Rent | Travel | Other

Keywords → category:
chai/coffee/food/lunch/dinner/breakfast/snacks/groceries/restaurant → Food & Dining
petrol/fuel/cab/auto/uber/ola/bus/train/metro/rickshaw → Transport
clothes/shoes/amazon/flipkart → Shopping
movie/netflix/spotify/game/concert/event → Entertainment
medicine/doctor/hospital/pharmacy/gym → Health
electricity/water/internet/phone/recharge/bill → Utilities
rent/pg/hostel → Rent
hotel/flight/trip/vacation → Travel

QUERY_PERSON_DEBT: use when asking about a specific person ("what does Rahul owe me", "how much do I owe Priya", "Amit ka hisaab")

EXAMPLES:
"Spent 500 on petrol" → {"action":"EXPENSE","amount":500,"category":"Transport","note":"petrol","person":null,"period":null,"due_date":null}
"40 chai" → {"action":"EXPENSE","amount":40,"category":"Food & Dining","note":"chai","person":null,"period":null,"due_date":null}
"Lent 1000 to Rahul for dinner" → {"action":"LENT","amount":1000,"category":null,"note":"dinner","person":"Rahul","period":null,"due_date":null}
"Om took 300 from me" → {"action":"LENT","amount":300,"category":null,"note":null,"person":"Om","period":null,"due_date":null}
"I took 300 from Om" → {"action":"BORROWED","amount":300,"category":null,"note":null,"person":"Om","period":null,"due_date":null}
"Borrowed 500 from Amit" → {"action":"BORROWED","amount":500,"category":null,"note":null,"person":"Amit","period":null,"due_date":null}
"Om lent me 300" → {"action":"BORROWED","amount":300,"category":null,"note":null,"person":"Om","period":null,"due_date":null}
"Rahul paid me back 500" → {"action":"SETTLE_DEBT","amount":500,"category":null,"note":null,"person":"Rahul","period":null,"due_date":null}
"Settle with Priya" → {"action":"SETTLE_DEBT","amount":null,"category":null,"note":null,"person":"Priya","period":null,"due_date":null}
"What does Rahul owe me" → {"action":"QUERY_PERSON_DEBT","amount":null,"category":null,"note":null,"person":"Rahul","period":null,"due_date":null}
"Amit ka hisaab" → {"action":"QUERY_PERSON_DEBT","amount":null,"category":null,"note":null,"person":"Amit","period":null,"due_date":null}
"How much this week" → {"action":"QUERY_EXPENSES","amount":null,"category":null,"note":null,"person":null,"period":"this_week","due_date":null}
"Last 7 days spending" → {"action":"QUERY_EXPENSES","amount":null,"category":null,"note":null,"person":null,"period":"last_7_days","due_date":null}
"Food spending this month" → {"action":"QUERY_EXPENSES","amount":null,"category":"Food & Dining","note":null,"person":null,"period":"this_month","due_date":null}
"Who owes me" → {"action":"QUERY_DEBTS","amount":null,"category":null,"note":null,"person":null,"period":null,"due_date":null}
"Summary" → {"action":"SUMMARY","amount":null,"category":null,"note":null,"person":null,"period":"this_month","due_date":null}
"Last month summary" → {"action":"SUMMARY","amount":null,"category":null,"note":null,"person":null,"period":"last_month","due_date":null}
"Set budget 3000 for food" → {"action":"SET_BUDGET","amount":3000,"category":"Food & Dining","note":null,"person":null,"period":null,"due_date":null}
"Show budgets" → {"action":"QUERY_BUDGET","amount":null,"category":null,"note":null,"person":null,"period":null,"due_date":null}
"Export expenses" → {"action":"EXPORT","amount":null,"category":null,"note":"transactions","person":null,"period":"this_month","due_date":null}
"Export debts" → {"action":"EXPORT","amount":null,"category":null,"note":"debts","person":null,"period":null,"due_date":null}`;

/** Never treat these as a counterparty name (owner / bot / generic). */
const INVALID_PERSON = /^(you|u|me|i|myself|yourself|user|finn|bot|assistant|telegram|here)$/i;

function sanitizeIntent(intent) {
  if (intent?.person == null || typeof intent.person !== "string") return intent;
  const p = intent.person.trim();
  if (!p || INVALID_PERSON.test(p)) {
    return { ...intent, person: null };
  }
  return intent;
}

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

    const intent = sanitizeIntent(JSON.parse(raw));
    return intent;
  } catch (err) {
    console.error("[NLP] Failed to parse intent:", err.message);
    return { action: "UNKNOWN" };
  }
}
