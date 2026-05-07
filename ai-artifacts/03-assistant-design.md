# Assistant design notes

## Goals

1. Answer questions about invoice state (status, totals, vendors).
2. Take real actions (retry failed invoices), not just describe them.
3. Be debuggable — the user should be able to see exactly what the assistant did.
4. Refuse to invent data.

## Pattern: standard tool-use loop

```
loop up to 6 times:
  resp = client.messages.create(messages=convo, tools=TOOLS, ...)
  append resp.content to convo as assistant message
  if any block in resp.content is tool_use:
    execute tool, append tool_result block to convo as user message
    continue
  else:
    break with the final text
```

The cap of 6 is there to bound runaway loops where the model keeps calling tools
without ever producing text. In practice 1-3 is normal; 6 is generous.

## Why a sync SDK call inside an async endpoint

The Anthropic Python SDK has an async client, but I deliberately picked the sync
one and pushed it to a thread (`asyncio.to_thread`). Reasons:

- One code path for tool execution (also sync — they hit the DB).
- The thread isolates the LLM round-trip from the event loop, including any
  surprising blocking inside the SDK.
- Latency is dominated by the model, not the executor.

A streaming endpoint would change this calculus — I'd switch to the async client
and yield events as they come.

## Why I show the tool trace in the UI

Two reasons:

1. **Trust.** The user can see "the assistant said your total is $X because it
   called `summarize_totals` and got that exact number." No black box.
2. **Debuggability.** When the assistant gives a wrong answer, the trace tells me
   whether the bug is in the tool, the prompt, or the model's reasoning. Without
   it, I'd be guessing.

The tradeoff is visual noise. Keeping it inside a `<details>` disclosure means
casual users don't see it but power users / reviewers can expand it.

## Why short-id prefix lookup

The model loves writing "invoice abc12345" rather than the full UUID. Rather than
fight it with prompt engineering, I added prefix resolution to `_resolve_id` —
unique-prefix lookups return the row, ambiguous prefixes return null. Cheap,
matches how a human would speak.

## Things I considered and rejected

- **Tool-call streaming.** Nice-to-have but adds a lot of frontend code for
  marginal UX gain. Punted.
- **Memory/context.** Each chat request includes the full history; no separate
  store. Fine for short conversations; would need summarization for long ones.
- **A "delete invoice" tool.** Deletion is a destructive action and I didn't want
  the model triggering it unprompted. The UI has the delete button.
