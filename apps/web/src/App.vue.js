import { computed } from 'vue';
import { usePreferencesStore, useLayoutStore } from './stores';
import CommandPalette from './components/ui/CommandPalette.vue';
import NotificationToast from './components/ui/NotificationToast.vue';
const preferencesStore = usePreferencesStore();
const layoutStore = useLayoutStore();
const appClasses = computed(() => ({
    'typewriter-mode': preferencesStore.typewriter,
    'focus-mode': preferencesStore.focus || layoutStore.isFocusMode,
    'source-code-mode': layoutStore.isSourceMode,
    'zen-mode': layoutStore.isZenMode
}));
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    id: "inkdown-app",
    ...{ class: (__VLS_ctx.appClasses) },
});
let __VLS_0;
/** @ts-ignore @type {typeof __VLS_components.routerView | typeof __VLS_components.RouterView} */
routerView;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
const __VLS_5 = CommandPalette;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({}));
const __VLS_7 = __VLS_6({}, ...__VLS_functionalComponentArgsRest(__VLS_6));
const __VLS_10 = NotificationToast;
// @ts-ignore
const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({}));
const __VLS_12 = __VLS_11({}, ...__VLS_functionalComponentArgsRest(__VLS_11));
// @ts-ignore
[appClasses,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
