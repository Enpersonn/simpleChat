import type { Turn } from '@simplechat/types';
import { marked } from 'marked';
import { useState } from 'preact/hooks';
import type { AgentActivity } from '../../lib/agent-stream.js';
import { useChatsStore } from '../../store/chats.js';
import { useSettingsStore } from '../../store/settings.js';

marked.setOptions({ breaks: true });

interface Props {
	turn: Turn;
	speakerName: string;
	isStreaming: boolean;
	activities?: AgentActivity[];
}

export function ChatMessage({ turn, speakerName, isStreaming, activities }: Props) {
	const deleteTurn = useChatsStore((st) => st.deleteTurn);
	const editTurn = useChatsStore((st) => st.editTurn);
	const editAndResend = useChatsStore((st) => st.editAndResend);
	const regenerate = useChatsStore((st) => st.regenerate);
	const generation = useSettingsStore((st) => st.generation);

	const [editing, setEditing] = useState(false);
	const [editText, setEditText] = useState('');

	const isUser = turn.role === 'user';
	const initial = speakerName[0]?.toUpperCase() ?? '?';

	const htmlContent = turn.text ? (marked.parse(turn.text) as string) : '';

	const handleRegenerate = () => {
		regenerate({
			feelText: generation.feelText,
			model: generation.model || undefined,
			moodTags: generation.moodTags,
			repeat_penalty: generation.repeat_penalty,
			responseLength: generation.responseLength,
			temperature: generation.temperature,
			top_k: generation.top_k,
			top_p: generation.top_p,
		});
	};

	const startEdit = () => {
		setEditText(turn.text);
		setEditing(true);
	};

	const saveEdit = async () => {
		if (editText.trim()) {
			await editTurn(turn.id, editText.trim());
		}
		setEditing(false);
	};

	const saveAndResend = async () => {
		if (!editText.trim()) return;
		setEditing(false);
		await editAndResend(turn.id, editText.trim(), {
			feelText: generation.feelText,
			model: generation.model || undefined,
			moodTags: generation.moodTags,
			repeat_penalty: generation.repeat_penalty,
			responseLength: generation.responseLength,
			temperature: generation.temperature,
			top_k: generation.top_k,
			top_p: generation.top_p,
		});
	};

	const cancelEdit = () => setEditing(false);

	const rootCls = [
		'flex flex-col gap-1 max-w-[820px] relative group/msg',
		isUser ? 'self-end items-end max-w-[680px]' : 'self-start items-start',
	].join(' ');

	const avatarCls = [
		'w-5.5 h-5.5 rounded-full text-sm font-bold flex items-center justify-center shrink-0',
		isUser
			? 'bg-accent-dim text-accent'
			: 'bg-bg-tertiary text-text-secondary',
	].join(' ');

	const bubbleCls = [
		'px-4 py-2.5 rounded-lg leading-[1.8] text-[length:var(--bubble-font-size,16px)] break-words relative',
		isUser
			? 'bg-user-bubble border border-accent-border rounded-br-sm font-ui'
			: 'bg-assistant-bubble border border-border rounded-bl-sm font-reading',
	].join(' ');

	const actionBtnCls =
		'text-[11px] text-text-muted py-0.5 px-1.5 rounded-sm border border-border bg-bg-secondary transition-all duration-150 hover:text-text-primary hover:border-accent';
	const deleteBtnCls = `${actionBtnCls} hover:!text-error hover:!border-error`;

	return (
		<div class={rootCls} data-role={turn.role}>
			<div class="flex items-center gap-1.5 px-1">
				<div class={avatarCls}>{initial}</div>
				<span class="font-semibold text-[11px] text-text-muted tracking-[0.02em]">
					{speakerName}
				</span>
			</div>

			<div class={bubbleCls}>
				{editing ? (
					<div class="flex w-full flex-col gap-1.5">
						<textarea
							class="w-full resize-y rounded-sm border border-accent bg-bg-secondary p-2 font-ui text-[length:var(--bubble-font-size,16px)] text-text-primary leading-[1.6]"
							value={editText}
							onInput={(e) =>
								setEditText(
									(e.target as HTMLTextAreaElement).value,
								)
							}
							rows={Math.max(3, editText.split('\n').length)}
						/>
						<div class="flex gap-1.5">
							{isUser && (
								<button
									type="button"
									class="rounded-sm border border-accent bg-accent px-2.5 py-[3px] font-semibold text-[11px] text-text-on-accent transition-opacity duration-150 hover:opacity-85"
									onClick={saveAndResend}
								>
									Save & Resend
								</button>
							)}
							<button
								type="button"
								class={
									isUser
										? actionBtnCls
										: 'rounded-sm border border-accent bg-accent px-2.5 py-[3px] font-semibold text-[11px] text-text-on-accent transition-opacity duration-150 hover:opacity-85'
								}
								onClick={saveEdit}
							>
								Save
							</button>
							<button
								type="button"
								class={actionBtnCls}
								onClick={cancelEdit}
							>
								Cancel
							</button>
						</div>
					</div>
				) : (
					<div
						class="md-content"
						// biome-ignore lint/security/noDangerouslySetInnerHtml: markdown rendered locally
						dangerouslySetInnerHTML={{ __html: htmlContent }}
					/>
				)}
				{isStreaming && activities && activities.length > 0 && (
					<div class="mt-2 flex flex-wrap gap-1">
						{activities.map((a) => (
							<span
								key={a.id}
								class={
									a.status === 'pending'
										? 'inline-flex items-center gap-1 rounded-sm border border-accent-border bg-accent-dim px-1.5 py-0.5 font-mono text-[10px] text-accent animate-pulse'
										: 'inline-flex items-center gap-1 rounded-sm border border-border bg-bg-tertiary px-1.5 py-0.5 font-mono text-[10px] text-text-muted'
								}
								title={a.status === 'complete' ? 'Tool call complete' : 'Calling tool…'}
							>
								{a.status === 'pending' ? '⚙' : '✓'} {a.toolName}
							</span>
						))}
					</div>
				)}
				{isStreaming && (
					<span class="ml-0.5 inline-block h-[1em] w-0.5 animate-blink bg-accent align-text-bottom" />
				)}
			</div>

			{!isStreaming && !editing && (
				<div class="flex gap-1 px-1 py-0.5 opacity-0 transition-opacity duration-150 group-hover/msg:opacity-100">
					{!isUser && (
						<button
							type="button"
							class={actionBtnCls}
							onClick={handleRegenerate}
							title="Regenerate response"
						>
							↻ Regen
						</button>
					)}
					<button
						type="button"
						class={actionBtnCls}
						onClick={startEdit}
						title="Edit message"
					>
						✎ Edit
					</button>
					<button
						type="button"
						class={deleteBtnCls}
						onClick={() => deleteTurn(turn.id)}
						title="Delete message"
					>
						✕
					</button>
				</div>
			)}
		</div>
	);
}
