import type { Story } from '@simplechat/types';
import { Button } from '../shared/Button.js';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '../shared/Dialog.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../shared/Tabs.js';
import { DmChatTab } from './DmChatTab.js';
import { EditStoryForm } from './edit-story-form.js';

interface Props {
	story: Story;
	onClose?: () => void;
	onSaved?: (story: Story) => void;
}

export function EditStoryModal({
	story,
	onSaved = () => {},
}: Pick<Props, 'story' | 'onSaved'>) {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button size="icon" variant="ghost" title="Edit story">
					✎
				</Button>
			</DialogTrigger>
			<DialogContent class="w-140">
				<DialogHeader>
					<DialogTitle>Edit Story</DialogTitle>
					<DialogClose />
				</DialogHeader>

				<Tabs defaultValue="settings">
					<TabsList class="mb-1 shrink-0 gap-0.5 border-border-light pb-0">
						<TabsTrigger value="settings">Settings</TabsTrigger>
						<TabsTrigger value="dm">DM Chat</TabsTrigger>
					</TabsList>

					<TabsContent value="dm">
						<DmChatTab storyId={story.id} />
					</TabsContent>

					<TabsContent value="settings">
						<EditStoryForm story={story} onSaved={onSaved} />
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}
