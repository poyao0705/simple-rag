# Stateless Chat Layout Design

## Goal

Replace the temporary card-style chat screen with the supplied full-height chat layout while preserving the current stateless `useChat()` integration. The sidebar, sidebar trigger, chat history, chat IDs, persistence, navigation, and additional backend endpoints are explicitly out of scope.

## Architecture

`App` will remain the application entry component and render one extracted `Chat` component. `Chat` will own the local prompt text and the `useChat()` hook. This boundary keeps the chat behavior and presentation together while leaving `App` available for future application-level concerns such as navigation, providers, or a sidebar.

No new state-management layer, transport configuration, repository, route, or persistence abstraction will be introduced.

## Chat Layout

The `Chat` component will reproduce the supplied layout:

- A full-viewport-height, vertically stacked chat surface using the light slate background and foreground colors from the reference.
- An AI Elements `Conversation` and `ConversationContent` message region with automatic stick-to-bottom behavior and comfortable top and bottom padding.
- A centered message column with a maximum width of `max-w-190` and consistent spacing between messages.
- The empty state text `Send a message to start this chat.`
- Existing AI Elements `Message`, `MessageContent`, and `MessageResponse` components for text message parts.
- A non-scrolling footer containing a centered `PromptInput` of the same maximum width as the messages.
- `PromptInputBody`, `PromptInputTextarea`, `PromptInputFooter`, and `PromptInputSubmit` arranged like the supplied reference.

The existing card border, fixed 600-pixel height, scroll button, and icon-based empty state will be removed because they are not part of the target interface.

## Conversation Controls

`Chat` will render `ConversationDownload` only when at least one message exists. The behavior and styling will be configured through props at the `Chat` call site so the installed Conversation element retains its reusable defaults.

The Conversation wrapper will act as a hover group. The download button will be transparent, borderless, shadowless, and visually hidden by default. It will fade in when the pointer is anywhere over the conversation and when keyboard focus moves within the conversation. Its accessible label will remain `Download conversation`.

The separate `ConversationScrollButton` will not be rendered. Automatic scrolling comes from `Conversation` itself.

## Data Flow and States

`Chat` will call `useChat()` without custom transport or persistence options, preserving the current `/api/chat` behavior.

On submission, it will trim the prompt. Empty prompts or submissions while the hook is not `ready` will be ignored. A valid prompt will be sent with `sendMessage({ text })`, then the controlled textarea will be cleared.

The textarea and submit button will be disabled whenever the hook is not ready. While the status is `submitted`, the message region will show `Thinking…`. If `useChat()` returns an error, its message will appear in an accessible red error paragraph below the conversation.

## Testing

The existing `App` test will be updated around the extracted component behavior. Focused tests will verify:

1. A ready chat submits trimmed text and clears the textarea.
2. A non-ready chat disables the composer and does not submit.
3. A chat error is rendered for the user.
4. Conversation elements wrap the message region and the download control is omitted for an empty chat.
5. The download control is present for a non-empty chat with the approved transparent, borderless, hover-reveal classes.

Tests will mock the AI SDK hook and presentation components only at external boundaries. The implementation will be completed test-first, with each new assertion observed failing before the corresponding production change.

## Scope Boundaries

This change will not implement a sidebar, sidebar open/close behavior, chat history, stored chat loading, chat identifiers, URL navigation, resume behavior, custom transports, or backend changes.
