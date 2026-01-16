import { computed, ref, nextTick, watch } from 'vue';
import { useEditorStore } from '@/stores';
import { FileText, Plus, X, Save } from 'lucide-vue-next';
const editorStore = useEditorStore();
const tabsContainerRef = ref(null);
const isSaved = computed(() => editorStore.activeTab?.isSaved ?? true);
const wordCount = computed(() => {
    const wc = editorStore.wordCount;
    return `${wc.words} words`;
});
async function saveDocument() {
    await editorStore.saveDocument();
}
function createNewDocument() {
    editorStore.createDocument('Untitled');
    // Scroll to show new tab
    nextTick(() => {
        if (tabsContainerRef.value) {
            tabsContainerRef.value.scrollLeft = tabsContainerRef.value.scrollWidth;
        }
    });
}
// Auto-scroll to active tab when it changes
watch(() => editorStore.activeTabId, () => {
    nextTick(() => {
        const activeEl = tabsContainerRef.value?.querySelector('.tab.active');
        if (activeEl) {
            activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    });
});
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['tabs-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['tab']} */ ;
/** @type {__VLS_StyleScopedClasses['tab']} */ ;
/** @type {__VLS_StyleScopedClasses['tab']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['tab']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['tab']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-title']} */ ;
/** @type {__VLS_StyleScopedClasses['tab']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-close']} */ ;
/** @type {__VLS_StyleScopedClasses['tab']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-close']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-close']} */ ;
/** @type {__VLS_StyleScopedClasses['new-tab-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
    ...{ class: "tab-banner" },
});
/** @type {__VLS_StyleScopedClasses['tab-banner']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "left-zone" },
});
/** @type {__VLS_StyleScopedClasses['left-zone']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.saveDocument) },
    ...{ class: "save-btn" },
    ...{ class: ({ saved: __VLS_ctx.isSaved }) },
    disabled: (__VLS_ctx.isSaved || __VLS_ctx.editorStore.isSaving),
    title: (__VLS_ctx.isSaved ? 'Saved' : 'Save (Cmd+S)'),
});
/** @type {__VLS_StyleScopedClasses['save-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['saved']} */ ;
let __VLS_0;
/** @ts-ignore @type {typeof __VLS_components.Save} */
Save;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    size: (16),
}));
const __VLS_2 = __VLS_1({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "word-count" },
});
/** @type {__VLS_StyleScopedClasses['word-count']} */ ;
(__VLS_ctx.wordCount);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "tabs-zone" },
    ref: "tabsContainerRef",
});
/** @type {__VLS_StyleScopedClasses['tabs-zone']} */ ;
for (const [tab, index] of __VLS_vFor((__VLS_ctx.editorStore.tabs))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.editorStore.switchTab(tab.id);
                // @ts-ignore
                [saveDocument, isSaved, isSaved, isSaved, editorStore, editorStore, editorStore, wordCount,];
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
// @ts-ignore
[createNewDocument,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
