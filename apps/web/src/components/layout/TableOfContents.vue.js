import { computed } from 'vue';
import { List } from 'lucide-vue-next';
import { useEditorStore } from '@/stores';
// Recursive component for TOC tree
const TocNode = {
    name: 'TocNode',
    props: ['item', 'scrollToHeading'],
    template: `
    <div class="toc-item-wrapper">
      <button 
        class="toc-item"
        :class="'toc-h' + Math.min(item.level, 6)"
        :style="{ paddingLeft: ((item.level - 1) * 16 + 12) + 'px' }"
        @click="scrollToHeading(item)"
      >
        <span class="toc-label">{{ item.label }}</span>
      </button>
      <template v-if="item.children && item.children.length">
        <TocNode 
          v-for="child in item.children" 
          :key="child.id" 
          :item="child"
          :scrollToHeading="scrollToHeading"
        />
      </template>
    </div>
  `
};
export default {};
const __VLS_self = (await import('vue')).defineComponent({
    components: { TocNode }
});
const __VLS_export = await (async () => {
    const editorStore = useEditorStore();
    // Get TOC from editor store
    const toc = computed(() => editorStore.tableOfContents || []);
    const isEmpty = computed(() => toc.value.length === 0);
    function scrollToHeading(item) {
        // Emit event for editor to scroll
        const event = new CustomEvent('scroll-to-heading', {
            detail: { slug: item.slug }
        });
        window.dispatchEvent(event);
    }
    function getIndentStyle(level) {
        return {
            paddingLeft: `${(level - 1) * 16 + 12}px`
        };
    }
    function getHeadingClass(level) {
        return `toc-h${Math.min(level, 6)}`;
    }
    const __VLS_ctx = {
        ...{},
        ...{},
    };
    const __VLS_componentsOption = { TocNode };
    let __VLS_components;
    let __VLS_intrinsics;
    let __VLS_directives;
    /** @type {__VLS_StyleScopedClasses['toc-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['toc-empty']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "toc-panel" },
    });
    /** @type {__VLS_StyleScopedClasses['toc-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "toc-header" },
    });
    /** @type {__VLS_StyleScopedClasses['toc-header']} */ ;
    let __VLS_0;
    /** @ts-ignore @type {typeof __VLS_components.List} */
    List;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        size: (16),
    }));
    const __VLS_2 = __VLS_1({
        size: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    if (!__VLS_ctx.isEmpty) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "toc-content" },
        });
        /** @type {__VLS_StyleScopedClasses['toc-content']} */ ;
        for (const [item] of __VLS_vFor((__VLS_ctx.toc))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (item.id),
                ...{ class: "toc-tree" },
            });
            /** @type {__VLS_StyleScopedClasses['toc-tree']} */ ;
            let __VLS_5;
            /** @ts-ignore @type {typeof __VLS_components.TocNode} */
            TocNode;
            // @ts-ignore
            const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
                item: (item),
                scrollToHeading: (__VLS_ctx.scrollToHeading),
            }));
            const __VLS_7 = __VLS_6({
                item: (item),
                scrollToHeading: (__VLS_ctx.scrollToHeading),
            }, ...__VLS_functionalComponentArgsRest(__VLS_6));
            // @ts-ignore
            [isEmpty, toc, scrollToHeading,];
        }
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "toc-empty" },
        });
        /** @type {__VLS_StyleScopedClasses['toc-empty']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "empty-icon" },
        });
        /** @type {__VLS_StyleScopedClasses['empty-icon']} */ ;
        let __VLS_10;
        /** @ts-ignore @type {typeof __VLS_components.List} */
        List;
        // @ts-ignore
        const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
            size: (48),
        }));
        const __VLS_12 = __VLS_11({
            size: (48),
        }, ...__VLS_functionalComponentArgsRest(__VLS_11));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "empty-hint" },
        });
        /** @type {__VLS_StyleScopedClasses['empty-hint']} */ ;
    }
    // @ts-ignore
    [];
    return (await import('vue')).defineComponent({});
})();
