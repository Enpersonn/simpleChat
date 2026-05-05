/** Shared Tailwind class strings for modal forms (replaces forms.module.css) */

export const f = {
	aiBar: 'flex justify-end mt-1',
	aiBtn: 'text-[11px] py-1 px-2.5 border border-border rounded-sm bg-bg-tertiary text-text-muted transition-all duration-150 hover:enabled:border-accent hover:enabled:text-accent disabled:opacity-40 disabled:cursor-not-allowed',
	cancelBtn:
		'px-4 py-2 text-[13px] text-text-secondary border border-border rounded-sm bg-bg-tertiary transition-all duration-150 hover:border-accent hover:text-text-primary',
	charActions: 'hidden gap-0.5 shrink-0 group-hover/charrow:flex',
	charAddBtns: 'flex gap-1.5',
	charIcon: 'text-xs opacity-70 shrink-0',
	charName: 'flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap',
	charRole:
		'text-sm text-text-muted max-w-20 overflow-hidden text-ellipsis whitespace-nowrap shrink-0',
	charRow:
		'flex items-center gap-1.5 py-[5px] px-1.5 rounded-sm text-xs text-text-secondary transition-colors duration-100 group/charrow hover:bg-bg-hover',
	charSectionHeader: 'flex items-center justify-between mb-1.5',
	closeBtn:
		'text-text-muted text-[18px] px-1.5 py-0.5 rounded-sm transition-colors duration-150 hover:text-text-primary hover:bg-bg-hover',
	customTagInput:
		'py-[3px] px-2 text-xs border border-border rounded-full bg-bg-tertiary text-text-primary w-[120px] transition-colors duration-150 focus:border-accent focus:outline-none',
	errorMsg: 'text-xs text-error',
	field: 'flex flex-col gap-[5px]',
	footer: 'flex justify-end gap-2 pt-1',
	genCount: 'text-[11px] opacity-70 tabular-nums shrink-0',
	generateBtn:
		'py-[7px] px-3 text-xs border border-border rounded-sm bg-bg-tertiary text-text-secondary whitespace-nowrap shrink-0 transition-all duration-150 hover:enabled:border-accent hover:enabled:text-accent disabled:opacity-50 disabled:cursor-not-allowed',
	generateRow: 'flex gap-2 items-start',
	generateSection: 'flex flex-col gap-[5px] pb-3.5 border-b border-border',
	genLabel: 'flex-1 font-medium',
	genProgress:
		'flex items-center gap-2 py-2 px-2.5 rounded-sm bg-accent-dim border border-accent text-xs text-accent',
	genSpinner: 'inline-block animate-spin-slow shrink-0',
	header: 'flex items-center justify-between',
	hint: 'text-xs text-text-muted leading-normal',
	iconActionBtn:
		'text-[11px] py-[1px] px-1 rounded-sm text-text-muted leading-none transition-colors duration-100 hover:text-text-primary hover:bg-bg-active',
	infoCell: 'flex flex-col gap-[3px]',
	infoGrid: 'grid grid-cols-3 gap-2',
	input: 'px-[10px] py-2 rounded-sm border border-border bg-bg-tertiary text-text-primary text-[13px] w-full transition-colors duration-150 placeholder:text-text-muted focus:border-accent focus:outline-none',
	label: 'text-[11px] font-semibold tracking-[0.06em] uppercase text-text-muted',
	labelHint:
		'text-text-muted font-normal normal-case tracking-normal text-[11px]',
	modal: 'bg-bg-secondary border border-border-light rounded-lg p-6 w-[520px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-64px)] overflow-y-auto shadow-lg flex flex-col gap-4.5',
	modalLg:
		'bg-bg-secondary border border-border-light rounded-lg p-6 w-[520px] max-w-[600px] max-h-[calc(100vh-64px)] overflow-y-auto shadow-lg flex flex-col gap-4.5',
	modalSm:
		'bg-bg-secondary border border-border-light rounded-lg p-6 w-[440px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-64px)] overflow-y-auto shadow-lg flex flex-col gap-4.5',
	modalWide:
		'bg-bg-secondary border border-border-light rounded-lg shadow-lg w-[920px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-64px)] flex flex-col overflow-hidden pt-5 px-6 pb-0 gap-3',
	overlay:
		'fixed inset-0 bg-black/65 flex items-center justify-center z-100 backdrop-blur-sm',
	previewCard:
		'flex items-start gap-2 py-2 px-2.5 bg-bg-secondary border border-border rounded-sm mt-1.5 animate-preview-fade',
	previewFadeIn: 'animate-preview-fade',
	previewPanel: 'flex flex-col',
	previewSkeleton: 'bg-bg-hover rounded-sm animate-preview-pulse',
	required: 'text-error',
	subLabel:
		'text-sm font-semibold tracking-[0.04em] uppercase text-text-muted',
	submitBtn:
		'px-5 py-2 text-[13px] font-medium text-text-on-accent bg-accent rounded-sm transition-colors duration-150 hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed',
	tabBtn: 'px-4 py-2 text-xs font-medium text-text-muted border-b-2 border-transparent -mb-px transition-all duration-150 hover:text-text-primary data-[active=true]:text-accent data-[active=true]:border-accent',
	tabs: 'flex border-b border-border -mt-1.5',
	tag: 'py-1 px-2.5 text-xs border border-border rounded-full text-text-muted bg-bg-tertiary transition-all duration-150 cursor-pointer hover:border-accent hover:text-text-primary data-[active=true]:border-accent data-[active=true]:bg-accent-dim data-[active=true]:text-accent',
	tagAddBtn:
		'text-base leading-none px-1.5 py-[1px] text-text-muted rounded-sm hover:text-accent',
	tagAddRow: 'flex items-center gap-1 mt-1',
	tagGroup: 'flex flex-wrap gap-1.5',
	tagRemove: 'text-sm ml-[3px] opacity-70 leading-none hover:opacity-100',
	textarea:
		'px-[10px] py-2 rounded-sm border border-border bg-bg-tertiary text-text-primary text-[13px] w-full resize-y min-h-20 leading-normal transition-colors duration-150 placeholder:text-text-muted focus:border-accent focus:outline-none',
	title: 'font-display text-[15px] font-semibold text-text-primary tracking-wider',
	toggleRow: 'flex gap-2',
};
