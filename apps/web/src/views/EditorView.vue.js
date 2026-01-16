import { onMounted, ref, computed, nextTick, watch } from 'vue';
import { useEditorStore } from '@/stores';
import { FileText, Plus, X, Clock } from 'lucide-vue-next';
import SideBar from '@/components/layout/SideBar.vue';
import EditorArea from '@/components/editor/EditorArea.vue';
import NoteOutline from '@/components/layout/NoteOutline.vue';
const editorStore = useEditorStore();
const isReady = ref(false);
const tabsContainerRef = ref(null);
const isSaved = computed(() => editorStore.activeTab?.isSaved ?? true);
const wordCount = computed(() => {
    const wc = editorStore.wordCount;
    return `${wc.words} words`;
});
const lastUpdated = computed(() => {
    const doc = editorStore.currentDocument;
    if (!doc?.updated_at)
        return '';
    const date = new Date(doc.updated_at);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000)
        return 'Just now';
    if (diff < 3600000)
        return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000)
        return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
});
function createNewDocument() {
    editorStore.createDocument('Untitled');
    nextTick(() => {
        if (tabsContainerRef.value) {
            tabsContainerRef.value.scrollLeft = tabsContainerRef.value.scrollWidth;
        }
    });
}
watch(() => editorStore.activeTabId, () => {
    nextTick(() => {
        const activeEl = tabsContainerRef.value?.querySelector('.tab.active');
        if (activeEl) {
            activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    });
});
onMounted(async () => {
    await editorStore.loadDocuments();
    if (editorStore.documents.length === 0) {
        await editorStore.createDocument('Welcome to Inkdown');
    }
    else if (editorStore.documents[0]) {
        editorStore.openDocument(editorStore.documents[0]);
    }
    isReady.value = true;
});
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['tabs-container']} */ ;
/** @type {__VLS_StyleScopedClasses['tab']} */ ;
/** @type {__VLS_StyleScopedClasses['tab']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-close']} */ ;
/** @type {__VLS_StyleScopedClasses['new-tab-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['status-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['note-content']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "editor-view" },
});
/** @type {__VLS_StyleScopedClasses['editor-view']} */ ;
if (__VLS_ctx.isReady) {
    const __VLS_0 = SideBar;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({}));
    const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
}
__VLS_asFunctionalElement1(__VLS_intrinsics.main, __VLS_intrinsics.main)({
    ...{ class: "main-content" },
});
/** @type {__VLS_StyleScopedClasses['main-content']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "tabs-bar" },
});
/** @type {__VLS_StyleScopedClasses['tabs-bar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "tabs-container" },
    ref: "tabsContainerRef",
});
/** @type {__VLS_StyleScopedClasses['tabs-container']} */ ;
for (const [tab] of __VLS_vFor((__VLS_ctx.editorStore.tabs))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.editorStore.switchTab(tab.id);
                // @ts-ignore
                [isReady, editorStore, editorStore,];
            } },
        key: (tab.id),
        ...{ class: "tab" },
        ...{ class: ({ active: tab.id === __VLS_ctx.editorStore.activeTabId }) },
    });
    /** @type {__VLS_StyleScopedClasses['tab']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    let __VLS_5;
    /** @ts-ignore @type {typeof __VLS_components.FileText} */
    FileText;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
        size: (14),
        ...{ class: "tab-icon" },
    }));
    const __VLS_7 = __VLS_6({
        size: (14),
        ...{ class: "tab-icon" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    /** @type {__VLS_StyleScopedClasses['tab-icon']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "tab-title" },
    });
    /** @type {__VLS_StyleScopedClasses['tab-title']} */ ;
    (tab.document.title);
    if (!tab.isSaved) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "tab-unsaved" },
        });
        /** @type {__VLS_StyleScopedClasses['tab-unsaved']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.editorStore.closeTab(tab.id);
                // @ts-ignore
                [editorStore, editorStore,];
            } },
        ...{ class: "tab-close" },
    });
    /** @type {__VLS_StyleScopedClasses['tab-close']} */ ;
    let __VLS_10;
    /** @ts-ignore @type {typeof __VLS_components.X} */
    X;
    // @ts-ignore
    const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
        size: (12),
    }));
    const __VLS_12 = __VLS_11({
        size: (12),
    }, ...__VLS_functionalComponentArgsRest(__VLS_11));
    // @ts-ignore
    [];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.createNewDocument) },
    ...{ class: "new-tab-btn" },
    title: "New Document",
});
/** @type {__VLS_StyleScopedClasses['new-tab-btn']} */ ;
let __VLS_15;
/** @ts-ignore @type {typeof __VLS_components.Plus} */
Plus;
// @ts-ignore
const __VLS_16 = __VLS_asFunctionalComponent1(__VLS_15, new __VLS_15({
    size: (16),
}));
const __VLS_17 = __VLS_16({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_16));
if (__VLS_ctx.isReady && __VLS_ctx.editorStore.currentDocument) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tabs-meta" },
    });
    /** @type {__VLS_StyleScopedClasses['tabs-meta']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "meta-item" },
    });
    /** @type {__VLS_StyleScopedClasses['meta-item']} */ ;
    let __VLS_20;
    /** @ts-ignore @type {typeof __VLS_components.Clock} */
    Clock;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent1(__VLS_20, new __VLS_20({
        size: (12),
    }));
    const __VLS_22 = __VLS_21({
        size: (12),
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    (__VLS_ctx.lastUpdated);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "status-badge" },
        ...{ class: ({ saved: __VLS_ctx.isSaved }) },
    });
    /** @type {__VLS_StyleScopedClasses['status-badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['saved']} */ ;
    (__VLS_ctx.isSaved ? 'Saved' : 'Draft');
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "word-count" },
    });
    /** @type {__VLS_StyleScopedClasses['word-count']} */ ;
    (__VLS_ctx.wordCount);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "note-container" },
});
/** @type {__VLS_StyleScopedClasses['note-container']} */ ;
if (__VLS_ctx.isReady && __VLS_ctx.editorStore.currentDocument) {
    const __VLS_25 = NoteOutline;
    // @ts-ignore
    const __VLS_26 = __VLS_asFunctionalComponent1(__VLS_25, new __VLS_25({}));
    const __VLS_27 = __VLS_26({}, ...__VLS_functionalComponentArgsRest(__VLS_26));
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "note-content" },
});
/** @type {__VLS_StyleScopedClasses['note-content']} */ ;
if (__VLS_ctx.isReady && __VLS_ctx.editorStore.currentDocument) {
    const __VLS_30 = EditorArea;
    // @ts-ignore
    const __VLS_31 = __VLS_asFunctionalComponent1(__VLS_30, new __VLS_30({}));
    const __VLS_32 = __VLS_31({}, ...__VLS_functionalComponentArgsRest(__VLS_31));
}
else if (!__VLS_ctx.isReady) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "loading-state" },
    });
    /** @type {__VLS_StyleScopedClasses['loading-state']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "loading-spinner" },
    });
    /** @type {__VLS_StyleScopedClasses['loading-spinner']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
}
// @ts-ignore
[isReady, isReady, isReady, isReady, editorStore, editorStore, editorStore, createNewDocument, lastUpdated, isSaved, isSaved, wordCount,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
