import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useEditorStore, usePreferencesStore, useAuthStore } from '@/stores';
import * as attachmentsService from '@/services/attachments.service';
// Import Muya and plugins
import Muya from '@/muya/lib';
import TablePicker from '@/muya/lib/ui/tablePicker';
import QuickInsert from '@/muya/lib/ui/quickInsert';
import CodePicker from '@/muya/lib/ui/codePicker';
import EmojiPicker from '@/muya/lib/ui/emojiPicker';
import ImagePathPicker from '@/muya/lib/ui/imagePicker';
import ImageSelector from '@/muya/lib/ui/imageSelector';
import ImageToolbar from '@/muya/lib/ui/imageToolbar';
import Transformer from '@/muya/lib/ui/transformer';
import FormatPicker from '@/muya/lib/ui/formatPicker';
import LinkTools from '@/muya/lib/ui/linkTools';
import FootnoteTool from '@/muya/lib/ui/footnoteTool';
import TableBarTools from '@/muya/lib/ui/tableTools';
import FrontMenu from '@/muya/lib/ui/frontMenu';
// Import Muya styles
import '@/muya/lib/assets/styles/index.css';
import '@/muya/themes/default.css';
// Import KaTeX CSS for math rendering
import 'katex/dist/katex.min.css';
// Import Prism CSS for code syntax highlighting
import 'prismjs/themes/prism.css';
// Platform utilities
import { openExternal } from '@/utils/platform';
const editorStore = useEditorStore();
const preferencesStore = usePreferencesStore();
const authStore = useAuthStore();
const editorRef = ref();
let muyaInstance = null;
const autoSaveTimer = ref();
const isEditorReady = ref(false);
const isUploadingImage = ref(false);
/**
 * Handle image upload from paste/drop
 * Returns the URL to use in the editor
 */
