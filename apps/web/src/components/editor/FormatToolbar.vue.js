import { computed } from 'vue';
import { useEditorStore, usePreferencesStore } from '@/stores';
import { Bold, Italic, Underline, Strikethrough, Code, Link, List, ListOrdered, Quote, Image, CheckSquare, Table, Sparkles } from 'lucide-vue-next';
const editorStore = useEditorStore();
const preferencesStore = usePreferencesStore();
const props = defineProps();
// Format functions
function format(type) {
    if (!props.muyaInstance)
        return;
    props.muyaInstance.format(type);
}
function updateParagraph(type) {
    if (!props.muyaInstance)
        return;
    props.muyaInstance.updateParagraph(type);
}
function insertTable() {
    if (!props.muyaInstance)
        return;
    props.muyaInstance.tablePicker?.show({ row: 3, column: 3 });
}
function insertImage() {
    if (!props.muyaInstance)
        return;
    props.muyaInstance.imageSelector?.show();
}
function insertTaskList() {
    if (!props.muyaInstance)
        return;
    props.muyaInstance.updateParagraph('task-list');
}
function insertCodeBlock() {
    if (!props.muyaInstance)
        return;
    props.muyaInstance.updateParagraph('pre');
}
function handleAI() {
    // TODO: Open AI panel
    console.log('AI clicked');
}
// Toolbar visibility
const isVisible = computed(() => !preferencesStore.hideToolbar);
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['format-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['format-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['format-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-divider']} */ ;
if (__VLS_ctx.isVisible) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "format-toolbar-wrapper" },
    });
    /** @type {__VLS_StyleScopedClasses['format-toolbar-wrapper']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "format-toolbar" },
    });
    /** @type {__VLS_StyleScopedClasses['format-toolbar']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "toolbar-group" },
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-group']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.isVisible))
                    return;
                __VLS_ctx.format('strong');
                // @ts-ignore
                [isVisible, format,];
            } },
        ...{ class: "toolbar-btn" },
        title: "Bold (Ctrl+B)",
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
    let __VLS_0;
    /** @ts-ignore @type {typeof __VLS_components.Bold} */
    Bold;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        size: (16),
    }));
    const __VLS_2 = __VLS_1({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.isVisible))
                    return;
                __VLS_ctx.format('em');
                // @ts-ignore
                [format,];
            } },
        ...{ class: "toolbar-btn" },
        title: "Italic (Ctrl+I)",
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
    let __VLS_5;
    /** @ts-ignore @type {typeof __VLS_components.Italic} */
    Italic;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
        size: (16),
    }));
    const __VLS_7 = __VLS_6({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.isVisible))
                    return;
                __VLS_ctx.format('u');
                // @ts-ignore
                [format,];
            } },
        ...{ class: "toolbar-btn" },
        title: "Underline",
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
    let __VLS_10;
    /** @ts-ignore @type {typeof __VLS_components.Underline} */
    Underline;
    // @ts-ignore
    const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
        size: (16),
    }));
    const __VLS_12 = __VLS_11({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_11));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.isVisible))
                    return;
                __VLS_ctx.format('del');
                // @ts-ignore
                [format,];
            } },
        ...{ class: "toolbar-btn" },
        title: "Strikethrough",
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
    let __VLS_15;
    /** @ts-ignore @type {typeof __VLS_components.Strikethrough} */
    Strikethrough;
    // @ts-ignore
    const __VLS_16 = __VLS_asFunctionalComponent1(__VLS_15, new __VLS_15({
        size: (16),
    }));
    const __VLS_17 = __VLS_16({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_16));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "toolbar-divider" },
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-divider']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "toolbar-group" },
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-group']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.isVisible))
                    return;
                __VLS_ctx.updateParagraph('heading 1');
                // @ts-ignore
                [updateParagraph,];
            } },
        ...{ class: "toolbar-btn heading-btn" },
        title: "Heading 1",
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['heading-btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.isVisible))
                    return;
                __VLS_ctx.updateParagraph('heading 2');
                // @ts-ignore
                [updateParagraph,];
            } },
        ...{ class: "toolbar-btn heading-btn" },
        title: "Heading 2",
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['heading-btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.isVisible))
                    return;
                __VLS_ctx.updateParagraph('heading 3');
                // @ts-ignore
                [updateParagraph,];
            } },
        ...{ class: "toolbar-btn heading-btn" },
        title: "Heading 3",
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['heading-btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "toolbar-divider" },
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-divider']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "toolbar-group" },
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-group']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.isVisible))
                    return;
                __VLS_ctx.updateParagraph('ul-bullet');
                // @ts-ignore
                [updateParagraph,];
            } },
        ...{ class: "toolbar-btn" },
        title: "Bullet List",
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
    let __VLS_20;
    /** @ts-ignore @type {typeof __VLS_components.List} */
    List;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent1(__VLS_20, new __VLS_20({
        size: (16),
    }));
    const __VLS_22 = __VLS_21({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.isVisible))
                    return;
                __VLS_ctx.updateParagraph('ol-order');
                // @ts-ignore
                [updateParagraph,];
            } },
        ...{ class: "toolbar-btn" },
        title: "Numbered List",
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
    let __VLS_25;
    /** @ts-ignore @type {typeof __VLS_components.ListOrdered} */
    ListOrdered;
    // @ts-ignore
    const __VLS_26 = __VLS_asFunctionalComponent1(__VLS_25, new __VLS_25({
        size: (16),
    }));
    const __VLS_27 = __VLS_26({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_26));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.insertTaskList) },
        ...{ class: "toolbar-btn" },
        title: "Task List",
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
    let __VLS_30;
    /** @ts-ignore @type {typeof __VLS_components.CheckSquare} */
    CheckSquare;
    // @ts-ignore
    const __VLS_31 = __VLS_asFunctionalComponent1(__VLS_30, new __VLS_30({
        size: (16),
    }));
    const __VLS_32 = __VLS_31({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_31));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.isVisible))
                    return;
                __VLS_ctx.updateParagraph('blockquote');
                // @ts-ignore
                [updateParagraph, insertTaskList,];
            } },
        ...{ class: "toolbar-btn" },
        title: "Quote",
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
    let __VLS_35;
    /** @ts-ignore @type {typeof __VLS_components.Quote} */
    Quote;
    // @ts-ignore
    const __VLS_36 = __VLS_asFunctionalComponent1(__VLS_35, new __VLS_35({
        size: (16),
    }));
    const __VLS_37 = __VLS_36({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_36));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.insertCodeBlock) },
        ...{ class: "toolbar-btn" },
        title: "Code Block",
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
    let __VLS_40;
    /** @ts-ignore @type {typeof __VLS_components.Code} */
    Code;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent1(__VLS_40, new __VLS_40({
        size: (16),
    }));
    const __VLS_42 = __VLS_41({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "toolbar-divider" },
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-divider']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "toolbar-group" },
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-group']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.insertImage) },
        ...{ class: "toolbar-btn" },
        title: "Insert Image",
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
    let __VLS_45;
    /** @ts-ignore @type {typeof __VLS_components.Image} */
    Image;
    // @ts-ignore
    const __VLS_46 = __VLS_asFunctionalComponent1(__VLS_45, new __VLS_45({
        size: (16),
    }));
    const __VLS_47 = __VLS_46({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_46));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.isVisible))
                    return;
                __VLS_ctx.format('link');
                // @ts-ignore
                [format, insertCodeBlock, insertImage,];
            } },
        ...{ class: "toolbar-btn" },
        title: "Insert Link",
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
    let __VLS_50;
    /** @ts-ignore @type {typeof __VLS_components.Link} */
    Link;
    // @ts-ignore
    const __VLS_51 = __VLS_asFunctionalComponent1(__VLS_50, new __VLS_50({
        size: (16),
    }));
    const __VLS_52 = __VLS_51({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_51));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.insertTable) },
        ...{ class: "toolbar-btn" },
        title: "Insert Table",
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
    let __VLS_55;
    /** @ts-ignore @type {typeof __VLS_components.Table} */
    Table;
    // @ts-ignore
    const __VLS_56 = __VLS_asFunctionalComponent1(__VLS_55, new __VLS_55({
        size: (16),
    }));
    const __VLS_57 = __VLS_56({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_56));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "toolbar-divider" },
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-divider']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.handleAI) },
        ...{ class: "toolbar-btn ai-btn" },
        title: "AI Assistant",
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['ai-btn']} */ ;
    let __VLS_60;
    /** @ts-ignore @type {typeof __VLS_components.Sparkles} */
    Sparkles;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent1(__VLS_60, new __VLS_60({
        size: (16),
    }));
    const __VLS_62 = __VLS_61({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_61));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
}
// @ts-ignore
[insertTable, handleAI,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
