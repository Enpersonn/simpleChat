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
	return v ? parseInt(v, 10) : fallback;
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
	const dragStart = useRef<{ x: number; width: number }>({ x: 0, width: 0 });

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
		dragStart.current = { x: e.clientX, width: leftWidth };
		e.preventDefault();
	};

	const startRightDrag = (e: MouseEvent) => {
		dragging.current = 'right';
		dragStart.current = { x: e.clientX, width: rightWidth };
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
		<div class="flex h-screen overflow-hidden bg-bg-primary select-none">
			{/* Left sidebar */}
			<div
				class="shrink-0 flex flex-col bg-bg-secondary overflow-hidden transition-[width] duration-200 min-w-0"
				style={{ width: leftCollapsed ? 0 : leftWidth }}
				data-collapsed={leftCollapsed ? 'true' : undefined}
			>
				<LeftPanel />
			</div>

			{/* Left drag + collapse handle */}
			<div class="relative w-3 shrink-0 flex flex-col items-center z-10">
				{!leftCollapsed && (
					<div
						class="absolute top-0 bottom-0 w-1 left-[1px] cursor-col-resize bg-transparent transition-colors duration-150 hover:bg-gold-border"
						onMouseDown={startLeftDrag}
						title="Drag to resize"
					/>
				)}
				<button
					type="button"
					class="absolute top-1/2 -translate-y-1/2 w-[14px] h-8 text-[10px] text-text-muted bg-bg-tertiary border border-border rounded flex items-center justify-center cursor-pointer transition-colors duration-150 p-0 leading-none hover:text-gold hover:border-gold-border hover:bg-bg-hover"
					data-side="left"
					onClick={() => setLeftCollapsed((v) => !v)}
					title={
						leftCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
					}
				>
					{leftCollapsed ? '›' : '‹'}
				</button>
			</div>

			{/* Main content */}
			<div class="flex-1 flex flex-col overflow-hidden min-w-0 select-text">
				{activeChatId ? (
					<ChatWindow />
				) : (
					<div class="flex-1 flex flex-col items-center justify-center gap-[10px] text-text-muted select-none">
						<div class="text-[12px] tracking-[8px] text-gold-border mb-1">
							✦ ✦ ✦
						</div>
						<h2 class="font-display text-[22px] font-normal text-text-secondary tracking-[0.08em]">
							SimpleChat
						</h2>
						<p class="text-[13px] text-center max-w-[260px] leading-[1.7] text-text-muted">
							Select a story and open a chat to begin your
							session.
						</p>
					</div>
				)}
			</div>

			{/* Right drag + collapse handle */}
			<div class="relative w-3 shrink-0 flex flex-col items-center z-10">
				{!rightCollapsed && (
					<div
						class="absolute top-0 bottom-0 w-1 right-[1px] cursor-col-resize bg-transparent transition-colors duration-150 hover:bg-gold-border"
						onMouseDown={startRightDrag}
						title="Drag to resize"
					/>
				)}
				<button
					type="button"
					class="absolute top-1/2 -translate-y-1/2 w-[14px] h-8 text-[10px] text-text-muted bg-bg-tertiary border border-border rounded flex items-center justify-center cursor-pointer transition-colors duration-150 p-0 leading-none hover:text-gold hover:border-gold-border hover:bg-bg-hover"
					data-side="right"
					onClick={() => setRightCollapsed((v) => !v)}
					title={rightCollapsed ? 'Expand panel' : 'Collapse panel'}
				>
					{rightCollapsed ? '‹' : '›'}
				</button>
			</div>

			{/* Right sidebar */}
			<div
				class="shrink-0 flex flex-col bg-bg-secondary overflow-y-auto overflow-x-hidden transition-[width] duration-200 min-w-0"
				style={{ width: rightCollapsed ? 0 : rightWidth }}
				data-collapsed={rightCollapsed ? 'true' : undefined}
			>
				<RightPanel />
			</div>
		</div>
	);
}
