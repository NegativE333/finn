// src/services/nlp.js
// Groq (OpenAI-compatible) — natural language → structured intent JSON

import Groq from "groq-sdk";
import { withNlpRetries } from "../utils/nlpRetry.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.1-8b-instant";

const BASE_SCHEMA = `Output ONLY one JSON object, no markdown.
Schema:
{"action":string,"amount":number|null,"category":string|null,"note":string|null,"person":string|null,"period":string|null,"due_date":string|null,"spent_on":string|null,"salary_day":number|null}`;

const CATEGORY_RULES = `Categories (use exact strings):
Food & Dining | Transport | Shopping | Entertainment | Health | Utilities | Rent | Travel | Other

Keyword mapping:
chai/coffee/food/lunch/dinner/breakfast/snacks/groceries/restaurant -> Food & Dining
petrol/fuel/cab/auto/uber/ola/bus/train/metro/rickshaw -> Transport
clothes/shoes/amazon/flipkart -> Shopping
movie/netflix/spotify/game/concert/event -> Entertainment
medicine/doctor/hospital/pharmacy/gym -> Health
electricity/water/internet/phone/recharge/bill -> Utilities
rent/pg/hostel -> Rent
hotel/flight/trip/vacation -> Travel`;

const EXPENSE_PROMPT = `${BASE_SCHEMA}
Actions allowed: EXPENSE | QUERY_EXPENSES | SUMMARY | UNKNOWN.
period values: today | yesterday | this_week | last_week | this_month | last_month | all | last_N_days
spent_on: only for EXPENSE calendar date in ISO YYYY-MM-DD.

Rules:
- EXPENSE means logging a new transaction with amount.
- QUERY_EXPENSES means asking totals/history, amount must be null.
- Never return EXPENSE for question forms like "how much did I spend".
- SUMMARY for summary requests.
${CATEGORY_RULES}

Examples:
"Spent 500 on petrol" -> {"action":"EXPENSE","amount":500,"category":"Transport","note":"petrol","person":null,"period":null,"due_date":null,"spent_on":null,"salary_day":null}
"Yesterday I spent 10 on ice cream" -> {"action":"EXPENSE","amount":10,"category":"Food & Dining","note":"ice cream","person":null,"period":"yesterday","due_date":null,"spent_on":null,"salary_day":null}
"I spent 10 on chai on 10 April" -> {"action":"EXPENSE","amount":10,"category":"Food & Dining","note":"chai","person":null,"period":null,"due_date":null,"spent_on":"2026-04-10","salary_day":null}
"How much did I spend on chai" -> {"action":"QUERY_EXPENSES","amount":null,"category":"Food & Dining","note":"chai","person":null,"period":"this_month","due_date":null,"spent_on":null,"salary_day":null}
"Summary" -> {"action":"SUMMARY","amount":null,"category":null,"note":null,"person":null,"period":"this_month","due_date":null,"spent_on":null,"salary_day":null}`;

const DEBT_PROMPT = `${BASE_SCHEMA}
Actions allowed: LENT | BORROWED | SETTLE_DEBT | QUERY_DEBTS | QUERY_PERSON_DEBT | UNKNOWN.

Rules:
- "person" is always the counterparty, never me/myself/you/bot.
- LENT: I gave money (they owe me).
- BORROWED: I took money (I owe them).
- QUERY_PERSON_DEBT when asking about one person.

Examples:
"Lent 1000 to Rahul for dinner" -> {"action":"LENT","amount":1000,"category":null,"note":"dinner","person":"Rahul","period":null,"due_date":null,"spent_on":null,"salary_day":null}
"I took 300 from Om" -> {"action":"BORROWED","amount":300,"category":null,"note":null,"person":"Om","period":null,"due_date":null,"spent_on":null,"salary_day":null}
"Settle with Priya" -> {"action":"SETTLE_DEBT","amount":null,"category":null,"note":null,"person":"Priya","period":null,"due_date":null,"spent_on":null,"salary_day":null}
"What does Rahul owe me" -> {"action":"QUERY_PERSON_DEBT","amount":null,"category":null,"note":null,"person":"Rahul","period":null,"due_date":null,"spent_on":null,"salary_day":null}
"Who owes me" -> {"action":"QUERY_DEBTS","amount":null,"category":null,"note":null,"person":null,"period":null,"due_date":null,"spent_on":null,"salary_day":null}`;

const SALARY_PROMPT = `${BASE_SCHEMA}
Actions allowed: SALARY_UPDATE | UNKNOWN.
Rules:
- Use SALARY_UPDATE when user shares monthly salary/income/pay.
- amount = monthly salary value.
- salary_day = 1-31 when day is present (e.g. 5th, on 7, every 1st), else null.

Examples:
"my salary is 85000" -> {"action":"SALARY_UPDATE","amount":85000,"category":null,"note":null,"person":null,"period":null,"due_date":null,"spent_on":null,"salary_day":null}
"I get 92000 on the 7th" -> {"action":"SALARY_UPDATE","amount":92000,"category":null,"note":null,"person":null,"period":null,"due_date":null,"spent_on":null,"salary_day":7}`;

