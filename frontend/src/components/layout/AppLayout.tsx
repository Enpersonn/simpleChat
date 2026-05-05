import { useEffect, useRef, useState } from 'preact/hooks';
import { useChatsStore } from '../../store/chats.js';
import { useSettingsStore } from '../../store/settings.js';
import { ChatWindow } from '../chat/ChatWindow.js';
import { LeftPanel } from './LeftPanel.js';
import { RightPanel } from './RightPanel.js';

const LEFT_MIN = 160;
const LEFT_MAX = 420;
const RIGHT_MIN = 200;
const RIGHT_MAX = 460;

function readInt(key: string, fallback: number): number {
	const v = localStorage.getItem(key);
	return v ? Number.parseInt(v, 10) : fallback;
}

export function AppLayout() {
	const activeChatId = useChatsStore((s) => s.activeChatId);
	const checkHealth = useSettingsStore((s) => s.checkHealth);
	const loadSettings = useSettingsStore((s) => s.loadSettings);
	const loadModels = useSettingsStore((s) => s.loadModels);
	const fontSize = useSettingsStore((s) => s.appSettings.fontSize);
	const theme = useSettingsStore((s) => s.appSettings.theme);

	const [leftWidth, setLeftWidth] = useState(() =>
		readInt('layout.leftW', 220),
	);
	const [rightWidth, setRightWidth] = useState(() =>
		readInt('layout.rightW', 280),
	);
	const [leftCollapsed, setLeftCollapsed] = useState(false);
	const [rightCollapsed, setRightCollapsed] = useState(false);

	const dragging = useRef<'left' | 'right' | null>(null);
	const dragStart = useRef<{ x: number; width: number }>({ width: 0, x: 0 });

	useEffect(() => {
		loadSettings().then(() => {
			checkHealth().then(() => loadModels());
		});
		const interval = setInterval(checkHealth, 30_000);
		return () => clearInterval(interval);
	}, []);

	useEffect(() => {
		document.documentElement.style.setProperty(
			'--bubble-font-size',
			`${fontSize}px`,
		);
	}, [fontSize]);

	useEffect(() => {
		document.documentElement.setAttribute('data-theme', theme);
	}, [theme]);

	useEffect(() => {
		localStorage.setItem('layout.leftW', String(leftWidth));
	}, [leftWidth]);

	useEffect(() => {
		localStorage.setItem('layout.rightW', String(rightWidth));
	}, [rightWidth]);

	const startLeftDrag = (e: MouseEvent) => {
		dragging.current = 'left';
		dragStart.current = { width: leftWidth, x: e.clientX };
		e.preventDefault();
	};

	const startRightDrag = (e: MouseEvent) => {
		dragging.current = 'right';
		dragStart.current = { width: rightWidth, x: e.clientX };
		e.preventDefault();
	};

	useEffect(() => {
		const onMove = (e: MouseEvent) => {
			if (!dragging.current) return;
			const delta = e.clientX - dragStart.current.x;
			if (dragging.current === 'left') {
				setLeftWidth(
					Math.min(
						LEFT_MAX,
						Math.max(LEFT_MIN, dragStart.current.width + delta),
					),
				);
			} else {
				setRightWidth(
					Math.min(
						RIGHT_MAX,
						Math.max(RIGHT_MIN, dragStart.current.width - delta),
					),
				);
			}
		};
		const onUp = () => {
			dragging.current = null;
		};
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
		return () => {
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
		};
	}, []);

	return (
		<div class="flex h-screen select-none overflow-hidden bg-bg-primary">
			<div
				class="flex min-w-0 shrink-0 flex-col overflow-hidden bg-bg-secondary transition-[width] duration-200"
				style={{ width: leftCollapsed ? 0 : leftWidth }}
				data-collapsed={leftCollapsed ? 'true' : undefined}
			>
				<LeftPanel />
			</div>

			<div class="relative z-10 flex w-3 shrink-0 flex-col items-center">
				{!leftCollapsed && (
					<div
						class="absolute top-0 bottom-0 left-[1px] w-1 cursor-col-resize bg-transparent transition-colors duration-150 hover:bg-gold-border"
						onMouseDown={startLeftDrag}
						title="Drag to resize"
					/>
				)}
				<button
					type="button"
					class="absolute top-1/2 flex h-8 w-[14px] -translate-y-1/2 cursor-pointer items-center justify-center rounded border border-border bg-bg-tertiary p-0 text-sm text-text-muted leading-none transition-colors duration-150 hover:border-gold-border hover:bg-bg-hover hover:text-gold"
					data-side="left"
					onClick={() => setLeftCollapsed((v) => !v)}
					title={
						leftCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
					}
				>
					{leftCollapsed ? '›' : '‹'}
				</button>
			</div>

			<div class="flex min-w-0 flex-1 select-text flex-col overflow-hidden">
				{activeChatId ? (
					<ChatWindow />
				) : (
					<div class="flex flex-1 select-none flex-col items-center justify-center gap-[10px] text-text-muted">
						<div class="mb-1 text-[12px] text-gold-border tracking-[8px]">
							✦ ✦ ✦
						</div>
						<h2 class="font-display font-normal text-[22px] text-text-secondary tracking-[0.08em]">
							SimpleChat
						</h2>
						<p class="max-w-[260px] text-center text-[13px] text-text-muted leading-[1.7]">
							Select a story and open a chat to begin your
							session.
						</p>
					</div>
				)}
			</div>

			{/* Right drag + collapse handle */}
			<div class="relative z-10 flex w-3 shrink-0 flex-col items-center">
				{!rightCollapsed && (
					<div
						class="absolute top-0 right-[1px] bottom-0 w-1 cursor-col-resize bg-transparent transition-colors duration-150 hover:bg-gold-border"
						onMouseDown={startRightDrag}
						title="Drag to resize"
					/>
				)}
				<button
					type="button"
					class="absolute top-1/2 flex h-8 w-[14px] -translate-y-1/2 cursor-pointer items-center justify-center rounded border border-border bg-bg-tertiary p-0 text-sm text-text-muted leading-none transition-colors duration-150 hover:border-gold-border hover:bg-bg-hover hover:text-gold"
					data-side="right"
					onClick={() => setRightCollapsed((v) => !v)}
					title={rightCollapsed ? 'Expand panel' : 'Collapse panel'}
				>
					{rightCollapsed ? '‹' : '›'}
				</button>
			</div>

			{/* Right sidebar */}
			<div
				class="flex min-w-0 shrink-0 flex-col overflow-y-auto overflow-x-hidden bg-bg-secondary transition-[width] duration-200"
				style={{ width: rightCollapsed ? 0 : rightWidth }}
				data-collapsed={rightCollapsed ? 'true' : undefined}
			>
				<RightPanel />
			</div>
		</div>
	);
}
