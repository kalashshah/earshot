// Everything Earshot "thinks" — all on NVIDIA Nemotron via Nebius Token Factory.
import { unlabelSpeakers, who } from './transcript'
import { chat, parseJson, MODELS, tavilyExtract, tavilySearch, type LlmEnv, type Tavily } from './llm'
import { cleanMoment, cleanPlace, cleanRoutine, normPlace, type MomentInput, type PlaceInput, type RoutineInput } from './remind'

export type Entities = { people: { name: string; org?: string | null }[]; orgs: string[] }
export type Commitment = { owner: string; counterpart?: string | null; what: string; due?: string | null; due_date?: string | null; place?: string | null }
export type Extraction = { title: string; summary: string; screen: string | null; speakers?: Record<string, string | null>; facts: string[]; commitments: Commitment[]; moments: MomentInput[] } & Entities
type RawMoment = Parameters<typeof cleanMoment>[0]

/** "2026-10-18 14:05" → "2026-10-18 14:05 (Sunday)": the model resolves "next Friday" against this. */
export const withWeekday = (stamp: string) =>
  `${stamp} (${new Date(`${stamp.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })})`

const MOMENT_JSON = `{"kind": "birthday|anniversary|event|trip|deadline|appointment|other", "title": "short, from the user's side: 'Your anniversary with Sara', 'Raj's birthday', 'Flight to Goa', 'Call Mom'", "person": "name or null", "date": "YYYY-MM-DD", "time": "HH:MM (24h) or null", "yearly": true for birthdays and anniversaries, "prep": "what the user should do beforehand, imperative, or null: 'get Sara a gift', 'pack', 'book a table'", "lead_days": [days ahead to remind]}`
const MOMENT_RULES = `Resolve dates against the recording time ("next Friday", "the 2nd"). For a yearly date with no year, use the next upcoming one. Yearly titles never include an age or count ("Rohan's birthday", not "Rohan's 30th birthday"). lead_days: [7, 1, 0] for a partner's or close family member's anniversary or birthday (time to get a gift), [1, 0] for other people's birthdays, [7, 1] for trips, [1] for appointments and deadlines, [0] with a time for same-day things.`

// Diarization numbers speakers in order of first words, so "Speaker 0" is often NOT the wearer: the model
// works out who is wearing the watch from the user's name being said and from context.
export const MUSIC_SCREEN = 15

const speakerNote = (env: LlmEnv) =>
  `Transcripts come from a watch worn by the user${env.USER_NAME ? `, ${env.USER_NAME}` : ''}. Speaker labels are arbitrary: work out which speaker is the user from context${env.USER_NAME ? ` (others call them "${env.USER_NAME}")` : ''}; if unclear, Speaker 0. Always call the user "you", never by name. Other people: their name if anyone says it, else their relation to the user when that's how they're addressed ("papa" → "your dad", "mummy" → "your mom"), else "someone". Never write a "Speaker N" label as a name.`

