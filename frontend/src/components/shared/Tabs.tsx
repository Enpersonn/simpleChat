import type { ComponentChildren } from 'preact';
import { createContext } from 'preact';
import { useContext, useState } from 'preact/hooks';
import { cn } from '@/utils/classes';

type TabsCtx = { activeTab: string; setActiveTab: (v: string) => void };
const TabsContext = createContext<TabsCtx>({
	activeTab: '',
	setActiveTab: () => {},
});

type TabsProps = {
	children: ComponentChildren;
	class?: string;
	defaultValue?: string;
	onValueChange?: (v: string) => void;
	value?: string;
};

export const Tabs = ({
	children,
	class: cls,
	defaultValue = '',
	onValueChange,
	value,
}: TabsProps) => {
	const [internal, setInternal] = useState(defaultValue);
	const activeTab = value ?? internal;
	const setActiveTab = (v: string) => {
		setInternal(v);
		onValueChange?.(v);
	};

	return (
		<TabsContext.Provider value={{ activeTab, setActiveTab }}>
			<div class={cn('flex flex-col', cls)}>{children}</div>
		</TabsContext.Provider>
	);
};

type BaseProps = {
	children: ComponentChildren;
	class?: string;
};

export const TabsList = ({ children, class: cls }: BaseProps) => (
	<div class={cn('-mt-1.5 flex border-border border-b', cls)}>{children}</div>
);

type TabsTriggerProps = {
	children: ComponentChildren;
	class?: string;
	value: string;
};

export const TabsTrigger = ({
	children,
	class: cls,
	value,
}: TabsTriggerProps) => {
	const { activeTab, setActiveTab } = useContext(TabsContext);
	return (
		<button
			type="button"
			data-active={activeTab === value}
			class={cn(
				'-mb-px border-transparent border-b-2 px-4 py-2 font-medium text-text-muted text-xs transition-all duration-150 hover:text-text-primary data-[active=true]:border-accent data-[active=true]:text-accent',
				cls,
			)}
			onClick={() => setActiveTab(value)}
		>
			{children}
		</button>
	);
};

type TabsContentProps = {
	children: ComponentChildren;
	class?: string;
	value: string;
};

export const TabsContent = ({
	children,
	class: cls,
	value,
}: TabsContentProps) => {
	const { activeTab } = useContext(TabsContext);
	if (value !== activeTab) return null;
	return <div class={cn('flex-1', cls)}>{children}</div>;
};