const BUDGET_PROMPT = `${BASE_SCHEMA}
Actions allowed: SET_BUDGET | QUERY_BUDGET | UNKNOWN.
${CATEGORY_RULES}
Rules:
- Use QUERY_BUDGET for plain "budget"/"budgets" and other read-only asks.
- Use SET_BUDGET only when user clearly provides a limit amount.
Examples:
"Budget" -> {"action":"QUERY_BUDGET","amount":null,"category":null,"note":null,"person":null,"period":null,"due_date":null,"spent_on":null,"salary_day":null}
"Budgets" -> {"action":"QUERY_BUDGET","amount":null,"category":null,"note":null,"person":null,"period":null,"due_date":null,"spent_on":null,"salary_day":null}
"Set budget 3000 for food" -> {"action":"SET_BUDGET","amount":3000,"category":"Food & Dining","note":null,"person":null,"period":null,"due_date":null,"spent_on":null,"salary_day":null}
"Show budgets" -> {"action":"QUERY_BUDGET","amount":null,"category":null,"note":null,"person":null,"period":null,"due_date":null,"spent_on":null,"salary_day":null}`;

const EXPORT_PROMPT = `${BASE_SCHEMA}
Actions allowed: EXPORT | UNKNOWN.
For export requests set action EXPORT and put note="debts" for debt export, else note="transactions".
Examples:
"Export expenses" -> {"action":"EXPORT","amount":null,"category":null,"note":"transactions","person":null,"period":"this_month","due_date":null,"spent_on":null,"salary_day":null}
"Export debts" -> {"action":"EXPORT","amount":null,"category":null,"note":"debts","person":null,"period":null,"due_date":null,"spent_on":null,"salary_day":null}`;

const GENERAL_PROMPT = `${BASE_SCHEMA}
Actions allowed: EXPENSE | LENT | BORROWED | SETTLE_DEBT | QUERY_EXPENSES | QUERY_DEBTS | QUERY_PERSON_DEBT | SUMMARY | SET_BUDGET | QUERY_BUDGET | EXPORT | SALARY_UPDATE | UNKNOWN.
${CATEGORY_RULES}`;

/** Never treat these as a counterparty name (owner / bot / generic). */
const INVALID_PERSON = /^(you|u|me|i|myself|yourself|user|finn|bot|assistant|telegram|here)$/i;

function detectPromptType(message) {
  const s = String(message || "").toLowerCase();
  if (/(salary|income|credited|get paid|payday|monthly pay)/.test(s)) return "salary";
  if (/(export|csv|download)/.test(s)) return "export";
  if (/(budget|limit)/.test(s)) return "budget";
  if (/(lent|borrow|borrowed|owe|owed|settle|hisaab|paid me back|who owes)/.test(s)) return "debt";
  if (/(spent|spend|expense|summary|how much|total|yesterday|today|month|week|chai|petrol|food|grocery|rent|travel)/.test(s)) return "expense";
  return "general";
}

function promptFor(type) {
  if (type === "salary") return SALARY_PROMPT;
  if (type === "export") return EXPORT_PROMPT;
  if (type === "budget") return BUDGET_PROMPT;
  if (type === "debt") return DEBT_PROMPT;
  if (type === "expense") return EXPENSE_PROMPT;
  return GENERAL_PROMPT;
}

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

function looksLikeBudgetQuery(text) {
  const s = String(text || "").trim().toLowerCase();
  if (!s) return false;
  if (/^(budget|budgets)$/.test(s)) return true;
  if (/\b(show|view|check|list|my|current)\b/.test(s) && /\bbudget(s)?\b/.test(s)) {
    return true;
  }
  if (/\bwhat('?s| is)\b/.test(s) && /\bbudget(s)?\b/.test(s)) return true;
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

  if (out?.action === "SET_BUDGET") {
    const amount = Number(out.amount ?? 0);
    const hasAmount = Number.isFinite(amount) && amount > 0;
    if ((rawMessage && looksLikeBudgetQuery(rawMessage)) || !hasAmount) {
      out = {
        ...out,
        action: "QUERY_BUDGET",
        amount: null,
        category: null,
      };
    }
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
    const promptType = detectPromptType(message);
    const systemPrompt = promptFor(promptType);

    const completion = await withNlpRetries(
      () =>
        groq.chat.completions.create({
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
          ],
          temperature: 0,
          response_format: { type: "json_object" },
        }),
      { label: `NLP-${promptType}`, onFirstRetryNotify: opts.onFirstRetryNotify }
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
