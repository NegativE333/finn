// src/services/nlp.js
// Groq (OpenAI-compatible) — natural language → structured intent JSON

import Groq from "groq-sdk";
import { withNlpRetries } from "../utils/nlpRetry.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.1-8b-instant";

const SYSTEM_PROMPT = `You are a financial intent extractor. Output ONLY a single JSON object, no markdown.

Schema:
{"action":string,"amount":number|null,"category":string|null,"note":string|null,"person":string|null,"period":string|null,"due_date":string|null,"spent_on":string|null,"salary_day":number|null}

spent_on: For EXPENSE only — if the user gives a calendar date ("on 10 April", "Apr 10", "10/4/2026"), set to ISO "YYYY-MM-DD". If the year is omitted, use the current calendar year; if that would land more than ~30 days in the future, use the previous year. Null if no explicit date. If both spent_on and period are set, spent_on wins.

action values: EXPENSE | LENT | BORROWED | SETTLE_DEBT | QUERY_EXPENSES | QUERY_DEBTS | QUERY_PERSON_DEBT | SUMMARY | SET_BUDGET | QUERY_BUDGET | EXPORT | SALARY_UPDATE | UNKNOWN

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

SALARY_UPDATE:
- Use when user shares monthly salary/income/pay and optionally credit day.
- Examples: "my salary is 85000", "I get 92000 on the 7th", "salary 75000 every 1st".
- Set amount to monthly salary value.
- Set salary_day (1-31) if message includes the credit date/day; else salary_day = null.

CRITICAL — EXPENSE vs QUERY_EXPENSES:
- EXPENSE = user is LOGGING new spending (they state an amount to save: "spent 200", "40 on chai", "paid 500 for fuel").
- QUERY_EXPENSES = user is ASKING for totals (no new transaction). Phrases like "how much did I spend", "how much on chai", "what did I spend on food", "total spent this week", "show my spending on X" → QUERY_EXPENSES with amount null. Put search words (chai, petrol) in "note" and/or map keyword to "category" as usual.
- Never output EXPENSE for question forms (how much / what did / total / show spending) even if the message mentions chai, food, or an amount that sounds like an example.

EXPENSE — when did it happen:
- If the user says the purchase was *yesterday* / *today* (e.g. "Yesterday I spent 50 on snacks"), set "period" to "yesterday" or "today" so it is stored on that day. Default "period": null means "now" / unspecified.
- If they give a *calendar date* ("on 10 April", "spent 200 on 3rd March"), set "spent_on" to "YYYY-MM-DD" and set "period" to null (unless you also need a range — prefer spent_on).

EXAMPLES:
"Spent 500 on petrol" → {"action":"EXPENSE","amount":500,"category":"Transport","note":"petrol","person":null,"period":null,"due_date":null,"spent_on":null}
"Yesterday I spent 10 on ice cream" → {"action":"EXPENSE","amount":10,"category":"Food & Dining","note":"ice cream","person":null,"period":"yesterday","due_date":null,"spent_on":null}
"I spent 10 on chai on 10 April" → {"action":"EXPENSE","amount":10,"category":"Food & Dining","note":"chai","person":null,"period":null,"due_date":null,"spent_on":"2026-04-10"}
"40 on chai" → {"action":"EXPENSE","amount":40,"category":"Food & Dining","note":"chai","person":null,"period":null,"due_date":null,"spent_on":null}
"How much did I spend on chai" → {"action":"QUERY_EXPENSES","amount":null,"category":"Food & Dining","note":"chai","person":null,"period":"this_month","due_date":null,"spent_on":null}
"How much I spent on chai" → {"action":"QUERY_EXPENSES","amount":null,"category":"Food & Dining","note":"chai","person":null,"period":"this_month","due_date":null,"spent_on":null}
"Lent 1000 to Rahul for dinner" → {"action":"LENT","amount":1000,"category":null,"note":"dinner","person":"Rahul","period":null,"due_date":null,"spent_on":null}
"Om took 300 from me" → {"action":"LENT","amount":300,"category":null,"note":null,"person":"Om","period":null,"due_date":null,"spent_on":null}
"I took 300 from Om" → {"action":"BORROWED","amount":300,"category":null,"note":null,"person":"Om","period":null,"due_date":null,"spent_on":null}
"Borrowed 500 from Amit" → {"action":"BORROWED","amount":500,"category":null,"note":null,"person":"Amit","period":null,"due_date":null,"spent_on":null}
"Om lent me 300" → {"action":"BORROWED","amount":300,"category":null,"note":null,"person":"Om","period":null,"due_date":null,"spent_on":null}
"Rahul paid me back 500" → {"action":"SETTLE_DEBT","amount":500,"category":null,"note":null,"person":"Rahul","period":null,"due_date":null,"spent_on":null}
"Settle with Priya" → {"action":"SETTLE_DEBT","amount":null,"category":null,"note":null,"person":"Priya","period":null,"due_date":null,"spent_on":null}
"What does Rahul owe me" → {"action":"QUERY_PERSON_DEBT","amount":null,"category":null,"note":null,"person":"Rahul","period":null,"due_date":null,"spent_on":null}
"Amit ka hisaab" → {"action":"QUERY_PERSON_DEBT","amount":null,"category":null,"note":null,"person":"Amit","period":null,"due_date":null,"spent_on":null}
"How much this week" → {"action":"QUERY_EXPENSES","amount":null,"category":null,"note":null,"person":null,"period":"this_week","due_date":null,"spent_on":null}
"Last 7 days spending" → {"action":"QUERY_EXPENSES","amount":null,"category":null,"note":null,"person":null,"period":"last_7_days","due_date":null,"spent_on":null}
"Food spending this month" → {"action":"QUERY_EXPENSES","amount":null,"category":"Food & Dining","note":null,"person":null,"period":"this_month","due_date":null,"spent_on":null}
"Who owes me" → {"action":"QUERY_DEBTS","amount":null,"category":null,"note":null,"person":null,"period":null,"due_date":null,"spent_on":null}
"Summary" → {"action":"SUMMARY","amount":null,"category":null,"note":null,"person":null,"period":"this_month","due_date":null,"spent_on":null}
"Last month summary" → {"action":"SUMMARY","amount":null,"category":null,"note":null,"person":null,"period":"last_month","due_date":null,"spent_on":null}
"Set budget 3000 for food" → {"action":"SET_BUDGET","amount":3000,"category":"Food & Dining","note":null,"person":null,"period":null,"due_date":null,"spent_on":null}
"Show budgets" → {"action":"QUERY_BUDGET","amount":null,"category":null,"note":null,"person":null,"period":null,"due_date":null,"spent_on":null}
"My salary is 85000" → {"action":"SALARY_UPDATE","amount":85000,"category":null,"note":null,"person":null,"period":null,"due_date":null,"spent_on":null,"salary_day":null}
"I get 92000 on the 7th" → {"action":"SALARY_UPDATE","amount":92000,"category":null,"note":null,"person":null,"period":null,"due_date":null,"spent_on":null,"salary_day":7}
"Export expenses" → {"action":"EXPORT","amount":null,"category":null,"note":"transactions","person":null,"period":"this_month","due_date":null,"spent_on":null}
"Export debts" → {"action":"EXPORT","amount":null,"category":null,"note":"debts","person":null,"period":null,"due_date":null,"spent_on":null}`;

