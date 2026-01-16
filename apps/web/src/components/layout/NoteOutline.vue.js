import { ref, computed } from 'vue';
import { useEditorStore } from '@/stores';
const editorStore = useEditorStore();
const isHovered = ref(false);
const tocItems = computed(() => {
    return editorStore.toc || [];
});
function scrollToHeading(heading) {
    // Use Muya's scrollToHeading if available, otherwise scroll to element
    const headingEl = document.querySelector(`[data-head="${heading.slug}"]`);
    if (headingEl) {
        headingEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['outline-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['outline-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['outline-item']} */ ;
/** @type {__VLS_StyleScopedClasses['outline-item']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['outline-item']} */ ;
/** @type {__VLS_StyleScopedClasses['outline-item']} */ ;
/** @type {__VLS_StyleScopedClasses['outline-item']} */ ;
/** @type {__VLS_StyleScopedClasses['outline-item']} */ ;
/** @type {__VLS_StyleScopedClasses['outline-item']} */ ;
/** @type {__VLS_StyleScopedClasses['outline-item']} */ ;
/** @type {__VLS_StyleScopedClasses['outline-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['outline-empty']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onMouseenter: (...[$event]) => {
            __VLS_ctx.isHovered = true;
            // @ts-ignore
            [isHovered,];
        } },
    ...{ onMouseleave: (...[$event]) => {
            __VLS_ctx.isHovered = false;
            // @ts-ignore
            [isHovered,];
        } },
    ...{ class: "note-outline" },
});
/** @type {__VLS_StyleScopedClasses['note-outline']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ class: "outline-toggle" },
    ...{ class: ({ active: __VLS_ctx.isHovered }) },
});
/** @type {__VLS_StyleScopedClasses['outline-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "outline-icon" },
});
/** @type {__VLS_StyleScopedClasses['outline-icon']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "line line-1" },
});
/** @type {__VLS_StyleScopedClasses['line']} */ ;
/** @type {__VLS_StyleScopedClasses['line-1']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "line line-2" },
});
/** @type {__VLS_StyleScopedClasses['line']} */ ;
/** @type {__VLS_StyleScopedClasses['line-2']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "line line-3" },
});
/** @type {__VLS_StyleScopedClasses['line']} */ ;
/** @type {__VLS_StyleScopedClasses['line-3']} */ ;
let __VLS_0;
/** @ts-ignore @type {typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
Transition;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    name: "slide-fade",
}));
const __VLS_2 = __VLS_1({
    name: "slide-fade",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
const { default: __VLS_5 } = __VLS_3.slots;
if (__VLS_ctx.isHovered) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "outline-dropdown" },
    });
    /** @type {__VLS_StyleScopedClasses['outline-dropdown']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "outline-header" },
    });
    /** @type {__VLS_StyleScopedClasses['outline-header']} */ ;
    if (__VLS_ctx.tocItems.length > 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "outline-list" },
        });
        /** @type {__VLS_StyleScopedClasses['outline-list']} */ ;
        for (const [item, index] of __VLS_vFor((__VLS_ctx.tocItems))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.isHovered))
                            return;
                        if (!(__VLS_ctx.tocItems.length > 0))
                            return;
                        __VLS_ctx.scrollToHeading(item);
                        // @ts-ignore
                        [isHovered, isHovered, tocItems, tocItems, scrollToHeading,];
                    } },
                key: (index),
                ...{ class: "outline-item" },
                ...{ class: ({
                        active: item.active,
                        [`level-${item.lvl || item.level || 1}`]: true
                    }) },
            });
            /** @type {__VLS_StyleScopedClasses['outline-item']} */ ;
            /** @type {__VLS_StyleScopedClasses['active']} */ ;
            (item.content || item.title);
            // @ts-ignore
            [];
        }
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "outline-empty" },
        });
        /** @type {__VLS_StyleScopedClasses['outline-empty']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    }
}
// @ts-ignore
[];
var __VLS_3;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
