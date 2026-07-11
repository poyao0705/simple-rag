import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type {
	ButtonHTMLAttributes,
	FormEvent,
	HTMLAttributes,
	ReactNode,
	TextareaHTMLAttributes,
} from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Chat } from "./chat";

type ChatTestMessage = {
	id: string;
	role: "user" | "assistant";
	parts: Array<{ type: "text"; text: string }>;
};

const { chatState, sendMessage } = vi.hoisted(() => ({
	chatState: {
		error: undefined as Error | undefined,
		messages: [] as ChatTestMessage[],
		status: "ready",
	},
	sendMessage: vi.fn(),
}));

vi.mock("@ai-sdk/react", () => ({
	useChat: () => ({ ...chatState, sendMessage }),
}));

vi.mock("@/components/ai-elements/conversation", () => ({
	Conversation: ({
		children,
		...props
	}: HTMLAttributes<HTMLDivElement>) => (
		<div {...props} data-testid="conversation">
			{children}
		</div>
	),
	ConversationContent: ({
		children,
		...props
	}: HTMLAttributes<HTMLDivElement>) => (
		<div {...props} data-testid="conversation-content">
			{children}
		</div>
	),
	ConversationDownload: ({
		messages: _messages,
		...props
	}: ButtonHTMLAttributes<HTMLButtonElement> & {
		messages: ChatTestMessage[];
	}) => <button type="button" {...props} />,
}));

vi.mock("@/components/ai-elements/message", () => ({
	Message: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	MessageContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	MessageResponse: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
}));

vi.mock("@/components/ai-elements/prompt-input", () => ({
	PromptInput: ({
		children,
		onSubmit,
	}: {
		children: ReactNode;
		onSubmit: (message: { text: string; files: never[] }) => void;
	}) => {
		const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			const textarea = event.currentTarget.querySelector("textarea");
			onSubmit({ text: textarea?.value ?? "", files: [] });
		};

		return <form onSubmit={handleSubmit}>{children}</form>;
	},
	PromptInputBody: ({ children }: HTMLAttributes<HTMLDivElement>) => (
		<div>{children}</div>
	),
	PromptInputFooter: ({ children }: HTMLAttributes<HTMLDivElement>) => (
		<div>{children}</div>
	),
	PromptInputTextarea: (
		props: TextareaHTMLAttributes<HTMLTextAreaElement>,
	) => <textarea {...props} />,
	PromptInputSubmit: ({
		status: _status,
		...props
	}: ButtonHTMLAttributes<HTMLButtonElement> & { status: string }) => (
		<button type="submit" {...props}>
			Send
		</button>
	),
}));

describe("Chat", () => {
	afterEach(() => {
		cleanup();
		sendMessage.mockReset();
		chatState.error = undefined;
		chatState.messages = [];
		chatState.status = "ready";
	});

	it("submits trimmed text and clears the textarea when ready", () => {
		render(<Chat />);

		const input = screen.getByRole("textbox", { name: "Message" });
		fireEvent.change(input, { target: { value: "  Hello  " } });
		fireEvent.click(screen.getByRole("button", { name: "Send" }));

		expect(sendMessage).toHaveBeenCalledOnce();
		expect(sendMessage).toHaveBeenCalledWith({ text: "Hello" });
		expect((input as HTMLTextAreaElement).value).toBe("");
	});

	it("disables the composer while the chat is not ready", () => {
		chatState.status = "streaming";

		render(<Chat />);

		expect(
			(screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement)
				.disabled,
		).toBe(true);
		expect(
			(screen.getByRole("button", { name: "Send" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});

	it("renders the chat error", () => {
		chatState.error = new Error("Could not send message.");

		render(<Chat />);

		expect(screen.getByRole("alert").textContent).toBe(
			"Could not send message.",
		);
	});

	it("uses Conversation and omits download for an empty chat", () => {
		render(<Chat />);

		expect(screen.getByTestId("conversation")).toBeTruthy();
		expect(screen.getByTestId("conversation-content")).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: "Download conversation" }),
		).toBeNull();
	});

	it("shows a transparent borderless download for a non-empty chat", () => {
		chatState.messages = [
			{
				id: "message-1",
				role: "user",
				parts: [{ type: "text", text: "Hello" }],
			},
		];

		render(<Chat />);

		const download = screen.getByRole("button", {
			name: "Download conversation",
		});
		expect(download.className).toContain("opacity-0");
		expect(download.className).toContain("group-hover:opacity-100");
		expect(download.className).toContain("border-0");
		expect(download.className).toContain("bg-transparent");
	});
});