/** Never treat these as a counterparty name (owner / bot / generic). */
const INVALID_PERSON = /^(you|u|me|i|myself|yourself|user|finn|bot|assistant|telegram|here)$/i;

/** User is asking for spending totals, not logging a new expense (LLM sometimes misclassifies). */
function looksLikeSpendingQuestion(text) {
  const s = text.trim();
  if (!s) return false;
  if (/how much (did|have|do) (i|we) spend/i.test(s)) return true;
  if (/how much i('?ve)? spent/i.test(s)) return true;
  if (/what did (i|we) spend/i.test(s)) return true;
  if (/what('?s| is) (my|the) (spending|total)/i.test(s)) return true;
  if (/total (spent|spending) (on|for)/i.test(s)) return true;
  if (/show (me )?(my )?spending (on|for)/i.test(s)) return true;
  if (/^how much (on|for) /i.test(s)) return true;
  if (/\?$/.test(s) && /\b(how much|spend|spent)\b/i.test(s)) return true;
  return false;
}

function sanitizeIntent(intent, rawMessage) {
  let out = intent;

  if (out?.action === "EXPENSE" && rawMessage && looksLikeSpendingQuestion(rawMessage)) {
    out = {
      ...out,
      action: "QUERY_EXPENSES",
      amount: null,
      period: out.period ?? "this_month",
      spent_on: null,
      salary_day: null,
    };
  }

  if (out?.person == null || typeof out.person !== "string") return out;
  const p = out.person.trim();
  if (!p || INVALID_PERSON.test(p)) {
    return { ...out, person: null };
  }
  return out;
}

/**
 * Parse a raw user message into a structured intent object.
 * @param {string} message - Raw Telegram message text
 * @param {{ onFirstRetryNotify?: () => Promise<void> }} [opts] - e.g. Telegram "please wait" after first NLP failure
 * @returns {Promise<object>} Parsed intent
 */
export async function parseIntent(message, opts = {}) {
  try {
    const completion = await withNlpRetries(
      () =>
        groq.chat.completions.create({
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: message },
          ],
          temperature: 0,
          response_format: { type: "json_object" },
        }),
      { label: "NLP", onFirstRetryNotify: opts.onFirstRetryNotify }
    );

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      console.error("[NLP] Empty completion from Groq");
      return { action: "UNKNOWN" };
    }

    const intent = sanitizeIntent(JSON.parse(raw), message);
    return intent;
  } catch (err) {
    console.error("[NLP] Failed to parse intent:", err.message);
    return { action: "UNKNOWN" };
  }
}
