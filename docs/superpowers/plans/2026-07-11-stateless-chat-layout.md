# Stateless Chat Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the supplied full-height stateless chat interface as an extracted `Chat` component rendered by `App`, without sidebar or persistence features.

**Architecture:** `frontend/src/components/chat.tsx` owns `useChat()`, prompt state, status handling, message rendering, and the full-height layout. `frontend/src/App.tsx` remains a deliberately small application shell that renders `Chat`, leaving room for future application-level composition.

**Tech Stack:** React 19, TypeScript, AI SDK React, AI Elements, Tailwind CSS 4, Vitest, React Testing Library

## Global Constraints

- Preserve the current stateless `useChat()` flow and existing `/api/chat` backend integration.
- Do not add a sidebar, sidebar controls, chat history, chat IDs, persistence, navigation, custom transport, resume behavior, or backend changes.
- Use existing AI Elements components and existing dependencies only.

---

### Task 1: Extract and implement the stateless Chat component

**Files:**
- Create: `frontend/src/components/chat.tsx`
- Create: `frontend/src/components/chat.test.tsx`
- Delete: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `useChat(): { messages, sendMessage, status, error }` and existing AI Elements message/prompt components.
- Produces: `Chat(): JSX.Element`, a self-contained stateless chat surface.

- [ ] **Step 1: Write the failing behavior tests**

Move the current hook/component mocks into `frontend/src/components/chat.test.tsx`. Make the mocked hook state mutable, mock `PromptInputBody` and `PromptInputFooter`, and add three focused tests:

```tsx
it("submits trimmed text and clears the textarea when ready", () => {
  render(<Chat />)
  const input = screen.getByRole("textbox", { name: "Message" })
  fireEvent.change(input, { target: { value: "  Hello  " } })
  fireEvent.click(screen.getByRole("button", { name: "Send" }))
  expect(sendMessage).toHaveBeenCalledWith({ text: "Hello" })
  expect((input as HTMLTextAreaElement).value).toBe("")
})

it("disables the composer while the chat is not ready", () => {
  chatState.status = "streaming"
  render(<Chat />)
  expect((screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement).disabled).toBe(true)
  expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true)
})

it("renders the chat error", () => {
  chatState.error = new Error("Could not send message.")
  render(<Chat />)
  expect(screen.getByRole("alert").textContent).toBe("Could not send message.")
})
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `pnpm --dir frontend test -- src/components/chat.test.tsx`

Expected: FAIL because `./chat` does not exist.

- [ ] **Step 3: Implement the minimal Chat component**

Create `frontend/src/components/chat.tsx` with:

```tsx
import { useChat } from "@ai-sdk/react"
import { useState } from "react"
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input"

