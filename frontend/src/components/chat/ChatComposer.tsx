import { useRef, useState } from 'preact/hooks';
import { useChatsStore } from '../../store/chats.js';
import { useSettingsStore } from '../../store/settings.js';

export function ChatComposer() {
	const [text, setText] = useState('');
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const { sendMessage, stopStream, isStreaming, chats, activeChatId } =
		useChatsStore();
	const generation = useSettingsStore((s) => s.generation);
	const ollamaHealthy = useSettingsStore((s) => s.ollamaHealthy);

	const activeChat = chats.find((c) => c.id === activeChatId);
	const isStoryteller = activeChat?.mode === 'storyteller';
	const offline = ollamaHealthy === false;

	const handleSend = async () => {
		const trimmed = text.trim();
		if (!trimmed || isStreaming || offline) return;
		setText('');
		if (textareaRef.current) {
			textareaRef.current.style.height = 'auto';
		}
		await sendMessage({
			text: trimmed,
			moodTags: generation.moodTags,
			responseLength: generation.responseLength,
			feelText: generation.feelText,
			temperature: generation.temperature,
			top_p: generation.top_p,
			top_k: generation.top_k,
			repeat_penalty: generation.repeat_penalty,
			model: generation.model || undefined,
		});
	};

	const handleContinue = () => {
		if (offline) return;
		sendMessage({
			text: 'Continue the story.',
			moodTags: generation.moodTags,
			responseLength: generation.responseLength,
			feelText: generation.feelText,
			temperature: generation.temperature,
			top_p: generation.top_p,
			top_k: generation.top_k,
			repeat_penalty: generation.repeat_penalty,
			model: generation.model || undefined,
		});
	};

	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	const handleInput = (e: Event) => {
		const el = e.target as HTMLTextAreaElement;
		setText(el.value);
		el.style.height = 'auto';
		el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
	};

	return (
		<div class="flex flex-col border-t border-border bg-bg-secondary shrink-0 pt-[10px] px-4 pb-3">
			{offline && (
				<div class="text-xs text-error pb-1.5 px-0.5 flex items-center gap-[5px]">
					⚠ Ollama is unreachable — check that it is running and the
					endpoint is correct in Settings.
				</div>
			)}
			{isStoryteller && !isStreaming && !offline && (
				<button
					type="button"
					class="self-start px-3.5 py-[5px] text-xs border border-border rounded-sm text-text-secondary bg-bg-tertiary transition-all duration-150 mb-1 hover:border-accent hover:text-accent"
					onClick={handleContinue}
				>
					▶ Continue story
				</button>
			)}
			<div class="flex items-end gap-2">
				<textarea
					ref={textareaRef}
					class="flex-1 min-h-10 max-h-40 py-[9px] px-3 text-sm leading-normal rounded border border-border bg-bg-tertiary text-text-primary resize-none overflow-y-auto transition-colors duration-150 placeholder:text-text-muted focus:border-accent focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
					value={text}
					onInput={handleInput}
					onKeyDown={handleKeyDown}
					placeholder={
						offline
							? 'Ollama is not running…'
							: isStoryteller
								? 'Steer the story… (or use Continue above)'
								: 'Type your message… (Enter to send, Shift+Enter for newline)'
					}
					disabled={isStreaming || offline}
					rows={1}
				/>
				{isStreaming ? (
					<button
						type="button"
						class="w-[38px] h-[38px] rounded bg-error-dim border border-error-border text-error text-sm flex items-center justify-center shrink-0 transition-colors duration-150 hover:bg-[rgba(248,113,113,0.22)]"
						onClick={stopStream}
						title="Stop generation"
					>
						■
					</button>
				) : (
					<button
						type="button"
						class="w-[38px] h-[38px] rounded bg-accent text-text-on-accent text-base flex items-center justify-center shrink-0 transition-colors duration-150 hover:bg-accent-hover disabled:bg-bg-hover disabled:text-text-muted disabled:cursor-not-allowed"
						onClick={handleSend}
						disabled={!text.trim() || offline}
						title="Send"
					>
						➤
					</button>
				)}
			</div>
		</div>
	);
}