// Super, thinking off: one clip → title, summary, people, durable facts, commitments.
// Measured on the staged day: Lightning swapped who-owes-whom in ~half the group conversations, Super
// in ~1 of 10, for ~$0.001 vs ~$0.0002 per clip. Attribution is the product, so Super it is.
export async function extractClip(env: LlmEnv, userId: string, transcript: string, when: string, before?: string, music?: number | null, ambient?: string | null): Promise<Extraction> {
  // Measured on real clips: under 6% during a call, 17–32% with a film on. Transcripts alone don't give a film away.
  const filmy = music != null && music >= MUSIC_SCREEN
  const text = await chat(env, {
    model: MODELS.super,
    json: true,
    maxTokens: 1500,
    purpose: 'extract',
    userId,
    messages: [
      {
        role: 'system',
        content: `${speakerNote(env)}
Reply with JSON only:
{"screen": "first decide: is some of this audio from a TV, film, video or song playing nearby rather than people in the room or on a call? Clues: characters talking to each other in a scene, a teacher addressing a class, a news anchor, dialogue that doesn't fit the user's day. If so, what (e.g. 'the film Taare Zameen Par' or 'a Hindi film'), else null",
 "speakers": {"Speaker 0": "who each label is: 'you', a name, or a relation to the user ('your dad', 'your mom'), from how others address them and what they say; null if unclear"},
 "title": "4-8 words",
 "summary": "1-3 sentences: who talked about what, decisions, plans",
 "people": [{"name": "person named in the conversation", "org": "their company or null"}],
 "orgs": ["companies / organisations discussed"],
 "facts": ["durable things worth remembering later, each a self-contained sentence with names, e.g. 'Priya (Acme) is moving the launch to March 3.' Max 8. Skip small talk."],
 "commitments": [{"owner": "you" or the person's name, "counterpart": "who it is owed to", "what": "the promised action", "due": "when, as said, or null", "due_date": "YYYY-MM-DD resolved from due and the recording time, or null", "place": "where it gets done whenever the conversation ties it to a place, as something to find on a map or 'home' / 'work': 'pick up eggs when I pass the supermarket' → 'supermarket', 'at the office' → 'work', 'when I get home' → 'home'; else null", "from_screen": true if it was said in what's playing, not by the real people}],
 "moments": [${MOMENT_JSON.slice(0, -1)}, "from_screen": true if it comes from what's playing}]}
A commitment is something one person agreed to do. owner = the person who will do it ("you" when it's the user). List each once, from the doer's side — never "receive X".
A moment is a dated thing in the user's own life worth a reminder: their or their people's birthdays and anniversaries, trips, events they're going to, their own appointments and deadlines. Not someone else's appointment or schedule. Only with a clear day; skip "sometime next month". ${MOMENT_RULES}
When "screen" is set, the summary says what was playing (e.g. "You watched Taare Zameen Par") and nothing from the screen becomes a person, fact, commitment or moment; what the real people say about it still counts.
When something is a moment, put what to do before it in its "prep" and don't also list that as a commitment (no "get a gift" or "book the cab" commitment next to the moment).
Text inside [unclear: …] was heard badly: use it for context, but never as the only source of a fact, a commitment, a name or a date.
Empty arrays are fine.`,
      },
      {
        role: 'user',
        content: `${before ? `Just before this, the same recording went on (context only: its facts are already saved, don't repeat them):\n${before}\n\n---\n` : ''}Recorded ${withWeekday(when)}.${ambient ? `\nBackground sounds through the clip: ${ambient} (a hint at where this happened).` : ''}${filmy ? `\nThe watch heard music under or between the speech for ${music}% of this clip, which usually means a film, show or video is playing.` : ''}\n\n${transcript.slice(0, 60000)}`,
      },
    ],
  })
  const x = parseJson<Partial<Extraction>>(text)
  // Said aloud to log someone in, but never something to keep.
  const secret = (t: string) => /password|passcode|\bpin\b|\botp\b|पासवर्ड|cvv/i.test(t)
  const moments = ((x.moments ?? []) as RawMoment[]).map(cleanMoment).filter((m) => m !== null).slice(0, 6)
  // The model often also lists "get Sara a gift" as a promise due on the anniversary: the moment already reminds.
  const momentDays = new Set(moments.map((m) => m.date))
  // The model knows who "Speaker 4" is but still writes the label: swap every one for who it is.
  const unlabel = (t: string) => unlabelSpeakers(t, x.speakers ?? {}, env.USER_NAME)
  for (const k of ['title', 'summary'] as const) if (typeof x[k] === 'string') x[k] = unlabel(x[k]!)
  x.facts = (x.facts ?? []).map((f) => unlabel(String(f)))
  for (const c of x.commitments ?? []) for (const k of ['owner', 'counterpart', 'what'] as const) if (c?.[k]) c[k] = unlabel(String(c[k]))
  const screen = x.screen ? String(x.screen).slice(0, 120) : null
  // The model names the film but still lifts its characters and plot as people and facts. With the audio agreeing,
  // drop those, and keep only the promises and dates it says the real people made ("drop me at the airport at 8").
  if (screen && filmy) {
    x.people = []; x.orgs = []; x.facts = []
    x.commitments = (x.commitments ?? []).filter((c) => (c as { from_screen?: boolean }).from_screen === false)
    x.moments = ((x.moments ?? []) as { from_screen?: boolean }[]).filter((m) => m.from_screen === false) as typeof x.moments
  }
  return {
    title: String(x.title ?? 'Conversation').slice(0, 120),
    summary: String(x.summary ?? '').slice(0, 1000),
    screen,
    people: (x.people ?? []).filter((p) => p?.name).slice(0, 20),
    orgs: (x.orgs ?? []).map(String).filter(Boolean).slice(0, 20),
    facts: (x.facts ?? []).map(String).filter((f) => f && !secret(f)).slice(0, 8),
    commitments: (x.commitments ?? [])
      .filter((c) => c?.what && c?.owner && !secret(c.what) && !(who(c.owner, env.USER_NAME) === 'you' && c.due_date && momentDays.has(c.due_date)))
      .map((c) => ({
        ...c,
        owner: who(c.owner, env.USER_NAME),
        counterpart: c.counterpart ? who(c.counterpart, env.USER_NAME) : null,
        due_date: /^\d{4}-\d{2}-\d{2}$/.test(String(c.due_date)) ? c.due_date : null,
        place: c.place ? normPlace(String(c.place)) : null,
      }))
      .slice(0, 10),
    moments,
  }
}


// Super: the follow-up you'd send for a commitment you made.
export async function draftFollowUp(env: LlmEnv, userId: string, c: Commitment, summary: string): Promise<string> {
  return (
    await chat(env, {
      model: MODELS.super,
      maxTokens: 400,
      purpose: 'draft',
      userId,
      messages: [
        {
          role: 'system',
          content:
            'Write the short message the user would send to keep a promise they made in conversation. Plain text, 2-5 sentences, warm and direct, no subject line, no placeholders like [Name] — use the names given. If something must be attached, say so in one line.',
        },
        { role: 'user', content: `Conversation: ${summary}\nPromise: you will ${c.what}${c.due ? ` (by ${c.due})` : ''}, for ${c.counterpart ?? 'them'}.` },
      ],
    })
  ).trim()
}

type Mem = { id: string; content: string }
const CLIP_RE = /clip ([0-9a-f-]{36})/i

export type Clip = { id: string; when: string; title: string; transcript: string }

// Memory is the index, transcripts are the evidence: search finds the conversations, Super reads them.
// Measured: answering from the extracted facts alone lost who-said-what and which version came later.
export const clipIdsFrom = (memories: Mem[]) => [...new Set(memories.map((m) => m.content.match(CLIP_RE)?.[1]).filter(Boolean) as string[])]

// Lightning reads a one-line index of every recent conversation and picks the ones that could answer.
// ~60 tokens a conversation: months of talk fit in its 1M context, and it catches what vector search misses.
export async function routeQuestion(env: LlmEnv, userId: string, question: string, index: string[]): Promise<string[]> {
  if (!index.length) return []
  const out = parseJson<{ ids?: string[] }>(
    await chat(env, {
      model: MODELS.lightning,
      json: true,
      maxTokens: 300,
      purpose: 'route',
      userId,
      messages: [
        { role: 'system', content: 'Pick the conversations most likely to contain the answer to the question (max 5, most relevant first; include earlier and later ones if the question is about change over time). Reply JSON: {"ids": ["..."]}' },
        { role: 'user', content: `Conversations:\n${index.join('\n')}\n\nQuestion: ${question}` },
      ],
    }),
  )
  return (out.ids ?? []).map(String)
}

export async function answer(env: LlmEnv, userId: string, question: string, memories: Mem[], clips: Clip[], now: string) {
  const text = await chat(env, {
    model: MODELS.super,
    json: true,
    maxTokens: 600,
    purpose: 'ask',
    userId,
    messages: [
      {
        role: 'system',
        content: `${speakerNote(env)}
You are Earshot, the user's memory of their real conversations. Answer only from the conversations and notes below. If they don't say it, reply that you didn't hear that — never guess a name, number or date. Conversations are in time order: when something changed during the day, the latest version is true now; mention the change briefly. Be precise about who said or promised what, and complete: include every item asked for and the key details (who, when, where, how much). Questions about what someone said, quoted or promised are answered from conversations only, never from web notes. One or two sentences, it is read on a watch.
If instead the user is telling you something to remember or asking to be reminded, don't search: fill exactly one of these and confirm in one short sentence what you'll remind them of and when or where.
- "moment" for a date, once or yearly ("remind me to call Mom at 5", "our anniversary is November 2nd"). ${MOMENT_RULES}
- "routine" for something on a repeating schedule ("every night at 10 remind me to take my meds", "every Friday at 5 tell me what I still owe people"). If they want to be told something that depends on their life ("tell me what I still owe people", "sum up my week"), "question" is required, phrased as a question ("What do I still owe people?"); for a plain nudge like meds it is null.
- "place" for something at a place ("when I'm at a grocery store remind me to buy milk", "when I leave work remind me to call Mom"). "place" is what to look for on a map, or "home" / "work".
Reply JSON: {"answer": "...", "used": ["ids of the conversations you relied on"], "moment": null or ${MOMENT_JSON}, "routine": null or {"title": "short: 'Take your meds', 'Weekly promise check'", "days": ["mon".."sun"; [] for every day], "time": "HH:MM", "question": "or null"}, "place": null or {"title": "the reminder: 'Buy milk'", "place": "grocery store", "leave": true only for leaving}}`,
      },
      {
        role: 'user',
        content: `${clips.map((c) => `### id ${c.id} · ${c.when} · ${c.title}\n${c.transcript}`).join('\n\n')}\n\nNotes ("[news …]" lines are from the web via Tavily — nobody said them to you; use them only for questions about the outside world):\n${memories.filter((m) => !CLIP_RE.test(m.content) || !clips.some((c) => m.content.includes(c.id))).map((m) => `- ${m.content}`).join('\n') || '(none)'}\n\nNow: ${withWeekday(now)}\nQuestion: ${question}`,
      },
    ],
  })
  const out = parseJson<{ answer?: string; used?: string[]; moment?: RawMoment; routine?: Parameters<typeof cleanRoutine>[0]; place?: Parameters<typeof cleanPlace>[0] }>(text)
  const known = new Set(clips.map((c) => c.id))
  return {
    answer: String(out.answer ?? '').trim() || "I didn't catch that.",
    clips: (out.used ?? []).map(String).filter((id) => known.has(id)),
    moment: cleanMoment(out.moment),
    routine: cleanRoutine(out.routine) as RoutineInput | null,
    place: cleanPlace(out.place) as PlaceInput | null,
  }
}

// Super: a pre-meeting card from memory + open commitments + fresh Tavily news.
export async function prepCard(env: LlmEnv, userId: string, meeting: string, memories: Mem[], actions: string[], news: Tavily[]) {
  const text = await chat(env, {
    model: MODELS.super,
    json: true,
    maxTokens: 700,
    purpose: 'prep',
    userId,
    messages: [
      {
        role: 'system',
        content:
          'Brief the user before a meeting, using what they heard in past conversations and today\'s news. Reply JSON: {"card": "one line under 140 characters for a watch notification", "bullets": ["3-5 short bullets: last time you talked, promises either way, news (cite as [n])"]}',
      },
      {
        role: 'user',
        content: `Meeting: ${meeting}\n\nMemories:\n${memories.map((m) => `- ${m.content}`).join('\n') || '(none)'}\n\nOpen commitments:\n${actions.join('\n') || '(none)'}\n\nNews:\n${news.map((n, i) => `[${i + 1}] ${n.title} — ${n.content} (${n.url})`).join('\n') || '(none)'}`,
      },
    ],
  })
  const out = parseJson<{ card?: string; bullets?: string[] }>(text)
  return { card: String(out.card ?? meeting).slice(0, 200), bullets: (out.bullets ?? []).map(String).slice(0, 6), sources: news.map((n, i) => ({ n: i + 1, title: n.title, url: n.url })) }
}

// Ultra: the morning brief over the whole previous day (1M context fits a day of talk).
export async function morningBrief(env: LlmEnv, userId: string, day: string, clips: { when: string; title: string; transcript: string }[], actions: string[], news: (Tavily & { org: string })[], upcoming: string[]) {
  const transcripts = clips.map((c) => `### ${c.when} — ${c.title}\n${c.transcript}`).join('\n\n').slice(0, 1_500_000)
  return (
    await chat(env, {
      model: MODELS.ultra,
      thinking: true,
      maxTokens: 6000,
      purpose: 'brief',
      userId,
      messages: [
        {
          role: 'system',
          content: `${speakerNote(env)}
Write the user's morning brief for the day after ${day} (${day} was a ${new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}). Due dates were said relative to the day of each conversation: "by Friday" said on a Friday means the next Friday. Only call something overdue if its date has clearly passed. Markdown, under 350 words:
## Yesterday — the 3-5 things that mattered, not a list of every conversation
## Promises — what you owe and what you're owed, with due dates
## People & news — what changed for the people and companies you talked about; cite news as [n]
## Today — 1-3 concrete suggested actions, including prep for anything coming up this week (a gift to buy, a bag to pack)
Be specific (names, numbers, dates). Never invent anything not in the transcripts or news.`,
        },
        {
          role: 'user',
          content: `Transcripts (${clips.length} conversations):\n\n${transcripts}\n\nOpen commitments:\n${actions.join('\n') || '(none)'}\n\nComing up:\n${upcoming.join('\n') || '(none)'}\n\nNews:\n${news.map((n, i) => `[${i + 1}] (${n.org}) ${n.title} — ${n.content}`).join('\n') || '(none)'}`,
        },
      ],
    })
  ).trim()
}

export type Finding = Tavily & { org: string }

// Nemotron decides what's worth looking up (nothing is a valid answer), Tavily searches, Extract reads
// the best page, Nemotron keeps only what's relevant. Each step is capped: every call is a credit.
export async function research(env: LlmEnv & { TAVILY_API_KEY: string }, userId: string, day: string, summaries: string[], orgs: string[]): Promise<Finding[]> {
  const plan = parseJson<{ searches?: { query: string; about: string; why: string }[] }>(
    await chat(env, {
      model: MODELS.lightning,
      json: true,
      maxTokens: 500,
      purpose: 'plan-search',
      userId,
      messages: [
        {
          role: 'system',
          content:
            'You decide what fresh outside information would help the user act on yesterday\'s conversations: news about a company they are pitching, a product launch they discussed, a public event coming up, or the public work of a well-known person someone recommended (search their name with their blog or best-known book, e.g. \"Jane Doe blog growth\"). Never search private people. Max 3 searches; an empty list is right when nothing public matters. Reply JSON: {"searches": [{"query": "web search query", "about": "company or topic", "why": "how it helps the user"}]}',
        },
        { role: 'user', content: `Day: ${day}\nCompanies and people mentioned: ${[...new Set(orgs)].join(', ') || '(none)'}\n\nConversations:\n${summaries.join('\n')}` },
      ],
    }),
  )
  const findings: Finding[] = []
  for (const s of (plan.searches ?? []).slice(0, 3)) {
    const hits = await tavilySearch(env.TAVILY_API_KEY, s.query).catch(() => [] as Tavily[])
    const top = hits.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]
    if (!top) continue
    const page = (await tavilyExtract(env.TAVILY_API_KEY, [top.url], s.query).catch(() => new Map<string, string>())).get(top.url) ?? top.content
    const note = (
      await chat(env, {
        model: MODELS.lightning,
        maxTokens: 200,
        purpose: 'condense',
        userId,
        messages: [
          { role: 'system', content: 'From the page, write 1-2 factual sentences about the stated subject that matter for the stated reason, with dates and numbers. Only state what the page says about that subject; if the page is not about it, or nothing on it is relevant, reply exactly NONE.' },
          { role: 'user', content: `Subject: ${s.about}\nReason: ${s.why}\n\nPage (${top.url}):\n${page}` },
        ],
      })
    ).trim()
    if (note && note !== 'NONE') findings.push({ ...top, content: note, org: s.about })
  }
  return findings
}

