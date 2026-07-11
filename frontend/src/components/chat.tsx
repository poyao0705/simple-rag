import { useChat } from "@ai-sdk/react";
import { useState } from "react";
import {
	Message,
	MessageContent,
	MessageResponse,
} from "@/components/ai-elements/message";
import {
	PromptInput,
	PromptInputBody,
	PromptInputFooter,
	type PromptInputMessage,
	PromptInputSubmit,
	PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";

export function Chat() {
	const [input, setInput] = useState("");
	const { messages, sendMessage, status, error } = useChat();
	const isReady = status === "ready";

	function handleSubmit(message: PromptInputMessage) {
		const text = message.text.trim();
		if (!text || !isReady) {
			return;
		}

		void sendMessage({ text });
		setInput("");
	}

	return (
		<main className="flex h-svh min-h-0 flex-col bg-slate-50 text-slate-900">
			<section
				aria-live="polite"
				className="min-h-0 flex-1 overflow-y-auto px-4 pt-14 pb-6"
				data-testid="chat-messages"
			>
				<div className="mx-auto flex w-full max-w-190 flex-col gap-4">
					{messages.length === 0 ? (
						<p className="text-slate-500">
							Send a message to start this chat.
						</p>
					) : (
						messages.map((message) => (
							<Message
								data-role={message.role}
								from={message.role}
								key={message.id}
							>
								<MessageContent>
									{message.parts.map((part, index) =>
										part.type === "text" ? (
											<MessageResponse key={`${message.id}-${index}`}>
												{part.text}
											</MessageResponse>
										) : null,
									)}
								</MessageContent>
							</Message>
						))
					)}
					{status === "submitted" ? (
						<p className="text-slate-500">Thinking…</p>
					) : null}
					{error ? (
						<p className="text-red-700" role="alert">
							{error.message}
						</p>
					) : null}
				</div>
			</section>

			<div className="shrink-0 px-4 pb-4">
				<PromptInput
					className="mx-auto w-full max-w-190"
					onSubmit={handleSubmit}
				>
					<PromptInputBody>
						<PromptInputTextarea
							aria-label="Message"
							disabled={!isReady}
							onChange={(event) => setInput(event.currentTarget.value)}
							placeholder="Type a message..."
							value={input}
						/>
					</PromptInputBody>
					<PromptInputFooter className="justify-end">
						<PromptInputSubmit
							aria-label="Send"
							disabled={!isReady || input.trim().length === 0}
							status={status}
						/>
					</PromptInputFooter>
				</PromptInput>
			</div>
		</main>
	);
}