export function Chat() {
  const [input, setInput] = useState("")
  const { messages, sendMessage, status, error } = useChat()
  const isReady = status === "ready"

  function handleSubmit(message: PromptInputMessage) {
    const text = message.text.trim()
    if (!text || !isReady) return
    void sendMessage({ text })
    setInput("")
  }

  return (
    <main className="flex h-svh min-h-0 flex-col bg-slate-50 text-slate-900">
      <section aria-live="polite" className="min-h-0 flex-1 overflow-y-auto px-4 pt-14 pb-6" data-testid="chat-messages">
        <div className="mx-auto flex w-full max-w-190 flex-col gap-4">
          {messages.length === 0 ? (
            <p className="text-slate-500">Send a message to start this chat.</p>
          ) : (
            messages.map((message) => (
              <Message data-role={message.role} from={message.role} key={message.id}>
                <MessageContent>
                  {message.parts.map((part, index) =>
                    part.type === "text" ? (
                      <MessageResponse key={`${message.id}-${index}`}>{part.text}</MessageResponse>
                    ) : null,
                  )}
                </MessageContent>
              </Message>
            ))
          )}
          {status === "submitted" ? <p className="text-slate-500">Thinking…</p> : null}
          {error ? <p className="text-red-700" role="alert">{error.message}</p> : null}
        </div>
      </section>
      <div className="shrink-0 px-4 pb-4">
        <PromptInput className="mx-auto w-full max-w-190" onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea aria-label="Message" disabled={!isReady} onChange={(event) => setInput(event.currentTarget.value)} placeholder="Type a message..." value={input} />
          </PromptInputBody>
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit aria-label="Send" disabled={!isReady || input.trim().length === 0} status={status} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Run the component tests and verify GREEN**

Run: `pnpm --dir frontend test -- src/components/chat.test.tsx`

Expected: 3 tests pass.

- [ ] **Step 5: Commit the component**

```bash
git add frontend/src/components/chat.tsx frontend/src/components/chat.test.tsx frontend/src/App.test.tsx
git commit -m "feat: add stateless chat surface"
```

### Task 2: Compose Chat from App and verify the frontend

**Files:**
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `Chat(): JSX.Element` from `@/components/chat`.
- Produces: default `App` component as the application composition boundary.

- [ ] **Step 1: Replace App with the composition shell**

```tsx
import { Chat } from "@/components/chat"

function App() {
  return <Chat />
}

export default App
```

- [ ] **Step 2: Run all verification commands**

Run: `pnpm --dir frontend test && pnpm --dir frontend build && pnpm --dir frontend lint`

Expected: all tests pass, build exits 0, and lint exits 0 with only existing generated-component Fast Refresh warnings.

- [ ] **Step 3: Commit the application composition**

```bash
git add frontend/src/App.tsx
git commit -m "refactor: compose app from chat surface"
```

### Task 3: Add Conversation auto-scroll and hover-reveal download

**Files:**
- Modify: `frontend/src/components/chat.tsx`
- Modify: `frontend/src/components/chat.test.tsx`

**Interfaces:**
- Consumes: `Conversation`, `ConversationContent`, and `ConversationDownload` from `@/components/ai-elements/conversation`.
- Produces: an auto-scrolling message region and a conditional, transparent download action.

- [ ] **Step 1: Write failing Conversation composition tests**

Mock the Conversation exports with stable test IDs, reset `chatState.messages` after each test, and add:

```tsx
it("uses Conversation and omits download for an empty chat", () => {
  render(<Chat />)
  expect(screen.getByTestId("conversation")).toBeTruthy()
  expect(screen.getByTestId("conversation-content")).toBeTruthy()
  expect(screen.queryByRole("button", { name: "Download conversation" })).toBeNull()
})

it("shows a transparent borderless download for a non-empty chat", () => {
  chatState.messages = [{ id: "message-1", role: "user", parts: [{ type: "text", text: "Hello" }] }]
  render(<Chat />)
  const download = screen.getByRole("button", { name: "Download conversation" })
  expect(download.className).toContain("opacity-0")
  expect(download.className).toContain("group-hover:opacity-100")
  expect(download.className).toContain("border-0")
  expect(download.className).toContain("bg-transparent")
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --dir frontend test -- src/components/chat.test.tsx`

Expected: FAIL because the current Chat does not render the Conversation mocks.

- [ ] **Step 3: Replace the plain message section with Conversation**

Import the three Conversation exports and replace the message `<section>` with this structure while retaining the existing message mapping, thinking state, and error state inside the centered column:

```tsx
<Conversation
  aria-live="polite"
  className="group min-h-0"
  data-testid="chat-messages"
>
  <ConversationContent className="px-4 pt-14 pb-6">
    <div className="mx-auto flex w-full max-w-190 flex-col gap-4">
      {/* existing empty, message, thinking, and error rendering */}
    </div>
  </ConversationContent>
  {messages.length > 0 ? (
    <ConversationDownload
      aria-label="Download conversation"
      className="border-0 bg-transparent opacity-0 shadow-none transition-opacity hover:bg-transparent group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 dark:bg-transparent dark:hover:bg-transparent"
      messages={messages}
    />
  ) : null}
</Conversation>
```

- [ ] **Step 4: Run component tests and verify GREEN**

Run: `pnpm --dir frontend test -- src/components/chat.test.tsx`

Expected: 5 tests pass.

- [ ] **Step 5: Run full verification and browser QA**

Run: `pnpm --dir frontend test && pnpm --dir frontend build && pnpm --dir frontend lint`

Expected: tests and build pass; lint exits 0 with only existing generated-component Fast Refresh warnings. In the browser, verify the download button is visually hidden at rest, visible over the message area, transparent and borderless, and that the composer still enables after input.