// Super, ~2 weeks ahead: what was actually said about someone → a gift or prep idea for the early reminder.
export async function prepIdeas(env: LlmEnv, userId: string, m: { title: string; prep: string }, day: string, memories: Mem[]): Promise<string | null> {
  if (!memories.length) return null
  const text = (
    await chat(env, {
      model: MODELS.super,
      maxTokens: 200,
      purpose: 'ideas',
      userId,
      messages: [
        {
          role: 'system',
          content: `The user has "${m.title}" on ${day} and should ${m.prep}. From notes of their past conversations, suggest one or two specific ideas in one short sentence under 110 characters, pointing to what was said (e.g. "She mentioned wanting to try the pottery class on 4th Street."). Use only what the notes say. If nothing specific fits, reply exactly NONE.`,
        },
        { role: 'user', content: memories.map((x) => `- ${x.content}`).join('\n') },
      ],
    })
  ).trim()
  return text && text !== 'NONE' ? text.slice(0, 220) : null
}

// Super, before each run of a routine with a question: answered from open promises, what's coming up and the last week of talk.
export async function routineAnswer(env: LlmEnv, userId: string, question: string, now: string, actions: string[], upcoming: string[], week: string[]) {
  return (
    await chat(env, {
      model: MODELS.super,
      maxTokens: 300,
      purpose: 'routine',
      userId,
      messages: [
        {
          role: 'system',
          content: `${speakerNote(env)}
Answer the user's recurring question for a phone notification: under 200 characters, specific (names, what, when), no preamble. Use only what's below; if there's nothing, say so plainly. Each conversation is dated: only call something "today" if it happened on Now's date.`,
        },
        {
          role: 'user',
          content: `Now: ${withWeekday(now.replace('T', ' '))}\n\nOpen promises:\n${actions.join('\n') || '(none)'}\n\nComing up:\n${upcoming.join('\n') || '(none)'}\n\nThe last 7 days of conversations:\n${week.join('\n') || '(none)'}\n\nQuestion: ${question}`,
        },
      ],
    })
  ).trim().slice(0, 300)
}