async function handleImageUpload(file) {
    if (!authStore.user?.id) {
        console.warn('Cannot upload image: user not authenticated');
        return URL.createObjectURL(file); // Fallback to local URL
    }
    isUploadingImage.value = true;
    try {
        const noteId = editorStore.currentDocument?.id;
        const result = await attachmentsService.uploadAttachment(file, authStore.user.id, noteId);
        if (result.error) {
            console.error('Failed to upload image:', result.error);
            return URL.createObjectURL(file); // Fallback to local URL
        }
        const attachment = Array.isArray(result.data) ? result.data[0] : result.data;
        if (attachment) {
            // Get signed URL for the uploaded image
            const urlResult = await attachmentsService.getAttachmentUrl(attachment.storage_path);
            if (urlResult.url) {
                return urlResult.url;
            }
        }
        return URL.createObjectURL(file); // Fallback to local URL
    }
    catch (error) {
        console.error('Error uploading image:', error);
        return URL.createObjectURL(file); // Fallback to local URL
    }
    finally {
        isUploadingImage.value = false;
    }
}
// Register Muya plugins once
let pluginsRegistered = false;
function registerPlugins() {
    if (pluginsRegistered)
        return;
    Muya.use(TablePicker);
    Muya.use(QuickInsert);
    Muya.use(CodePicker);
    Muya.use(EmojiPicker);
    Muya.use(ImagePathPicker);
    Muya.use(ImageSelector, {
        unsplashAccessKey: import.meta.env.VITE_UNSPLASH_ACCESS_KEY || '',
        // Image upload handler for paste/drop
        imageAction: async (file) => {
            return await handleImageUpload(file);
        }
    });
    Muya.use(Transformer);
    Muya.use(ImageToolbar);
    Muya.use(FormatPicker);
    Muya.use(FrontMenu);
    Muya.use(LinkTools, {
        jumpClick: (linkInfo) => {
            openExternal(linkInfo.href);
        }
    });
    Muya.use(FootnoteTool);
    Muya.use(TableBarTools);
    pluginsRegistered = true;
}
// Initialize Muya editor
function initializeMuya() {
    if (!editorRef.value)
        return;
    registerPlugins();
    const options = {
        markdown: editorStore.currentDocument?.content || '',
        focusMode: preferencesStore.focus,
        preferLooseListItem: preferencesStore.preferLooseListItem,
        autoPairBracket: preferencesStore.autoPairBracket,
        autoPairMarkdownSyntax: preferencesStore.autoPairMarkdownSyntax,
        autoPairQuote: preferencesStore.autoPairQuote,
        bulletListMarker: preferencesStore.bulletListMarker,
        orderListDelimiter: preferencesStore.orderListDelimiter,
        tabSize: preferencesStore.tabSize,
        fontSize: preferencesStore.fontSize,
        lineHeight: preferencesStore.lineHeight,
        codeBlockLineNumbers: preferencesStore.codeBlockLineNumbers,
        listIndentation: preferencesStore.listIndentation,
        hideQuickInsertHint: preferencesStore.hideQuickInsertHint,
        hideLinkPopup: preferencesStore.hideLinkPopup,
        spellcheckEnabled: false, // Web doesn't have native spellcheck integration
        trimUnnecessaryCodeBlockEmptyLines: preferencesStore.trimUnnecessaryCodeBlockEmptyLines,
        // Theme for diagrams
        mermaidTheme: preferencesStore.theme.includes('dark') ? 'dark' : 'default',
        vegaTheme: preferencesStore.theme.includes('dark') ? 'dark' : 'latimes',
        sequenceTheme: preferencesStore.sequenceTheme,
        // Enable math and extended markdown features
        superSubScript: true, // Enable superscript/subscript syntax
        footnote: true, // Enable footnote syntax
        isGitlabCompatibilityEnabled: true, // Enable GitLab-flavored markdown
        disableHtml: false // Allow HTML for math rendering
    };
    muyaInstance = new Muya(editorRef.value, options);
    // Restore editor state (cursor and scroll position) after initialization
    const currentDoc = editorStore.currentDocument;
    if (currentDoc?.editor_state) {
        nextTick(() => {
            try {
                // Restore cursor position
                if (currentDoc.editor_state?.cursor && muyaInstance) {
                    muyaInstance.setCursor(currentDoc.editor_state.cursor);
                }
                // Restore scroll position
                if (currentDoc.editor_state?.scroll && muyaInstance) {
                    const container = muyaInstance.container;
                    if (container) {
                        container.scrollTop = currentDoc.editor_state.scroll.top || 0;
                        container.scrollLeft = currentDoc.editor_state.scroll.left || 0;
                    }
                }
            }
            catch (error) {
                console.warn('Failed to restore editor state:', error);
            }
        });
    }
    // Handle content changes
    muyaInstance.on('change', (changes) => {
        const { markdown, wordCount: wc, cursor, toc } = changes;
        // Update store
        editorStore.updateContent(markdown, {
            words: wc?.word || 0,
            characters: wc?.character || 0,
            paragraphs: wc?.paragraph || 0
        });
        if (cursor) {
            editorStore.updateCursor(cursor);
        }
        if (toc) {
            editorStore.updateToc(toc);
        }
        // Auto-save with debounce
        if (autoSaveTimer.value) {
            clearTimeout(autoSaveTimer.value);
        }
        if (preferencesStore.autoSave) {
            autoSaveTimer.value = setTimeout(() => {
                editorStore.saveDocument();
            }, preferencesStore.autoSaveDelay);
        }
    });
    // Handle link clicks
    muyaInstance.on('format-click', ({ event, formatType, data }) => {
        const ctrlOrMeta = (navigator.platform.includes('Mac') && event.metaKey) ||
            (!navigator.platform.includes('Mac') && event.ctrlKey);
        if (formatType === 'link' && ctrlOrMeta && data?.href) {
            openExternal(data.href);
        }
    });
    // Handle selection changes
    muyaInstance.on('selectionChange', (changes) => {
        // Could dispatch to store for toolbar state
    });
    isEditorReady.value = true;
}
// Watch for document changes
watch(() => editorStore.currentDocument, (newDoc, oldDoc) => {
    if (newDoc && muyaInstance && newDoc.id !== oldDoc?.id) {
        // Switch to new document content, restoring cursor position if available
        muyaInstance.setMarkdown(newDoc.content, newDoc.editor_state?.cursor);
    }
});
// Watch for preference changes
watch(() => preferencesStore.focus, (value) => {
    muyaInstance?.setFocusMode(value);
});
watch(() => preferencesStore.fontSize, (value) => {
    muyaInstance?.setFont({ fontSize: value });
});
watch(() => preferencesStore.lineHeight, (value) => {
    muyaInstance?.setFont({ lineHeight: value });
});
watch(() => preferencesStore.tabSize, (value) => {
    muyaInstance?.setTabSize(value);
});
watch(() => preferencesStore.theme, (value) => {
    const isDark = value.includes('dark');
    muyaInstance?.setOptions({
        mermaidTheme: isDark ? 'dark' : 'default',
        vegaTheme: isDark ? 'dark' : 'latimes'
    }, true);
});
// Keyboard shortcuts
function handleKeydown(event) {
    // Save: Cmd/Ctrl + S
    if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        editorStore.saveDocument();
    }
    // Undo: Cmd/Ctrl + Z
    if ((event.metaKey || event.ctrlKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        muyaInstance?.undo();
    }
    // Redo: Cmd/Ctrl + Shift + Z or Cmd/Ctrl + Y
    if ((event.metaKey || event.ctrlKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
        event.preventDefault();
        muyaInstance?.redo();
    }
}
onMounted(() => {
    initializeMuya();
    window.addEventListener('keydown', handleKeydown);
});
onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown);
    if (autoSaveTimer.value) {
        clearTimeout(autoSaveTimer.value);
    }
    if (muyaInstance) {
        try {
            muyaInstance.destroy();
        }
        catch (e) {
            // Ignore cleanup errors
        }
        muyaInstance = null;
    }
});
// Expose Muya instance for parent components (e.g., format toolbar)
const getMuya = () => muyaInstance;
const __VLS_exposed = { getMuya, isEditorReady, isUploadingImage };
defineExpose(__VLS_exposed);
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-math']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-math']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-hide']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-math']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-hide']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-math-render']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-math']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-hide']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-math-render']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-math']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-hide']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-container-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-container-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['katex']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-fence-code']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-task-list-item']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-inline-footnote-identifier']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-link']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-front-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-front-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-front-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-front-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-front-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['item']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-front-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-front-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-front-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-front-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-task-list-item']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-task-list-item']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-task-list-item']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-task-list-item']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-task-list-item']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-task-list-item']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-task-list-item']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-checkbox-checked']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-task-list-item']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-checkbox-checked']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-tool-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-tool-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-tool-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-quick-insert']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-container']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-quick-insert']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-container']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-container']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-tool-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-container']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-front-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-image-picker']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-image-selector']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-front-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-front-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-paragraph']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-front-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-code-picker']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-table-picker']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-table-picker']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-format-picker']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-format-picker']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-link-tools']} */ ;
/** @type {__VLS_StyleScopedClasses['ag-link-tools']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "editor-area" },
    ...{ class: ({
            'typewriter-mode': __VLS_ctx.preferencesStore.typewriter,
            'focus-mode': __VLS_ctx.preferencesStore.focus,
            'source-mode': __VLS_ctx.preferencesStore.sourceCode
        }) },
    ...{ style: ({
            '--editor-font-size': `${__VLS_ctx.preferencesStore.fontSize}px`,
            '--editor-line-height': __VLS_ctx.preferencesStore.lineHeight
        }) },
});
/** @type {__VLS_StyleScopedClasses['editor-area']} */ ;
/** @type {__VLS_StyleScopedClasses['typewriter-mode']} */ ;
/** @type {__VLS_StyleScopedClasses['focus-mode']} */ ;
/** @type {__VLS_StyleScopedClasses['source-mode']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ref: "editorRef",
    ...{ class: "muya-editor" },
    dir: (__VLS_ctx.preferencesStore.textDirection),
});
/** @type {__VLS_StyleScopedClasses['muya-editor']} */ ;
if (!__VLS_ctx.isEditorReady) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "editor-loading" },
    });
    /** @type {__VLS_StyleScopedClasses['editor-loading']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "loading-spinner" },
    });
    /** @type {__VLS_StyleScopedClasses['loading-spinner']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
}
// @ts-ignore
[preferencesStore, preferencesStore, preferencesStore, preferencesStore, preferencesStore, preferencesStore, isEditorReady,];
const __VLS_export = (await import('vue')).defineComponent({
    setup: () => (__VLS_exposed),
});
export default {};
