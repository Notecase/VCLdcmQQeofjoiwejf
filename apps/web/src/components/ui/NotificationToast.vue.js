import { Info, CheckCircle, AlertTriangle, XCircle, X } from 'lucide-vue-next';
import { useNotificationsStore } from '@/stores/notifications';
const notificationsStore = useNotificationsStore();
function getIcon(type) {
    switch (type) {
        case 'success': return CheckCircle;
        case 'warning': return AlertTriangle;
        case 'error': return XCircle;
        default: return Info;
    }
}
function getTypeClass(type) {
    return `toast-${type}`;
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['toast-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['toast-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['toast-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['toast-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['toast-dismiss']} */ ;
let __VLS_0;
/** @ts-ignore @type {typeof __VLS_components.Teleport | typeof __VLS_components.Teleport} */
Teleport;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    to: "body",
}));
const __VLS_2 = __VLS_1({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
const { default: __VLS_5 } = __VLS_3.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "toast-container" },
});
/** @type {__VLS_StyleScopedClasses['toast-container']} */ ;
let __VLS_6;
/** @ts-ignore @type {typeof __VLS_components.TransitionGroup | typeof __VLS_components.TransitionGroup} */
TransitionGroup;
// @ts-ignore
const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
    name: "toast",
}));
const __VLS_8 = __VLS_7({
    name: "toast",
}, ...__VLS_functionalComponentArgsRest(__VLS_7));
const { default: __VLS_11 } = __VLS_9.slots;
for (const [notification] of __VLS_vFor((__VLS_ctx.notificationsStore.notifications))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        key: (notification.id),
        ...{ class: "toast" },
        ...{ class: (__VLS_ctx.getTypeClass(notification.type)) },
    });
    /** @type {__VLS_StyleScopedClasses['toast']} */ ;
    const __VLS_12 = (__VLS_ctx.getIcon(notification.type));
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({
        size: (18),
        ...{ class: "toast-icon" },
    }));
    const __VLS_14 = __VLS_13({
        size: (18),
        ...{ class: "toast-icon" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    /** @type {__VLS_StyleScopedClasses['toast-icon']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "toast-content" },
    });
    /** @type {__VLS_StyleScopedClasses['toast-content']} */ ;
    if (notification.title) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "toast-title" },
        });
        /** @type {__VLS_StyleScopedClasses['toast-title']} */ ;
        (notification.title);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "toast-message" },
    });
    /** @type {__VLS_StyleScopedClasses['toast-message']} */ ;
    (notification.message);
    if (notification.dismissible) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(notification.dismissible))
                        return;
                    __VLS_ctx.notificationsStore.dismiss(notification.id);
                    // @ts-ignore
                    [notificationsStore, notificationsStore, getTypeClass, getIcon,];
                } },
            ...{ class: "toast-dismiss" },
        });
        /** @type {__VLS_StyleScopedClasses['toast-dismiss']} */ ;
        let __VLS_17;
        /** @ts-ignore @type {typeof __VLS_components.X} */
        X;
        // @ts-ignore
        const __VLS_18 = __VLS_asFunctionalComponent1(__VLS_17, new __VLS_17({
            size: (14),
        }));
        const __VLS_19 = __VLS_18({
            size: (14),
        }, ...__VLS_functionalComponentArgsRest(__VLS_18));
    }
    // @ts-ignore
    [];
}
// @ts-ignore
[];
var __VLS_9;
// @ts-ignore
[];
var __VLS_3;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
