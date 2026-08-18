import {
    intervalFromTemplate,
    SegmentSaveResultSchema,
    skipTimesDraft,
    type EpisodeSkipTimes,
    type SegmentTemplates,
    type SkipInterval,
    type SkipKind,
} from './skip-times';

interface Episode {
    animeId: number;
    episodeId: string;
    episodeNumber: number;
}

type SegmentSave =
    | { operation: 'clear' }
    | { operation: 'apply-template'; start: number }
    | { operation: 'set'; interval: SkipInterval; createTemplate: boolean };

export class SegmentEditor {
    times = $state<EpisodeSkipTimes>({
        opening: null,
        ending: null,
        source: null,
    });
    templates = $state<SegmentTemplates>({
        opening: null,
        ending: null,
    });
    draft = $state<ReturnType<typeof skipTimesDraft>>({
        opening: { start: null, end: null },
        ending: { start: null, end: null },
    });
    creatingTemplate = $state<SkipKind | null>(null);
    saving = $state(false);
    error = $state<string | null>(null);
    canEdit = $state(false);
    episodeNumber = $state(0);

    private receivedTimes: EpisodeSkipTimes;
    private receivedTemplates: SegmentTemplates;

    constructor(
        private episode: Episode,
        times: EpisodeSkipTimes,
        templates: SegmentTemplates,
        canEdit: boolean
    ) {
        this.times = times;
        this.templates = templates;
        this.draft = skipTimesDraft(times);
        this.receivedTimes = times;
        this.receivedTemplates = templates;
        this.canEdit = canEdit;
        this.episodeNumber = episode.episodeNumber;
    }

    sync(episode: Episode, times: EpisodeSkipTimes, templates: SegmentTemplates, canEdit: boolean) {
        if (episode.episodeId !== this.episode.episodeId || times !== this.receivedTimes) {
            this.episode = episode;
            this.receivedTimes = times;
            this.times = times;
            this.draft = skipTimesDraft(times);
            this.creatingTemplate = null;
            this.error = null;
        } else {
            this.episode = episode;
        }

        if (templates !== this.receivedTemplates) {
            this.receivedTemplates = templates;
            this.templates = templates;
        }

        this.canEdit = canEdit;
        this.episodeNumber = episode.episodeNumber;
    }

    mark(kind: SkipKind, edge: 'start' | 'end', currentTime: number) {
        const value = Math.round(currentTime * 1_000) / 1_000;
        const template = this.templates[kind];
        if (edge === 'start' && template && this.creatingTemplate !== kind) {
            const interval = intervalFromTemplate(value, template.duration);
            if (!interval) {
                this.error = 'The template could not be applied.';
                return;
            }

            this.draft = { ...this.draft, [kind]: interval };
            void this.persist(kind, { operation: 'apply-template', start: value });
            return;
        }

        const marked = { ...this.draft[kind], [edge]: value };
        this.draft = { ...this.draft, [kind]: marked };
        this.error = null;

        if (marked.start === null || marked.end === null) {
            return;
        }
        if (marked.end <= marked.start) {
            this.error = 'The end must be after the start.';
            return;
        }

        void this.persist(kind, {
            operation: 'set',
            interval: { start: marked.start, end: marked.end },
            createTemplate: this.creatingTemplate === kind || !template,
        });
    }

    clear(kind: SkipKind) {
        this.creatingTemplate = null;
        void this.persist(kind, { operation: 'clear' });
    }

    startTemplate(kind: SkipKind) {
        this.creatingTemplate = kind;
        this.draft = { ...this.draft, [kind]: { start: null, end: null } };
        this.error = null;
    }

    cancelTemplate(kind: SkipKind) {
        this.creatingTemplate = null;
        this.draft = {
            ...this.draft,
            [kind]: {
                start: this.times[kind]?.start ?? null,
                end: this.times[kind]?.end ?? null,
            },
        };
        this.error = null;
    }

    private async persist(kind: SkipKind, save: SegmentSave) {
        const episode = { ...this.episode };
        this.saving = true;
        this.error = null;

        try {
            const response = await fetch('/api/episodes/skip-times', {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    anilistId: episode.animeId,
                    episodeId: episode.episodeId,
                    kind,
                    ...save,
                }),
                credentials: 'same-origin',
            });
            if (!response.ok) {
                throw new Error(
                    response.status === 401
                        ? 'Sign in to edit segments.'
                        : 'Segments could not be saved.'
                );
            }

            const saved = SegmentSaveResultSchema.safeParse(await response.json());
            if (!saved.success) {
                throw new Error('Arc returned invalid segment data.');
            }
            if (
                episode.animeId !== this.episode.animeId ||
                episode.episodeId !== this.episode.episodeId
            ) {
                return;
            }

            this.times = saved.data.times;
            this.templates = saved.data.templates;
            this.draft = skipTimesDraft(saved.data.times);
            this.creatingTemplate = null;
        } catch (cause) {
            this.error =
                cause instanceof Error && cause.message === 'Sign in to edit segments.'
                    ? cause.message
                    : 'Segments could not be saved. Please try again.';
        } finally {
            this.saving = false;
        }
    }
}
